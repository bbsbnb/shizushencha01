@echo off
chcp 65001 >nul
REM 下载 cloudflared（Cloudflare Quick Tunnel 工具，用于 publish-tunnel.bat 发布公网链接）
cd /d "%~dp0"

if exist cloudflared.exe (
  echo cloudflared.exe 已存在，无需下载
  pause
  exit /b 0
)

set "URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
echo 正在下载 cloudflared（约 55MB，断点续传，可随时重新运行本脚本继续）...
curl.exe -L -C - -o cloudflared.exe "%URL%"
if exist cloudflared.exe (
  echo 下载完成：cloudflared.exe
) else (
  echo 下载失败。若网络受限，可先挂代理后重试：
  echo   set HTTPS_PROXY=http://127.0.0.1:7890 ^&^& 再次运行本脚本
)
pause
