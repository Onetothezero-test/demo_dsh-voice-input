// voice-input-plugin —— 客户端半边（浏览器 cordis 插件）
// 在 composer 工具行左端挂麦克风按钮：按住说话 → getUserMedia 采集（设备原生采样率）
// → OfflineAudioContext 高质量重采样 16kHz → 峰值归一化 → 本地 WASM 识别
// → inputActions.setDraft() 把文字写入输入框（供编辑后发送）。
// WASM 运行时与模型由宿主半托管在 /voice-input-assets/*（同一源）。
window.__ModuleLoader__.load({
  id: 'voice-input-plugin',
  factory: (require) => {
    const React = require('react');
    const { useState, useEffect, useRef } = React;

    const SAMPLE_RATE = 16000;
    const ASSET = '/voice-input-assets';
    const MODEL = {
      'model.int8.onnx': 'model/model.int8.onnx',
      'tokens.txt': 'model/tokens.txt',
      'bbpe.model': 'model/bbpe.model',
    };

    // ---------- 识别引擎（懒加载一次，缓存于模块作用域） ----------
    let enginePromise = null;
    function loadEngine() {
      if (!enginePromise) {
        enginePromise = (async () => {
          const mod = await import(ASSET + '/sherpaw/index.js');
          const module = await mod.initVADASRModule();
          for (const [name, url] of Object.entries(MODEL)) {
            const res = await fetch(ASSET + '/' + url);
            if (!res.ok) throw new Error('模型文件下载失败 ' + url + ' (' + res.status + ')');
            const bytes = new Uint8Array(await res.arrayBuffer());
            module.FS_createDataFile('/', name, bytes, true, true, true);
          }
          const recognizer = new mod.OfflineRecognizer({
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
          }, module);
          return { recognizer };
        })().catch((e) => { enginePromise = null; throw e; }); // 失败允许重试
      }
      return enginePromise;
    }

    // ---------- 音频工具（与演示页同一套已验证管线） ----------
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

    // ---------- 麦克风按钮组件 ----------
    // props 由 conversation.input.left 槽位提供：
    //   inputActions.setDraft(text)   —— 写入输入框草稿
    //   input.draft                   —— 当前草稿（快照）
    function VoiceButton(props) {
      const [state, setState] = useState('loading'); // loading|ready|recording|decoding|error
      const [hint, setHint] = useState('');
      const r = useRef({ chunks: [], recording: false, starting: false, audioCtx: null, src: null, proc: null, stream: null });

      // 挂载后预加载引擎
      useEffect(() => {
        let alive = true;
        loadEngine().then(() => { if (alive) setState('ready'); })
          .catch((e) => { console.error('[voice-input] engine load failed', e); if (alive) { setState('error'); setHint('识别引擎加载失败'); } });
        return () => { alive = false; };
      }, []);

      async function startRecord() {
        const s = r.current;
        if (s.starting || s.recording || s.audioCtx) return;
        s.starting = true;
        try {
          if (state !== 'ready') await loadEngine();
          s.stream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
          });
          s.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          s.src = s.audioCtx.createMediaStreamSource(s.stream);
          s.proc = s.audioCtx.createScriptProcessor(4096, 1, 1);
          s.chunks = [];
          s.proc.onaudioprocess = (e) => {
            if (s.recording) s.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
          };
          s.src.connect(s.proc);
          s.proc.connect(s.audioCtx.destination);
          s.recording = true;
          setState('recording');
          setHint('');
        } catch (err) {
          console.error('[voice-input] record start failed', err);
          setHint('麦克风不可用：' + (err.name || err.message));
          setState('ready');
        } finally {
          s.starting = false;
        }
      }

      async function stopRecord() {
        const s = r.current;
        if (!s.recording) return;
        s.recording = false;
        const ctxRate = s.audioCtx ? s.audioCtx.sampleRate : SAMPLE_RATE;
        const { src, proc, audioCtx, stream } = s;
        s.src = null; s.proc = null; s.audioCtx = null; s.stream = null;
        let len = 0; for (const c of s.chunks) len += c.length;
        const all = new Float32Array(len);
        let off = 0; for (const c of s.chunks) { all.set(c, off); off += c.length; }
        s.chunks = [];
        try { src.disconnect(); proc.disconnect(); } catch {}
        try { audioCtx.close(); } catch {}
        try { stream.getTracks().forEach((t) => t.stop()); } catch {}
        if (all.length < SAMPLE_RATE * 0.4) { setHint('太短，请再说一次'); setState('ready'); return; }

        setState('decoding');
        try {
          const { recognizer } = await loadEngine();
          let samples = ctxRate === SAMPLE_RATE ? all : await resampleOffline(all, ctxRate, SAMPLE_RATE);
          samples = normalizePeak(samples);
          const stream2 = recognizer.createStream();
          stream2.acceptWaveform(SAMPLE_RATE, samples);
          recognizer.decode(stream2);
          const result = recognizer.getResult(stream2);
          const text = (result.text || '').trim();
          if (!text) { setHint('未识别出内容'); setState('ready'); return; }
          const existing = (props.input && props.input.draft || '').trim();
          props.inputActions.setDraft(existing ? existing + ' ' + text : text);
          setHint('已写入输入框');
          setState('ready');
        } catch (err) {
          console.error('[voice-input] decode failed', err);
          setHint('识别失败：' + (err.message || err));
          setState('ready');
        }
      }

      const isBusy = state === 'recording' || state === 'decoding';
      return React.createElement(
        'button',
        {
          type: 'button',
          title: hint || (state === 'ready' ? '按住说话（离线中文识别）' : '语音输入加载中…'),
          onPointerDown: (e) => { e.preventDefault(); if (state === 'ready' || state === 'error') startRecord(); },
          onPointerUp: stopRecord,
          onPointerCancel: stopRecord,
          onPointerLeave: stopRecord,
          style: {
            width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(128,138,160,0.35)',
            background: state === 'recording' ? '#ff4d5e' : 'transparent',
            color: state === 'recording' ? '#fff' : '#8b97ad',
            cursor: state === 'ready' || state === 'error' ? 'pointer' : 'wait',
            fontSize: 15, lineHeight: 1, padding: 0, flex: '0 0 auto',
            opacity: state === 'loading' ? 0.45 : 1,
          },
        },
        state === 'recording' ? '⏺' : (state === 'decoding' ? '⋯' : '🎤'),
      );
    }

    // ---------- 插件入口 ----------
    const inject = ['slots'];
    function apply(ctx) {
      const slots = ctx.get('slots');
      if (!slots) return;
      slots.inject('conversation.input.left', () => slots.register(
        { name: 'conversation.input.left', id: 'voice-input' },
        (props) => React.createElement(VoiceButton, props),
      ));
    }

    return { apply, inject };
  },
});
