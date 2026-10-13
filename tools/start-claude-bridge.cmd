@echo off
rem Startet die Claude-Code-Bruecke (Windows). Doppelklick genuegt.
rem Voraussetzung: Node.js und Claude Code installiert, einmal "claude auth login" ausgefuehrt.
cd /d "%~dp0\.."
set ANTHROPIC_API_KEY=
node tools\claude-bridge.mjs --model opus --effort medium %*
pause
