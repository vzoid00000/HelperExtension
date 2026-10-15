@echo off
rem Morgenstart (Windows): startet Claude-Code-Bruecke + Tunnel, prueft die Anmeldung, haelt den PC wach
rem und startet abgestuerzte Teile neu. Doppelklick genuegt; Fenster offen lassen, solange du die
rem Extension von der Arbeit aus nutzt. Beenden mit Strg+C oder Schliessen des Fensters.
cd /d "%~dp0\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\morning.ps1"
pause
