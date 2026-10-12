@echo off
title AutoLeads Worker
cd /d "%~dp0"

echo ======================================
echo   AUTOLEADS WORKER
echo ======================================
echo.

set "PY=python"
where python >nul 2>&1 || set "PY=py"

rem Install the three small packages only when one is missing (starts much faster).
%PY% -c "import aiohttp, bs4, lxml" >nul 2>&1 || %PY% -m pip install -r requirements.txt

rem No words = the menu (new search, your own CSV, daily routine). Anything you add here is passed on, e.g. run.bat run
%PY% autoleads_worker.py %*

echo.
echo ======================================
echo Finished. Press any key to exit.
pause >nul
