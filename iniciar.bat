@echo off
setlocal
cd /d "%~dp0"

set "PORT=8000"
start "Servidor local do Projeto-maker" cmd /k "cd /d ""%~dp0"" && py -m http.server %PORT% --bind 127.0.0.1"
timeout /t 2 /nobreak >nul
start "" "http://localhost:%PORT%"

endlocal