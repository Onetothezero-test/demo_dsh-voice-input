# 🎤 dsh-voice-input —— DeepSeek Harness 离线中文语音输入

这是纯粹使用Deepseek Harness/Deepseek-V4-Flash生成的一个工具插件，个人使用，仅供一乐。
按住说话 → **本机 WASM 识别** → 文字写入输入框（供编辑后发送）。
全程离线，音频不出机器，无需任何云端服务。

## 仓库内容

| 目录 | 说明 |
|---|---|
| `voice-input-plugin/` | **Harness 插件**：composer 工具行左端 🎤 按钮，可安装进 DeepSeek Harness（安装见其 `INSTALL.md`） |
| `voice-input-demo/` | **独立演示页**：不依赖 harness，浏览器打开即体验同一套识别链路 |

## 快速体验（演示页）

```powershell
node voice-input-demo\server.mjs 8099
# 浏览器打开 http://127.0.0.1:8099/
```

点「按住说话」说中文，松开即出字；没有麦克风可点「用内置测试音频演示」。

## 安装到 harness

见 [`voice-input-plugin/INSTALL.md`](voice-input-plugin/INSTALL.md)（备份优先，可一键回退）。

## 技术栈

- 识别引擎：sherpa-onnx 浏览器 WASM（运行时来自 npm 包 `@sherpaw/vad-asr`）
- 中文模型：`sherpa-onnx-zipformer-ctc-small-zh-int8`（59.8MB，BPE）
- 采集链路：getUserMedia → 设备原生采样率 → OfflineAudioContext 高质量重采样 16kHz → 峰值归一化

性能参考：5.6s 音频约 0.4s 解码（CPU 单线程，实时率 ~0.07x）。

## 目录结构

```
voice-input-plugin/
├── lib/index.js     # 宿主半：托管 /voice-input-assets/* 静态资源路由
├── lib/client.js    # 客户端半：麦克风按钮 + 采集 + 识别 + setDraft
├── assets/          # WASM 运行时 + 中文模型
└── install.ps1 / rollback.ps1   # 备份优先的安装/回退
voice-input-demo/
├── index.html / app.js / server.mjs   # 独立演示页
└── model/ sherpaw/ test_zh.wav        # 模型、运行时、测试音频
```

## 许可

本项目代码 **MIT**（见 LICENSE）。打包的第三方组件与模型版权归其各自作者，见 [NOTICE](NOTICE)。
