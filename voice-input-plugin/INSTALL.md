# 安装 voice-input-plugin（备份优先，可回退）

> 本脚本会修改 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml` 并安装包到 web profile。
> 执行前会自动备份 patch 文件（`cordis.patch.yml.bak-时间戳`），回退脚本可一键还原。
> **安装后需要重启 harness 生效。**

## 安装

在 PowerShell 中执行：

```powershell
cd voice-input-plugin   # 克隆仓库后进入插件目录
.\install.ps1
```

脚本做三件事：
1. 备份 `~\.dsh\profiles\web\cordis.patch.yml` → `cordis.patch.yml.bak-<时间戳>`；
2. 向 patch 追加一行插件声明（`- insert: [id: voice-input, name: voice-input-plugin]`，已存在则跳过）；
3. 用 `npx dsh plugin --profile web add <插件目录>` 把包装进 web profile（等价 pnpm add 本地目录；`dsh` 不在 PATH 时用 `npx dsh`）。

之后：**关掉 harness 窗口 → 重新 `dsh web` → 浏览器强刷（Ctrl+F5）**。
输入框工具行左端会出现 🎤 按钮：按住说话，松开后识别文字写入输入框（可编辑后回车发送）。

## 回退

```powershell
cd voice-input-plugin   # 克隆仓库后进入插件目录
.\rollback.ps1
```

脚本会：1) 用最新备份还原 patch 文件；2) `npx dsh plugin --profile web remove voice-input-plugin` 卸载包。
然后重启 harness 即完全还原（演示页 `voice-input-demo\` 与本插件目录互不影响，删文件夹即清理）。

## 手动安装（已验证路径，`dsh` 不在 PATH 时用这条）

> 以下步骤在 2026-08-14 实测通过（cmd 环境，pnpm v11）。

```cmd
:: 1) 备份 patch
copy "%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml" "%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml.bak-manual"

:: 2) 在 cordis.patch.yml 末尾追加：
::    - insert:
::        - id: voice-input
::          name: voice-input-plugin

:: 3) 进入 profile 目录，用 pnpm 安装本地插件（会自动写入 profile package.json 依赖并链接）
cd "%USERPROFILE%\.dsh\profiles\web"
pnpm add "<你的仓库克隆路径>\voice-input-plugin"

:: 4) 验证 node_modules 里有链接
dir node_modules | find "voice-input"

:: 5) 重启 harness（关窗口 → npx @deepseek-ai/dsh web → 浏览器强刷 Ctrl+F5）
```

## 卸载后清理

- `dsh plugin --profile web remove voice-input-plugin`（移除 profile 依赖与 node_modules 条目）
- 从 `cordis.patch.yml` 删除上面那三行（或用备份覆盖）
- 重启 harness

## 故障排查

| 现象 | 检查 |
|---|---|
| 页面无 🎤 按钮 | patch 是否写入？包是否装上（`dsh plugin --profile web list`）？是否重启？浏览器是否强刷？ |
| 按钮灰/转圈 | 首次加载 60MB 模型需要几秒；看浏览器 Console 报错 |
| 点按无反应 | 麦克风权限是否允许；`http://127.0.0.1:3080` 是否带锁（localhost 无碍） |
| 识别重复/哆嗦 | 检查结果下方 `@Hz` 是否 48000（速率错配已修复，不应复现） |
