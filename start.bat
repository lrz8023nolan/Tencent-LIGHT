@echo off
title Elder Care System - Smart Case Management

set "NODE=C:\Users\Nolan\.workbuddy\binaries\node\versions\22.22.2\node.exe"
set "SERVER=%~dp0server\app.js"

echo.
echo ========================================
echo   Elder Care Case Management System
echo ========================================
echo.

:: Check if Node.js exists
if not exist "%NODE%" (
    echo [ERROR] Node.js not found: %NODE%
    echo Please verify the path and try again.
    pause
    exit /b 1
)

:: Check if server file exists
if not exist "%SERVER%" (
    echo [ERROR] Server file not found: %SERVER%
    pause
    exit /b 1
)

echo [START] Launching backend server...
echo [START] Server URL: http://localhost:3001
echo.

:: Start server in a new window
cd /d "%~dp0server"
start "Elder Care - Server Console" "%NODE%" "%SERVER%"

:: Wait for server to start up
echo [WAIT] Waiting for server to be ready (8 seconds)...
timeout /t 8 /nobreak >nul

:: Open browser
echo [OPEN] Opening browser...
start http://localhost:3001

echo.
echo ========================================
echo   System is running!
echo   Frontend: http://localhost:3001
echo.
echo   DO NOT close the server console window
echo   (it says "Elder Care - Server Console")
echo ========================================
echo.

pause
