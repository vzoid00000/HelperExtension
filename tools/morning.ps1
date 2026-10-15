# OSDP News Helper – Morgenstart für den Heim-PC.
#
# Startet die Claude-Code-Brücke (mit Zugangs-Token) und den Tunnel nach außen, prüft vorher die
# Claude-Code-Anmeldung, hält den PC wach, überwacht beide Prozesse und startet sie bei Ausfall neu.
# Adresse und Token stehen in tools\bridge-address.txt und werden im Fenster angezeigt.
#
# Tunnel:
#   - Steht in tools\tunnel.txt eine ngrok-Domain (z. B. meinname.ngrok-free.app), wird ngrok mit
#     dieser FESTEN Adresse gestartet (einmalig: winget install ngrok.ngrok, ngrok config add-authtoken …,
#     im ngrok-Dashboard eine kostenlose Domain anlegen).
#   - Sonst startet ein Cloudflare-Schnelltunnel (cloudflared), dessen Adresse sich bei jedem Start ändert.
#
# Aufruf: tools\start-morning.cmd (oder: powershell -ExecutionPolicy Bypass -File tools\morning.ps1)

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root
Remove-Item Env:\ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\ANTHROPIC_AUTH_TOKEN -ErrorAction SilentlyContinue

$Port = 4310
$Model = 'opus'
$Effort = 'medium'
$ToolsDir = Join-Path $Root 'tools'
$TokenFile = Join-Path $ToolsDir 'bridge-token.txt'
$TunnelFile = Join-Path $ToolsDir 'tunnel.txt'
$AddressFile = Join-Path $ToolsDir 'bridge-address.txt'
$LogDir = Join-Path $ToolsDir 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$BridgeOut = Join-Path $LogDir 'bridge.log'
$BridgeErr = Join-Path $LogDir 'bridge.err.log'
$TunnelOut = Join-Path $LogDir 'tunnel.log'
$TunnelErr = Join-Path $LogDir 'tunnel.err.log'

function Say([string]$Text, [string]$Color = 'Gray') {
  Write-Host ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $Text) -ForegroundColor $Color
}
function Fail([string]$Text) {
  Say $Text 'Red'
  Say 'Fehler beheben und das Skript neu starten. Fenster bleibt offen.' 'Yellow'
  Read-Host 'Enter zum Beenden' | Out-Null
  exit 1
}
function Find-Tool([string]$Name, [string[]]$Fallbacks) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in $Fallbacks) { if ($p -and (Test-Path $p)) { return $p } }
  return $null
}

# --------------------------------------------------------------------- 0) Voraussetzungen ----
Say 'OSDP News Helper – Morgenstart' 'Cyan'
$Node = Find-Tool 'node' @()
if (-not $Node) { Fail 'Node.js nicht gefunden – von nodejs.org installieren (LTS), danach neues Fenster.' }
$Claude = Find-Tool 'claude' @("$env:USERPROFILE\.local\bin\claude.exe", "$env:APPDATA\npm\claude.cmd")
if (-not $Claude) { Fail 'Claude Code nicht gefunden – in PowerShell: irm https://claude.ai/install.ps1 | iex' }
Say ("Node.js: {0}  |  Claude Code: {1}" -f $Node, $Claude)

$TunnelDomain = ''
if (Test-Path $TunnelFile) { $TunnelDomain = (Get-Content $TunnelFile -Raw).Trim() }
$TunnelKind = ''
$TunnelExe = ''
if ($TunnelDomain) {
  $TunnelExe = Find-Tool 'ngrok' @((Join-Path $ToolsDir 'ngrok.exe'))
  if (-not $TunnelExe) { Fail 'tools\tunnel.txt nennt eine ngrok-Domain, aber ngrok fehlt – winget install ngrok.ngrok, dann ngrok config add-authtoken <dein Token>.' }
  $TunnelKind = 'ngrok'
} else {
  $TunnelExe = Find-Tool 'cloudflared' @((Join-Path $ToolsDir 'cloudflared.exe'))
  if (-not $TunnelExe) { Fail 'Kein Tunnel-Programm: entweder ngrok (winget install ngrok.ngrok + Domain in tools\tunnel.txt) oder cloudflared (winget install Cloudflare.cloudflared).' }
  $TunnelKind = 'cloudflared'
}
Say ("Tunnel: {0} ({1})" -f $TunnelKind, $TunnelExe)

