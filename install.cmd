@echo off
REM Install Tale Sheet and Tale Shop into TaleSpire.
REM
REM Double-click this, or run it from a terminal. It updates only what has
REM changed and leaves your characters, your 5etools data and your homebrew
REM exactly where they are.
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found on your PATH.
  echo Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
node tools/install-symbiotes.js %*
echo.
pause
