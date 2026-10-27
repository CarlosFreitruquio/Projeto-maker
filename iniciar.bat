@echo off
setlocal
cd /d "%~dp0"

set "PORT=8000"

:: Verificar se 'py' ou 'python' esta disponivel
where py >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set "PYTHON_CMD=py"
) else (
    where python >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set "PYTHON_CMD=python"
    ) else (
        echo [AVISO] Python nao foi encontrado no PATH.
        echo Abrindo o index.html diretamente no navegador...
        start "" "%~dp0index.html"
        exit /b 0
    )
)

echo Iniciando servidor local na porta %PORT%...
start "Servidor Aqua (Projeto-maker)" cmd /k "cd /d ""%~dp0"" && %PYTHON_CMD% -m http.server %PORT% --bind 127.0.0.1"

timeout /t 2 /nobreak >nul
start "" "http://localhost:%PORT%"

endlocal
