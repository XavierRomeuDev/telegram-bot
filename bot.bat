@echo off
cd C:\COMPARTIDA\Xavier\PROGRAMA GESTIO\pedidos\telegram-bot

:loop
echo Iniciando el bot...
node bot.js
echo Código de salida: %ERRORLEVEL%

if %ERRORLEVEL% NEQ 0 (
    echo Error detectado. Reiniciando en 5 segundos...
    timeout /t 5
    goto loop
)

@REM start cmd.exe /k "cd C:\COMPARTIDA\Xavier\PROGRAMA GESTIO\pedidos\telegram-bot && node bot.js"

cmd /k
