# voice-input-plugin 安装脚本（备份优先，可逆）
$ErrorActionPreference = 'Stop'

$pluginDir = $PSScriptRoot   # 脚本所在目录即插件目录（克隆到任何位置都可用）
$patch = Join-Path $env:USERPROFILE '.dsh\profiles\web\cordis.patch.yml'

if (-not (Test-Path $patch)) { Write-Host "未找到 patch 文件: $patch" -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $pluginDir 'package.json'))) { Write-Host "未找到插件目录: $pluginDir" -ForegroundColor Red; exit 1 }

# 1) 备份
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bak = "$patch.bak-$stamp"
Copy-Item $patch $bak
Write-Host "[1/3] 已备份 patch -> $bak" -ForegroundColor Green

# 2) 追加插件行（已存在则跳过）
$content = Get-Content $patch -Raw
if ($content -match 'voice-input-plugin') {
  Write-Host '[2/3] patch 中已有 voice-input 行，跳过写入' -ForegroundColor Yellow
} else {
  $block = "`n# --- voice-input-plugin (offline voice input) ---`n- insert:`n    - id: voice-input`n      name: voice-input-plugin`n"
  if ($content -match '(?m)^\s*\[\]\s*$') {
    $new = [regex]::Replace($content, '(?m)^\s*\[\]\s*$', ($block.TrimStart() + "`n"))
    Set-Content -Path $patch -Value $new -Encoding utf8
  } else {
    Add-Content -Path $patch -Value $block -Encoding utf8
  }
  Write-Host '[2/3] 已向 patch 追加 voice-input 插件行' -ForegroundColor Green
}

# 3) 安装包到 web profile
Write-Host '[3/3] 安装插件包到 web profile ...'
#dsh plugin --profile web add $pluginDir
npx dsh plugin --profile web add $pluginDir
if ($LASTEXITCODE -ne 0) { Write-Host 'dsh plugin 安装失败（见上方输出）' -ForegroundColor Red; exit 1 }

Write-Host ''
Write-Host '安装完成。接下来：' -ForegroundColor Green
Write-Host '  1) 关闭 harness 窗口（Ctrl+C 或关闭 cmd）'
Write-Host '  2) 重新启动: dsh web'
Write-Host '  3) 浏览器强刷 Ctrl+F5，输入框工具行左端出现 🎤 按钮'
Write-Host '回退: 运行 rollback.ps1 即可还原'
