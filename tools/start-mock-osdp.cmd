@echo off
rem Startet den lokalen OSDP-Nachbau (Windows). Doppelklick genuegt.
rem Beim ersten Start wird der Nachbau aus site-dump\osdp.redacted.har erzeugt (Ordner mock-osdp).
rem Danach in den Extension-Einstellungen: URL-Muster des OSDP-Tabs = http://localhost:4300/*
cd /d "%~dp0\.."
if not exist "mock-osdp\api.json" (
  if not exist "site-dump\osdp.redacted.har" (
    echo Datei site-dump\osdp.redacted.har fehlt - bitte das Nachbau-ZIP in diesen Ordner entpacken.
    pause
    exit /b 1
  )
  echo Erzeuge Nachbau aus site-dump\osdp.redacted.har ...
  node tools\har-to-mock.mjs site-dump\osdp.redacted.har
  if errorlevel 1 (
    echo Nachbau konnte nicht erzeugt werden.
    pause
    exit /b 1
  )
)
echo Nachbau laeuft unter http://localhost:4300 - Fenster offen lassen.
node tools\mock-osdp-server.mjs %*
pause
