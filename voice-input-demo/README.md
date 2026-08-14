# 🎤 离线中文语音输入 —— 浏览器演示页

独立于 harness 的可逆体验页：按住说话 → 本机 WASM 识别 → 文字上屏。

## 启动

```powershell
node "D:\DeepseekHarness Workspace\voice-input-demo\server.mjs" 8099
```

然后浏览器（推荐 Chrome / Edge）打开：**http://127.0.0.1:8099/**（刷新时用 Ctrl+F5 强刷）

## 体验方式

1. **真实麦克风**：点「按住说话」→ 按住按钮说中文 → 松开 → 文字上屏（16kHz 采集，识别约 0.3~0.5s）。
2. **无麦克风/不想授权**：点「▶ 用内置测试音频演示」——走完全相同的识别链路（内置官方中文测试音频，约 5.6s）。

## 技术说明

- **识别引擎**：sherpa-onnx 浏览器 WASM 构建，来自 npm 包 `@sherpaw/vad-asr@0.0.2`（官方 sherpa-onnx 的 Emscripten 浏览器构建，无 NODERAWFS，浏览器原生可用；其 wasm 导出标准 sherpa-onnx C API）。
- **模型**：zipformer-ctc-small-zh-int8（59.8MB），BPE 中文，greedy_search；通过 `FS_createDataFile` 注入 Emscripten 虚拟文件系统。
- **全程离线**：无任何网络请求，音频不出本机。首次加载约 2~4 秒（WASM 初始化 + 模型读入）。
- 浏览器要求：Chrome/Edge 等现代浏览器（WASM SIMD 支持）。

## 已知调试历史（供参考）

- npm 官方包 `sherpa-onnx` 的 wasm 是 **NODERAWFS Node-only** 构建（胶水硬编码 `if(!ENVIRONMENT_IS_NODE) throw`），浏览器不可用——故改用 @sherpaw 的浏览器构建。
- @sherpaw 构建不导出 `FS` 本体，但导出 `FS_createDataFile`；模型文件用 `FS_createDataFile('/', name, bytes, true, true, true)` 注入（MountedFiles 钩子只服务模型读取、不服务配置校验，勿用）。
- 内置测试音频 `test_zh.wav` 为 **8-bit PCM**（89784 字节 = 89784 样本 = 5.61s），页面内置 8/16-bit 解码。
- 麦克风采集曾出现"重复出字/识别质量差"：原因是 `AudioContext({sampleRate:16000})` 在 Windows Chrome 上不可靠（ScriptProcessor 输入缓冲为设备 48kHz，被当 16kHz 喂入 → 语音拉长 3 倍）。已改为：设备原生采样率采集 + `OfflineAudioContext` 高质量重采样到 16kHz + 峰值归一化 + 防重复启动。录音信息会显示在结果下方（`Xs@48000Hz → 16kHz`），可据此核对。

## 回退 / 清理

- 停止服务：关掉运行 server.mjs 的窗口，或 `taskkill /F /PID <服务器进程PID>`。
- 删除整个 `D:\DeepseekHarness Workspace\voice-input-demo` 文件夹即可完全回退（未改动 harness、`~/.dsh` 或系统）。

## 文件清单

| 文件 | 用途 |
|---|---|
| index.html / app.js | 演示页 UI 与逻辑（ES Module；按住说话、重采样、识别上屏） |
| server.mjs | 本地静态服务器（COOP/COEP 头） |
| sherpaw/index.js + vad-asr-B8h_kDdl.js + prebuilt/vad-asr.wasm | sherpa-onnx 浏览器 WASM 运行时（来自 @sherpaw/vad-asr） |
| model/ | 中文模型（int8，59.8MB）与词表 |
| test_zh.wav | 内置测试音频（8-bit PCM） |
