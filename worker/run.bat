@echo off
title AutoLeads Worker
cd /d "%~dp0"

echo ======================================
echo   AUTOLEADS WORKER
echo ======================================
echo.

python -m pip install --upgrade pip >nul
python -m pip install -r requirements.txt
python autoleads_worker.py

echo.
echo ======================================
echo Finished. Press any key to exit.
pause >nul
