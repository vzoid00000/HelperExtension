@echo off
rem Startet die Claude-Code-Bruecke MIT Zugangs-Token (fuer den Zugriff von aussen ueber einen Tunnel).
rem Der Token wird beim ersten Start in tools\bridge-token.txt angelegt und beim Start angezeigt.
rem Danach in einem zweiten Fenster tools\start-tunnel.cmd starten.
cd /d "%~dp0\.."
set ANTHROPIC_API_KEY=
node tools\claude-bridge.mjs --model opus --effort medium --token-file tools\bridge-token.txt %*
pause
