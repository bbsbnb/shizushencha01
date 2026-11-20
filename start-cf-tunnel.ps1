# 启动 Cloudflare Quick Tunnel，捕获 *.trycloudflare.com 公网 URL 并验证
$proj = $PSScriptRoot
Set-Location $proj
Remove-Item cf-tunnel.log -ErrorAction SilentlyContinue
Remove-Item cf-url.txt -ErrorAction SilentlyContinue

# 确保本地 3001 在跑
try { Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3001/api/health' -TimeoutSec 5 | Out-Null; "LOCAL-3001-OK" }
catch { "LOCAL-3001-DOWN: $($_.Exception.Message)" }

$proc = Start-Process -FilePath "$proj\cloudflared.exe" -ArgumentList "tunnel","--url","http://localhost:3001" -RedirectStandardOutput "$proj\cf-tunnel-out.log" -RedirectStandardError "$proj\cf-tunnel-err.log" -PassThru
"CF-PID: $($proc.Id)"

$url = $null
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 3
  $c = Get-Content "$proj\cf-tunnel-err.log","$proj\cf-tunnel-out.log" -ErrorAction SilentlyContinue | Out-String
  if ($c -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
    $url = ($c | Select-String -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1).Matches[0].Value
    break
  }
}
"===CAPTURED-URL==="
if ($url) {
  Write-Output $url
  $url | Out-File "$proj\cf-url.txt" -Encoding ascii
  # 通过隧道验证可访问性（本机回环访问 trycloudflare 不一定通，用本地 3001 对照验证隧道后端）
  try {
    $v = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3001/api/health" -TimeoutSec 5
    "BACKEND-HEALTH: $($v.Content)"
  } catch { "BACKEND-HEALTH-FAIL: $($_.Exception.Message)" }
} else {
  "URL-NOT-CAPTURED-YET; LOG-TAIL:"
  Get-Content "$proj\cf-tunnel-err.log","$proj\cf-tunnel-out.log" -ErrorAction SilentlyContinue | Select-Object -Last 15
}
"===CF-PROC==="
Get-Process -Id $proc.Id -ErrorAction SilentlyContinue | Select-Object Id, ProcessName
