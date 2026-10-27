@echo off
setlocal
cd /d "%~dp0"

echo ====================================================
echo           Iniciando Aqua (Projeto-maker)
echo ====================================================

:: 1. Tentar iniciar com Node.js (Servidor Backend com API e Static Files)
where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [INFO] Node.js detectado! Iniciando servidor backend na porta 3000...
    start "Servidor Aqua (Node.js)" cmd /k "cd /d ""%~dp0backend"" && node server.js"
    timeout /t 2 /nobreak >nul
    start "" "http://localhost:3000"
    exit /b 0
)

:: 2. Tentar iniciar com Python (py ou python)
where py >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set "PYTHON_CMD=py"
) else (
    where python >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set "PYTHON_CMD=python"
    )
)

if defined PYTHON_CMD (
    echo [INFO] Python detectado (%PYTHON_CMD%)! Iniciando servidor local na porta 8000...
    start "Servidor Aqua (Python)" cmd /k "cd /d ""%~dp0"" && %PYTHON_CMD% -m http.server 8000 --directory frontend --bind 127.0.0.1"
    timeout /t 2 /nobreak >nul
    start "" "http://localhost:8000"
    exit /b 0
)

:: 3. Fallback: Abrir o index.html diretamente no navegador
echo [AVISO] Nem Node.js nem Python foram encontrados no PATH.
echo Abrindo o painel Aqua diretamente no navegador...
start "" "%~dp0frontend\index.html"

endlocal
