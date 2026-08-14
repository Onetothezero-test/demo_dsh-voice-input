// 离线中文语音识别演示 —— 浏览器端逻辑（ES Module）
// 链路：麦克风(getUserMedia) → 16kHz 单声道 → sherpa-onnx WASM（浏览器构建）→ 文字上屏
import { initVADASRModule, OfflineRecognizer } from './sherpaw/index.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('status'), recordBtn = $('record'), demoBtn = $('demo'),
      resultEl = $('result'), metaEl = $('meta');

const SAMPLE_RATE = 16000;
const MODEL = {
  'model.int8.onnx': 'model/model.int8.onnx',
  'tokens.txt': 'model/tokens.txt',
  'bbpe.model': 'model/bbpe.model',
};

let module = null;
let recognizer = null;

// ---------- 1. 初始化 WASM 运行时 + 写入模型文件 ----------
async function initEngine() {
  statusEl.textContent = '正在初始化 WASM 运行时…';
  module = await initVADASRModule();
  statusEl.textContent = '正在加载模型文件（59.8MB）…';
  for (const [name, url] of Object.entries(MODEL)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`模型文件下载失败: ${url} (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    module.FS_createDataFile('/', name, bytes, true, true, true);
  }
  return module;
}

// ---------- 2. 创建离线识别器 ----------
function createRecognizer(m) {
  return new OfflineRecognizer({
    featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
    modelConfig: {
      zipformerCtc: { model: 'model.int8.onnx' },
      tokens: 'tokens.txt',
      modelingUnit: 'bpe',
      bpeVocab: 'bbpe.model',
      numThreads: 1,
      provider: 'cpu',
      debug: 0,
    },
    decodingMethod: 'greedy_search',
    maxActivePaths: 4,
    hotwordsFile: '',
    hotwordsScore: 1.5,
    ruleFsts: '',
    ruleFars: '',
  }, m);
}

// ---------- 3. 识别一段 PCM ----------
function recognize(samples, sampleRate) {
  if (!samples || samples.length < SAMPLE_RATE * 0.4) {
    resultEl.className = 'placeholder';
    resultEl.textContent = '录音太短，没听清内容，请再说一次。';
    metaEl.textContent = '';
    recordBtn.disabled = false;
    return;
  }
  statusEl.textContent = '识别中…';
  const t0 = performance.now();
  const stream = recognizer.createStream();
  stream.acceptWaveform(sampleRate, samples);
  recognizer.decode(stream);
  const r = recognizer.getResult(stream);
  const ms = Math.round(performance.now() - t0);
  const text = (r.text || '').trim();
  resultEl.className = '';
  resultEl.textContent = text || '（未识别出内容）';
  metaEl.textContent = (metaEl.textContent ? metaEl.textContent + ' · ' : '') + `解码 ${ms}ms · 离线`;
  statusEl.textContent = '就绪，按住按钮说话。';
}

// ---------- 4. 麦克风采集（按住说话） ----------
// 速率策略：AudioContext 用设备原生采样率（48k），ScriptProcessor 输入缓冲即该速率；
// 松开后统一用浏览器内置重采样器（OfflineAudioContext）转 16kHz 再送识别。
// （之前指定 {sampleRate:16000} 在 Windows Chrome 上不可靠，会把 48k 音频当 16k 喂入 → 语音拉长、重复出字。）
let audioCtx = null, srcNode = null, processor = null, mediaStream = null,
    chunks = [], recording = false, starting = false;

async function startRecord() {
  if (starting || recording || audioCtx) return; // 防重复启动（双击/快速连点）
  starting = true;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    srcNode = audioCtx.createMediaStreamSource(mediaStream);
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    chunks = [];
    processor.onaudioprocess = (e) => {
      if (recording) chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    srcNode.connect(processor);
    processor.connect(audioCtx.destination); // 静音输出，仅为保持处理链
    recording = true;
    recordBtn.classList.add('recording');
    statusEl.textContent = `正在录音…（${audioCtx.sampleRate}Hz，松开结束）`;
  } catch (err) {
    statusEl.textContent = '麦克风不可用：' + (err.name || err.message) + '（可改用测试音频按钮）';
    recordBtn.disabled = false;
  } finally {
    starting = false;
  }
}

async function stopRecord() {
  if (!recording) return;
  recording = false;
  recordBtn.classList.remove('recording');
  const ctxRate = audioCtx ? audioCtx.sampleRate : SAMPLE_RATE;
  const src = srcNode, proc = processor, ctx = audioCtx, ms = mediaStream;
  srcNode = null; processor = null; audioCtx = null; mediaStream = null;
  let len = 0; for (const c of chunks) len += c.length;
  const all = new Float32Array(len);
  let off = 0; for (const c of chunks) { all.set(c, off); off += c.length; }
  chunks = [];
  try { src.disconnect(); proc.disconnect(); } catch {}
  try { ctx.close(); } catch {}
  try { ms.getTracks().forEach((t) => t.stop()); } catch {}
  if (all.length < SAMPLE_RATE * 0.4) {
    resultEl.className = 'placeholder';
    resultEl.textContent = '录音太短，没听清内容，请再说一次。';
    metaEl.textContent = '';
    recordBtn.disabled = false;
    return;
  }
  statusEl.textContent = '重采样中…';
  let samples = ctxRate === SAMPLE_RATE ? all : await resampleOffline(all, ctxRate, SAMPLE_RATE);
  samples = normalizePeak(samples);
  recordBtn.disabled = false;
  metaEl.textContent = `录音 ${(all.length / ctxRate).toFixed(1)}s@${ctxRate}Hz → 16kHz`;
  recognize(samples, SAMPLE_RATE);
}

// 浏览器内置高质量重采样（OfflineAudioContext）
async function resampleOffline(src, from, to) {
  const len = Math.max(1, Math.round(src.length * to / from));
  const off = new OfflineAudioContext(1, len, to);
  const buf = off.createBuffer(1, src.length, from);
  buf.copyToChannel(src, 0);
  const node = off.createBufferSource();
  node.buffer = buf;
  node.connect(off.destination);
  node.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

// 峰值归一化：把响度归一，避免小声/大声影响识别
function normalizePeak(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > peak) peak = a; }
  if (peak > 0.005 && peak < 1) {
    const g = 0.9 / peak;
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) out[i] = samples[i] * g;
    return out;
  }
  return samples;
}

// ---------- 5. WAV 解码（8/16-bit PCM，单声道；测试音频用） ----------
function decodeWav(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = dv.getUint32(24, true);
  const channels = dv.getUint16(22, true);
  const bits = dv.getUint16(34, true);
  let dataOffset = -1;
  for (let i = 12; i < bytes.length - 8; i++) {
    if (bytes[i] === 0x64 && bytes[i+1] === 0x61 && bytes[i+2] === 0x74 && bytes[i+3] === 0x61) { // 'data'
      dataOffset = i + 8; break;
    }
  }
  if (dataOffset < 0) throw new Error('WAV 中没有 data 块');
  const bytesPerSample = bits / 8;
  const n = Math.floor((bytes.length - dataOffset) / bytesPerSample / channels);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const off = dataOffset + i * bytesPerSample * channels;
    if (bits === 8) samples[i] = (bytes[off] - 128) / 128;
    else samples[i] = dv.getInt16(off, true) / 32768;
  }
  return { samples, sampleRate };
}

// ---------- 6. 测试音频演示（无麦克风时） ----------
async function runDemoWav() {
  demoBtn.disabled = true;
  statusEl.textContent = '读取测试音频…';
  try {
    const res = await fetch('test_zh.wav');
    const bytes = new Uint8Array(await res.arrayBuffer());
    const wav = decodeWav(bytes);
    const samples = wav.sampleRate === SAMPLE_RATE ? wav.samples : await resampleOffline(wav.samples, wav.sampleRate, SAMPLE_RATE);
    recognize(normalizePeak(samples), SAMPLE_RATE);
  } catch (err) {
    statusEl.textContent = '测试音频失败：' + err.message;
  }
  demoBtn.disabled = false;
}

// ---------- 事件绑定 ----------
recordBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (recordBtn.disabled) return; startRecord(); });
recordBtn.addEventListener('pointerup', stopRecord);
recordBtn.addEventListener('pointercancel', stopRecord);
recordBtn.addEventListener('pointerleave', stopRecord);

demoBtn.addEventListener('click', runDemoWav);

// ---------- 启动 ----------
(async () => {
  try {
    module = await initEngine();
    const t0 = performance.now();
    recognizer = createRecognizer(module);
    statusEl.textContent = `模型就绪（加载 ${Math.round((performance.now() - t0) / 1000)}s）。按住按钮说话，或点测试音频。`;
    recordBtn.disabled = false;
    demoBtn.disabled = false;
  } catch (err) {
    console.error(err);
    statusEl.textContent = '初始化失败：' + (err && err.message ? err.message : err);
  }
})();
