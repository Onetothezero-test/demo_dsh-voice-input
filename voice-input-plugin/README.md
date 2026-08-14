# voice-input-plugin —— 离线中文语音输入插件（骨架）

为 DeepSeek Harness 开发的客户端插件：输入框工具行左端一个 🎤 按钮，
**按住说话 → 本机 WASM 识别 → 文字插入输入框（供编辑后发送）**。全程离线，音频不出机器。

## 架构

```
浏览器（客户端半边 lib/client.js）
  🎤 按钮（conversation.input.left 槽位）
   ├─ getUserMedia → AudioContext(设备原生 48kHz) → ScriptProcessor 采集
   ├─ OfflineAudioContext 高质量重采样 → 16kHz → 峰值归一化
   ├─ sherpa-onnx WASM 识别（动态 import /voice-input-assets/sherpaw/...）
   └─ props.inputActions.setDraft(草稿 + 识别文本)   ← 写入输入框

宿主（lib/index.js）
  └─ ctx.webServer.register({ kind:'prefix', path:'/voice-input-assets', handler })
       → 流式托管 assets/ 下 60MB 模型 + 11MB WASM 运行时（长缓存，刷新不重下）
```

- 客户端包格式：`window.__ModuleLoader__.load({id, factory})`，factory 内 `require('react')`；
  包声明见 `package.json` 的 `dsh.client`（platform: web）。
- 模型：`zipformer-ctc-small-zh-int8`（59.8MB，BPE 中文），经 `FS_createDataFile` 注入虚拟 FS。
- 运行时：`@sherpaw/vad-asr` 的浏览器 WASM 构建（无 NODERAWFS，浏览器原生可用）。

## 文件

| 路径 | 说明 |
|---|---|
| lib/index.js | 宿主半：静态资源路由（/voice-input-assets/*） |
| lib/client.js | 客户端半：麦克风按钮 + 采集 + 识别 + setDraft |
| assets/sherpaw/ | sherpa-onnx 浏览器 WASM 运行时（index.js + 胶水 + prebuilt/*.wasm） |
| assets/model/ | 中文模型与词表（59.8MB） |
| INSTALL.md | 安装 / 回退 / 故障排查（备份优先） |

## 安装与回退

见 **INSTALL.md**。要点：`install.ps1`（备份 patch + 追加插件行 + pnpm 安装）→ 重启 harness；
`rollback.ps1`（还原备份 + 卸载包）→ 重启即还原。

## 待完善（骨架之外）

- 模型文件打包进插件（当前 ~75MB）→ 后续可改为首次下载 + 浏览器缓存；
- 设置项（语言切换、是否自动发送、模型选择）；
- 静音检测/流式识别（当前为"松开后整段识别"）；
- 把 `assets/sherpaw` 换成官方浏览器构建（网络可达时），减少第三方依赖。
