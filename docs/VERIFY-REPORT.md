# 语音输入插件 —— 核心技术验证报告

日期：2026-08-14
范围：验证"本机离线中文语音识别"是否可行（插件风险最高的未知点）。
原则：**全部实验产物在本文件夹内，删除本文件夹即完全回退**（未改动 `~/.dsh`、profile 配置、harness 安装目录）。

## 结论（TL;DR）

✅ **可行，且性能余量很大。** 用 sherpa-onnx 官方 WASM 运行时（npm 包内置的 Node WASM 构建，与浏览器是同一套 Emscripten 技术），本机 CPU 单线程：
- 中文整段识别准确（2 个测试音频均输出连贯正确的中文）
- **解码速度约为实时的 18 倍**（5.6s 音频仅 ~300ms 解码）
- 模型加载（冷启动）约 **2.4 秒**——插件需要显示加载进度
- 模型仅 **59.8 MB**（int8 量化），完全离线、音频不出机器

## 验证环境

| 项 | 值 |
|---|---|
| 机器 | Windows（本机） |
| 运行时 | `sherpa-onnx@1.13.5` npm 包（内置 `sherpa-onnx-wasm-nodejs.js` + `.wasm`，Emscripten WASM，onnxruntime 1.27.1） |
| 模型 | `sherpa-onnx-zipformer-ctc-small-zh-int8-2025-07-16`（model.int8.onnx 59.8MB + tokens.txt + bbpe.model） |
| 模型来源 | GitHub Releases `asr-models` tag（官方） |
| 配置 | 离线（非流式）zipformer CTC，modelingUnit=bpe，greedy_search，16kHz/80 维特征 |

## 识别结果

| 音频 | 时长 | 解码耗时 | 识别文本 |
|---|---|---|---|
| test_wavs/0.wav | 5.61s | 308 ms | 对我做了介绍那么我想说的是呢大家如果对我的研究感兴趣呢 |
| test_wavs/1.wav | 5.15s | 284 ms | 重点呢想谈三个问题首先呢就是这一轮全球金融动荡的表现 |
| 另测 int8-1-channel-zh.wav（官方单声道测试音频） | 5.61s | 308 ms | 同 0.wav（内容一致） |

- 实时率（RTF）≈ **0.05**，即 1 秒音频约 55ms 解码——整段识别（按住说话→松开→出字）完全无压力。
- 注意：该 WASM 构建**不支持多线程**（num_threads 被强制为 1），但单线程已足够。

## 对插件方案的直接影响

1. **引擎路线定为"浏览器 WASM"是可行的**（原方案 A）。`sherpa-onnx-wasm-nodejs` 与浏览器构建同一套技术；浏览器侧用官方 `sherpa-onnx-wasm-simd-v1.13.5-...` 发行包（v1.13.5 release 中有 zh-en 一体包 182MB；正式插件应只用运行时 + 单独模型，保持插件包轻量）。
2. **模型选型确认**：`zipformer-ctc-small-zh-int8`（59.8MB）质量与速度都达标，是 P0 的合适默认；如需更高准确率再试 larger 模型（速度余量足够大）。
3. **首次加载体验**：模型加载约 2.4s，插件必须做"加载中"状态与模型缓存（仅首次下载，之后本地）。
4. **音频格式**：识别输入为 16kHz 单声道 Float32（[-1,1]）；浏览器采集需重采样（44.1/48k → 16k）。
5. **预留引擎抽象**：本次验证的 JS API（createOfflineRecognizer / acceptWaveform / decode / getResult）就是将来"WASM ↔ 宿主服务"切换的稳定接口面，UI 层不必感知。

## 仍待验证（后续阶段，不属本次范围）

- 浏览器侧：`getUserMedia` 麦克风采集 + 重采样（标准 Web API，低风险）。
- 浏览器 WASM 构建（非 Node 构建）在 Chrome/Edge 的实际加载与推理（同模型，预期相当）。
- harness 集成：composer 按钮挂载、识别文本写入输入框（需在真实 harness 插件环境中验证）。

## 复现方法

```powershell
cd voice-input-verify
npm install sherpa-onnx --cache .\.npm-cache --no-audit --no-fund   # 已装于 runtime\
$env:NODE_PATH = "$PWD\runtime\node_modules"
node run-test.cjs "downloads\sherpa-onnx-zipformer-ctc-small-zh-int8-2025-07-16"
```

## 回退方式

删除整个 `D:\DeepseekHarness Workspace\voice-input-verify` 文件夹（约 157MB，含模型/运行时/缓存/脚本）即可。**本验证未对 harness、`~/.dsh` 或系统做任何持久化改动。**