# ------------------------------------------------------------- 1) Claude-Code-Anmeldung ----
function Get-ClaudeAuth {
  try {
    $raw = & $Claude auth status 2>$null | Out-String
    $info = $raw | ConvertFrom-Json
    return $info
  } catch { return $null }
}
$auth = Get-ClaudeAuth
if (-not $auth -or -not $auth.loggedIn) {
  Say 'Claude Code ist nicht angemeldet – Browserfenster öffnet sich, bitte mit dem claude.ai-Konto anmelden …' 'Yellow'
  & $Claude auth login
  $auth = Get-ClaudeAuth
  if (-not $auth -or -not $auth.loggedIn) { Fail 'Anmeldung fehlgeschlagen. Bitte „claude auth login“ von Hand ausführen.' }
}
if ($auth.authMethod -ne 'claude.ai') {
  Fail ("Claude Code ist mit '{0}' angemeldet, nicht mit dem claude.ai-Abo – ANTHROPIC_API_KEY entfernen und „claude auth login“ ausführen." -f $auth.authMethod)
}
Say ("Anmeldung ok: {0} ({1})" -f $auth.email, $auth.subscriptionType) 'Green'

# ------------------------------------------------------------------ 2) PC wach halten ----
try {
  Add-Type -Namespace OsdpHelper -Name Power -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll")]
public static extern uint SetThreadExecutionState(uint esFlags);
'@
  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED: kein Ruhezustand, solange dieses Skript läuft (Bildschirm darf aus)
  [OsdpHelper.Power]::SetThreadExecutionState([uint32]0x80000001) | Out-Null
  Say 'Ruhezustand ist blockiert, solange dieses Fenster offen ist.'
} catch {
  Say 'Konnte den Ruhezustand nicht blockieren – bitte in den Energieoptionen „Energie sparen: Nie“ einstellen.' 'Yellow'
}

