# voice-input-plugin 回退脚本（还原备份 + 卸载包）
$ErrorActionPreference = 'Stop'

$patch = Join-Path $env:USERPROFILE '.dsh\profiles\web\cordis.patch.yml'

# 1) 用最新备份还原 patch
$bak = Get-ChildItem "$patch.bak-*" -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($bak) {
  Copy-Item $bak.FullName $patch -Force
  Write-Host "[1/2] 已从备份还原 patch: $($bak.Name)" -ForegroundColor Green
} else {
  Write-Host '[1/2] 未找到备份，尝试手工移除 voice-input 行...' -ForegroundColor Yellow
  $content = Get-Content $patch -Raw
  $new = $content -replace '(?ms)^\s*# --- voice-input-plugin[^\r\n]*\r?\n\s*- insert:\r?\n\s*- id: voice-input\r?\n\s*name: voice-input-plugin\r?\n?', ''
  $new = $new -replace '(?m)^\s*\[\]\s*$', "`n[]`n"
  Set-Content -Path $patch -Value $new -Encoding utf8
}

# 2) 卸载包
Write-Host '[2/2] 卸载 voice-input-plugin ...'
npx dsh plugin --profile web remove voice-input-plugin
if ($LASTEXITCODE -ne 0) { Write-Host '卸载命令失败（见上方输出），可手动执行: npx dsh plugin --profile web remove voice-input-plugin' -ForegroundColor Yellow }

Write-Host ''
Write-Host '回退完成。重启 harness 后插件即消失。' -ForegroundColor Green
