@echo off
cd /d "%~dp0"
call .\venv\Scripts\activate.bat
python seed.py
echo DONE
