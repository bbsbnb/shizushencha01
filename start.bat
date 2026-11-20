@echo off
chcp 65001 >nul
REM 施工组织设计（方案）审核智能体 · 一键启动
REM 用法：双击运行，然后浏览器打开 http://localhost:3001
cd /d "%~dp0"

if not exist dist\index.html (
  echo [1/2] 未检测到 dist，先构建前端...
  npx --yes vite build || goto :err
) else (
  echo [1/2] dist 已存在，跳过构建（如需重建请运行 npx vite build）
)

set NODEEXE=node
REM 系统 PATH 上的 node 可能是失效 shim，优先使用 AgnesCode 便携版
if exist "D:\AI日志\AgnesCode\resources\slide_export_runtime\node\node.exe" (
  set NODEEXE=D:\AI日志\AgnesCode\resources\slide_export_runtime\node\node.exe
)

echo [2/2] 启动后端服务: %NODEEXE% server/server.js
%NODEEXE% server/server.js

:err
echo 启动失败，请检查 node 是否可用。
pause
