@echo off
cd /d "%~dp0"
call .\venv\Scripts\activate.bat
.\venv\Scripts\uvicorn main:app --reload --host 0.0.0.0 --port 8000
