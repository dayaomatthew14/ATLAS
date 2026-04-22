@echo off
cd /d "%~dp0"
if exist .\venv\Scripts\activate.bat (
    call .\venv\Scripts\activate.bat
    python seed.py
) else if exist .\venv\bin\python.exe (
    .\venv\bin\python.exe seed.py
)
echo DONE
