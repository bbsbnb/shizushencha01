@echo off
chcp 65001 >nul
REM ============================================================
REM  施工组织设计审核智能体 · 一键发布到公网（Cloudflare 隧道）
REM  用法：双击运行，控制台会打印 https://xxxx.trycloudflare.com
REM  该链接仅在 cloudflared 进程运行时有效；Ctrl+C 或关窗即下线
REM ============================================================
cd /d "%~dp0"

if not exist cloudflared.exe (
  echo [错误] 未找到 cloudflared.exe，请先运行 download-cloudflared.bat 下载
  pause
  exit /b 1
)

REM 1. 启动本地服务（若 3001 已被占用则跳过）
netstat -ano | findstr ":3001" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo [1/3] 启动本地服务 (server/server.js) ...
  start /b node server\server.js
  timeout /t 3 /nobreak >nul
) else (
  echo [1/3] 本地服务已在运行，跳过启动
)

REM 2. 检查前端构建产物
if not exist dist\index.html (
  echo [2/3] 未发现 dist，先构建前端 ...
  npx --yes vite build
) else (
  echo [2/3] dist 已存在
)

REM 3. 启动 Cloudflare 隧道
echo [3/3] 启动公网隧道，请保持本窗口开启 ...
echo ------------------------------------------------------------
echo  公网链接形如：https://xxxxx.trycloudflare.com
echo  （首次建立约需 10~20 秒，见下方日志中的 your URL is 一行）
echo ------------------------------------------------------------
cloudflared.exe tunnel --url http://localhost:3001
echo.
echo 隧道已停止，公网链接已下线。
