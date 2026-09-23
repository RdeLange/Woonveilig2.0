@echo off
setlocal
cd /d "%~dp0"
echo WoonVeilig Lokaal voor Homey installeren
echo.
echo Dit script gebruikt je eigen Homey account en vraagt straks om je eigen WoonVeilig gegevens.
echo Deel nooit je wachtwoord, tokens of persoonlijke instellingen.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-for-other-users.ps1"
echo.
pause
