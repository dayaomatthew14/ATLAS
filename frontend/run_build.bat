@echo off
cd /d "%~dp0"
call npm run build > build_output.txt 2>&1
