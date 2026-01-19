@echo off
REM Kids Reading Web App - Windows Server Launcher
REM This script starts a simple web server for the app

echo ================================================
echo   Kids Reading App - Web Server
echo ================================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] Python found
    echo.
    echo Starting server on http://localhost:8000
    echo.
    echo To access from your iPad:
    echo 1. Make sure your iPad and PC are on the same WiFi network
    echo 2. Find your PC's IP address by running: ipconfig
    echo 3. On your iPad, open Safari and go to: http://YOUR-PC-IP:8000
    echo.
    echo Press Ctrl+C to stop the server
    echo.
    echo ================================================
    echo.

    REM Start Python HTTP server
    python -m http.server 8000

) else (
    echo [ERROR] Python not found!
    echo.
    echo Please install Python from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation
    echo.
    pause
)
