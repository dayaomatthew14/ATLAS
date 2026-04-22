@echo off
cd /d "%~dp0"
if exist .\venv\Scripts\activate.bat (
    call .\venv\Scripts\activate.bat
    .\venv\Scripts\uvicorn main:app --reload --host 0.0.0.0 --port 8000
) else if exist .\venv\bin\python.exe (
    .\venv\bin\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
)
