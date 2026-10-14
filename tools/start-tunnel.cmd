@echo off
rem Macht die laufende Bruecke (localhost:4310) ueber einen verschluesselten Cloudflare-Tunnel erreichbar.
rem Voraussetzung: cloudflared (winget install Cloudflare.cloudflared) oder cloudflared.exe in diesem Ordner.
rem Die Adresse https://....trycloudflare.com erscheint nach wenigen Sekunden im Fenster.
rem In der Extension (Arbeits-PC): Lokaler Server, URL https://....trycloudflare.com/v1, API-Key = Token.
cd /d "%~dp0"
if exist cloudflared.exe (
  cloudflared.exe tunnel --url http://localhost:4310
) else (
  cloudflared tunnel --url http://localhost:4310
)
pause
