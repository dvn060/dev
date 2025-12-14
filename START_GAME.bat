@echo off
echo.
echo ====================================
echo   Starting Kids Math Adventure!
echo ====================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting the game server...
echo.
echo The game will be available at:
echo   http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo.

start http://localhost:3000

call npm start

pause