# ------------------------------------------------------------------------- 3) Brücke ----
$Bridge = $null
$Token = ''
function Start-Bridge {
  $args = @('tools\claude-bridge.mjs', '--model', $Model, '--effort', $Effort, '--port', "$Port", '--token-file', "`"$TokenFile`"")
  $script:Bridge = Start-Process -FilePath $Node -ArgumentList $args -WorkingDirectory $Root -NoNewWindow -PassThru -RedirectStandardOutput $BridgeOut -RedirectStandardError $BridgeErr
  Say ("Brücke gestartet (PID {0}), Protokoll: {1}" -f $script:Bridge.Id, $BridgeOut)
}
function Get-BridgeStatus {
  if (-not $script:Token) { return $null }
  try {
    return Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/__bridge/status" -f $Port) -Headers @{ Authorization = "Bearer $($script:Token)" } -TimeoutSec 5
  } catch { return $null }
}
Start-Bridge
$deadline = (Get-Date).AddSeconds(30)
while (-not (Test-Path $TokenFile) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 300 }
if (-not (Test-Path $TokenFile)) { Fail ("Brücke hat keinen Token angelegt – siehe {0}" -f $BridgeErr) }
$Token = (Get-Content $TokenFile -Raw).Trim()
$deadline = (Get-Date).AddSeconds(30)
$status = $null
while (-not $status -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 1; $status = Get-BridgeStatus }
if (-not $status) { Fail ("Brücke antwortet nicht auf Port {0} – siehe {1}" -f $Port, $BridgeErr) }
if ($status.auth -and -not $status.auth.ok) { Say 'Brücke meldet: keine Claude-Code-Anmeldung.' 'Yellow' }
Say 'Brücke läuft.' 'Green'

# ------------------------------------------------------------------------- 4) Tunnel ----
$Tunnel = $null
$PublicUrl = ''
function Start-Tunnel {
  Remove-Item $TunnelOut, $TunnelErr -ErrorAction SilentlyContinue
  if ($TunnelKind -eq 'ngrok') {
    $args = @('http', "$Port", "--url=$TunnelDomain", '--log=stdout', '--log-level=info')
  } else {
    $args = @('tunnel', '--url', ("http://localhost:{0}" -f $Port), '--no-autoupdate')
  }
  $script:Tunnel = Start-Process -FilePath $TunnelExe -ArgumentList $args -WorkingDirectory $Root -NoNewWindow -PassThru -RedirectStandardOutput $TunnelOut -RedirectStandardError $TunnelErr
  Say ("Tunnel gestartet (PID {0})" -f $script:Tunnel.Id)
}
function Read-TunnelUrl {
  if ($TunnelKind -eq 'ngrok') {
    try {
      $t = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 5
      foreach ($x in $t.tunnels) { if ($x.public_url -like 'https://*') { return $x.public_url } }
    } catch { }
    return ''
  }
  foreach ($f in @($TunnelErr, $TunnelOut)) {
    if (Test-Path $f) {
      $m = [regex]::Match((Get-Content $f -Raw -ErrorAction SilentlyContinue), 'https://[a-z0-9-]+\.trycloudflare\.com')
      if ($m.Success) { return $m.Value }
    }
  }
  return ''
}
function Test-Public {
  if (-not $script:PublicUrl) { return $false }
  try {
    $r = Invoke-RestMethod -Uri ("{0}/v1/models" -f $script:PublicUrl) -Headers @{ Authorization = "Bearer $($script:Token)"; 'ngrok-skip-browser-warning' = '1' } -TimeoutSec 15
    return ($null -ne $r.data)
  } catch { return $false }
}
function Write-Address {
  $lines = @(
    'OSDP News Helper – Zugang zur Brücke (Einstellungen → Lokaler Server)',
    ("Server-URL : {0}/v1" -f $script:PublicUrl),
    ("API-Key    : {0}" -f $script:Token),
    ("Modellname : {0}" -f $Model),
    ("Stand      : {0}" -f (Get-Date -Format 'dd.MM.yyyy HH:mm'))
  )
  Set-Content -Path $AddressFile -Value $lines -Encoding UTF8
}
function Show-Banner {
  Write-Host ''
  Write-Host '=============================================================' -ForegroundColor Cyan
  Write-Host ("  Server-URL : {0}/v1" -f $script:PublicUrl) -ForegroundColor White
  Write-Host ("  API-Key    : {0}" -f $script:Token) -ForegroundColor White
  Write-Host ("  Modellname : {0}" -f $Model) -ForegroundColor White
  Write-Host ("  (auch in {0})" -f $AddressFile) -ForegroundColor DarkGray
  Write-Host '=============================================================' -ForegroundColor Cyan
  Write-Host ''
}
Start-Tunnel
$deadline = (Get-Date).AddSeconds(40)
while (-not $PublicUrl -and (Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  if ($Tunnel.HasExited) { break }
  $PublicUrl = Read-TunnelUrl
}
if ($Tunnel.HasExited -and $TunnelKind -eq 'ngrok') {
  # Ältere ngrok-Version kennt --url nicht → --domain
  $errText = ''
  if (Test-Path $TunnelErr) { $errText = Get-Content $TunnelErr -Raw }
  if ($errText -match 'unknown flag|url') {
    Say 'ngrok kennt --url nicht, versuche --domain …' 'Yellow'
    Remove-Item $TunnelOut, $TunnelErr -ErrorAction SilentlyContinue
    $script:Tunnel = Start-Process -FilePath $TunnelExe -ArgumentList @('http', "$Port", "--domain=$TunnelDomain", '--log=stdout', '--log-level=info') -WorkingDirectory $Root -NoNewWindow -PassThru -RedirectStandardOutput $TunnelOut -RedirectStandardError $TunnelErr
    $deadline = (Get-Date).AddSeconds(40)
    while (-not $PublicUrl -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2; if ($Tunnel.HasExited) { break }; $PublicUrl = Read-TunnelUrl }
  }
}
if (-not $PublicUrl) {
  $errText = ''
  if (Test-Path $TunnelErr) { $errText = (Get-Content $TunnelErr -Raw) }
  Fail ("Tunnel liefert keine Adresse. Letzte Meldungen:`n{0}" -f $errText)
}
if (Test-Public) { Say 'Tunnel erreichbar: Anfrage von außen bis zur Brücke erfolgreich.' 'Green' }
else { Say 'Tunnel steht, aber die Prüfanfrage von außen schlug fehl – bitte 30 s warten; ich prüfe weiter.' 'Yellow' }
Write-Address
Show-Banner
Say 'Alles läuft. Fenster offen lassen. Beenden mit Strg+C.' 'Green'

# ----------------------------------------------------------------------- 5) Überwachung ----
$bridgeFails = 0
$tunnelFails = 0
$lastReport = Get-Date
try {
  while ($true) {
    Start-Sleep -Seconds 20
    # Brücke
    if ($Bridge.HasExited) {
      Say 'Brücke ist beendet – Neustart.' 'Yellow'
      Start-Bridge
      Start-Sleep -Seconds 3
    }
    $st = Get-BridgeStatus
    if ($st) { $bridgeFails = 0 } else {
      $bridgeFails++
      if ($bridgeFails -ge 3) {
        Say 'Brücke antwortet nicht – Neustart.' 'Yellow'
        try { Stop-Process -Id $Bridge.Id -Force -ErrorAction SilentlyContinue } catch { }
        Start-Bridge
        $bridgeFails = 0
      }
    }
    # Tunnel
    if ($Tunnel.HasExited) {
      Say 'Tunnel ist beendet – Neustart.' 'Yellow'
      Start-Tunnel
      $PublicUrl = ''
      $deadline = (Get-Date).AddSeconds(40)
      while (-not $PublicUrl -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2; $PublicUrl = Read-TunnelUrl }
      if ($PublicUrl) { Write-Address; Show-Banner }
    } elseif (Test-Public) {
      $tunnelFails = 0
    } else {
      $tunnelFails++
      if ($tunnelFails -ge 3) {
        Say 'Tunnel antwortet nicht – Neustart.' 'Yellow'
        try { Stop-Process -Id $Tunnel.Id -Force -ErrorAction SilentlyContinue } catch { }
        Start-Tunnel
        $tunnelFails = 0
        $PublicUrl = ''
        $deadline = (Get-Date).AddSeconds(40)
        while (-not $PublicUrl -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2; $PublicUrl = Read-TunnelUrl }
        if ($PublicUrl) { Write-Address; Show-Banner }
      }
    }
    # Kurzbericht alle 5 Minuten
    if (((Get-Date) - $lastReport).TotalMinutes -ge 5) {
      $lastReport = Get-Date
      if ($st) {
        $limit = ''
        if ($st.rateLimitUntil) { $limit = (" | Nutzungslimit bis {0}" -f $st.rateLimitUntil) }
        Say ("Status: Anfragen {0}, ok {1}, Fehler {2}, Limit {3}{4} | Adresse {5}" -f $st.requests, $st.ok, $st.failed, $st.rateLimited, $limit, $PublicUrl)
      }
    }
  }
} finally {
  Say 'Beende Brücke und Tunnel …' 'Yellow'
  try { if ($Tunnel -and -not $Tunnel.HasExited) { Stop-Process -Id $Tunnel.Id -Force -ErrorAction SilentlyContinue } } catch { }
  try { if ($Bridge -and -not $Bridge.HasExited) { Stop-Process -Id $Bridge.Id -Force -ErrorAction SilentlyContinue } } catch { }
  try { [OsdpHelper.Power]::SetThreadExecutionState([uint32]0x80000000) | Out-Null } catch { }
}
