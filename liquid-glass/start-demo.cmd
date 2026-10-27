@echo off
cd /d "%~dp0"
node scripts/serve.mjs --port 4172
pause
