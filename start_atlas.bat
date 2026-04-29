@echo off
echo Starting ATLAS System...

start cmd /k "cd backend && python -m uvicorn main:app --reload"
start cmd /k "cd frontend && npm run dev"

echo.
echo Servers are starting in separate windows.
echo Frontend: http://localhost:5173
echo Backend: http://localhost:8000
pause
