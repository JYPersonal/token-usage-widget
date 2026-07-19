@echo off
REM Launch the corner widget detached from this console, then exit.
setlocal
cd /d "%~dp0.."

REM Ensure node is on PATH when launched from Startup (no interactive shell).
if exist "C:\nvm4w\nodejs\node.exe" set "PATH=C:\nvm4w\nodejs;%PATH%"
if defined NVM_SYMLINK if exist "%NVM_SYMLINK%\node.exe" set "PATH=%NVM_SYMLINK%;%PATH%"
if exist "C:\nvm4w\nodejs\node.exe" set "NODE_BINARY=C:\nvm4w\nodejs\node.exe"

REM Clear inherited fixture flag so live usage is the default.
set "USAGE_FIXTURE="

set "ELECTRON=%CD%\node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON%" (
  echo Electron not found. Run: npm install
  exit /b 1
)

REM Detach from this console so closing the terminal does not kill the widget.
start "" "%ELECTRON%" "%CD%"
exit /b 0
