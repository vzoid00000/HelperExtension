# OSDP News Helper (Chrome Extension)

Automatisiert das Eintragen von News in den OSDP News-Editor
(`https://osdp.zentdok.at/#/newsEditor`) in den Bereichen **Cyber** und **KriMiSi**.
Gespeichert wird in OSDP **nie automatisch**: Die Extension füllt das Formular aus und wartet,
bis du es geprüft und selbst auf „Save“ geklickt hast.

## Was die Extension macht

Eine einzige App-Seite (Klick auf das Extension-Symbol) mit fünf Ansichten:

**Lauf** – der Arbeitsablauf:

1. **Bereich wählen**: Cyber, KriMiSi oder beide. Die Wahl gilt für Scan, Relevanzprüfung,
   Eintragen und die Meldungsliste (8–9 Uhr Cyber, danach KriMiSi).
2. **Quellen scannen**: liest die Quellen des Bereichs (RSS-Feeds und Übersichtsseiten) und sammelt
   Meldungen ab dem letzten Freitag. Meldungen, die schon im Verlauf stehen, werden als „bereits
   eingetragen“ markiert.
3. **Relevanz prüfen**: das Modell bewertet jede Schlagzeile (Bereich, Wichtigkeit 0–10). Alles ab
   der Schwelle (Standard 6) wird ausgewählt, sofern es zum gewählten Bereich gehört; die Liste
   lässt sich filtern und von Hand anpassen.
4. **Eintragen**: Für jede ausgewählte Meldung prüft die Extension zuerst über OSDP, ob die URL schon
   in der Datenbank ist (Duplikat → übersprungen, ohne Modellkosten). Dann werden Artikeltext, Autor
   und Datum ausgelesen (Datum erneut gegen „letzter Freitag“ geprüft), Titel und Text wortgetreu
   EN→DE übersetzt, Tags nach dem Tagging-Handbuch vorgeschlagen und das OSDP-Formular befüllt:
   Native (URL, Titel, englischer Text), English Translated (dasselbe Englisch), German Translated,
   Metadata (Autor oder „Autor ungenannt“, Datum), Tags.
5. **Freigabe**: Unten im OSDP-Tab erscheint eine Leiste „OSDP News Helper · 3/12 · Titel“ mit
   „Überspringen“ und „Abbrechen“; in der App zeigt die Freigabe-Card Tags, Datum, Autor und
   Warnungen. Du prüfst das Formular, korrigierst bei Bedarf und klickst in OSDP auf **Save**. Die
   Extension erkennt das Speichern (Erfolgsmeldung bzw. geleertes Formular nach einem Klick auf
   Save), schreibt den Verlauf und macht mit der nächsten Meldung weiter. „Überspringen“ lässt die
   Meldung aus, „Abbrechen“ beendet den Lauf; „Stopp“ während der Freigabe wirkt wie „Abbrechen“,
   das ausgefüllte Formular wird beim nächsten Lauf verworfen. „Als gespeichert markieren“ in der
   App ist nur für den Fall gedacht, dass OSDP gespeichert hat und die Extension es nicht erkannt
   hat. Meldet OSDP ein Duplikat, wird die Meldung so markiert. Probleme beim Ausfüllen (etwa ein
   Tag, der sich nicht setzen ließ) stehen in der Leiste und in der Freigabe-Card.
6. **Lernen**: Hast du vor dem Save Tags im Formular geändert, erkennt die Extension die Differenz
   und schlägt eine Regel vor (siehe „Regeln“).

„Automatik starten“ führt Scan, Relevanzprüfung und Eintragen für den gewählten Bereich
nacheinander aus. Eine Artikel-URL lässt sich auch direkt eingeben, ohne Scan.

**Quellen** – Quellen anlegen, bearbeiten, testen (zeigt die ersten Treffer), ein-/ausschalten,
löschen, Standardliste wiederherstellen; Import/Export als Text. Wird die letzte Quelle gelöscht,
gilt wieder die Standardliste (25 Quellen).

**Verlauf** – alle eingetragenen Meldungen dauerhaft mit Zeit, Struktur, WB, Titel, Quelle,
Zusammenfassung, Tags. Zähler je Zeitraum (heute, Woche, Monat, alle): Einträge, Cyber, KriMiSi,
WB-Cyber, WB-KriMiSi, Duplikate. Duplikate (gleiche URL oder gleicher Titel) stehen in der Spalte
„Hinweis“. Suche, WB-Kennzeichnung umschalten, „Korrektur melden“, Export als Markdown oder CSV,
„Verlauf löschen“ (zweifache Rückfrage, unwiderruflich).

**Regeln** – das Regelwerk aus deinen Korrekturen. Jede Regel hat einen Bereich (Tagging, Relevanz,
Übersetzung), den Regeltext, eine Begründung und optional ein Beispiel. Aktive Regeln werden den
Prompts angehängt (höchstens 40 Regeln bzw. 6.000 Zeichen je Prompt, älteste zuerst) und machen das
Modell mit der Zeit besser. „Mit KI verallgemeinern“ formuliert aus einer Korrektur eine
allgemeine Regel.

**Einstellungen** – Sprachmodell (Claude-Code-Brücke, eigener Server oder Claude API), Übersetzer,
Automatik (Schwelle, Zeitplan), OSDP-Felder, **Daten exportieren/importieren** (Einstellungen,
Quellen, Regeln, Verlauf als JSON – so wandert alles zwischen Heim- und Arbeits-PC; beim Export
wird gefragt, ob API-Keys mitgehen; der Import ergänzt Quellen, Regeln und Verlauf und überschreibt
Einstellungen, gelöscht wird nichts) und Werkzeuge (DOM-Dump, Tag-Baum mit Tooltips exportieren).

Eine Meldung, deren URL oder Titel schon im Verlauf steht, wird beim Scan als „bereits eingetragen“
markiert und nicht automatisch ausgewählt; sie lässt sich trotzdem anhaken. Dieselbe Nachricht mit
anderem Titel aus einer zweiten Quelle gilt als neue Meldung.

## Tagging nach Handbuch

Grundlage ist `docs/OSDP_Tagging_Handbuch.md`; der Katalog mit allen 673 Tags liegt als
`src/config/osdp-tags.json` vor (`node tools/build-tag-catalog.mjs` erzeugt ihn neu aus dem Handbuch).

Für jeden Artikel liest das Modell den Text und den Katalog und liefert einen Vorschlag.
`src/lib/tag-catalog.js` prüft ihn gegen die festen Regeln:

| Regel | Umsetzung |
|---|---|
| Genau ein Struktur-Tag (`[S]1 Cyber` / `[S]2 KriMiSi` / `[S]3 InnoTech`) | immer gesetzt, Fallback aus der Relevanzprüfung |
| `Newsinfo → Dokumententyp → News` | immer gesetzt |
| `Newsinfo → Quellentyp → …` | nach tatsächlicher Quelle, Fallback „Nachrichtenseite“ |
| Mindestens ein Ort unter `geographische Lokationen` | nur Katalog-Namen; ohne gültigen Ort „kein Standort“ plus Warnung |
| Themen-Tags aus Cyber, KriMiSi, InnoTech, Allgemeine Tags (unabhängig von der Struktur) | Untertag vor Übertag, nur Katalog-Tags, Oberkategorien allein verworfen |
| KI-Sonderregel | `Auftragstags → HSC → HSC-KI → [KI_]Tools und Usecases`, wenn KI Thema ist |
| WB-Tag nur bei besonders wichtigen Meldungen | `WB-Cyber` bzw. `WB-KriMiSi` als Knoten, nie Untertags; Spalte „WB“ erzwingt ja/nein |
| Nie: zeitlicher Aspekt, Informationsverschmutzung, Social Media Post, andere Auftragstags | gesperrt, auch wenn das Modell sie nennt |

Im OSDP-Tab setzt die Extension die Tags direkt über die Angular-Komponente (Eltern vor Kindern),
notfalls per Klick im Tag-Baum, und kontrolliert das Ergebnis über die Chips. Fehlt ein Modell,
werden nur die Pflichttags gesetzt (Struktur aus der Quellen-Kategorie, News, Nachrichtenseite,
„kein Standort“) und im Protokoll darauf hingewiesen.

Der Katalog geht kompakt in den Prompt (unter 30.000 Zeichen statt 46.000: alle Tagnamen,
Beschreibungen gekürzt und nur wo sie den Namen erklären, Orte als Listen je Kontinent). Über die
Claude API wird der Katalogblock zwischengespeichert.

## Übersetzung

Titel und Text gehen in einer Anfrage an das Modell. Die Anweisung verlangt eine wortgetreue,
vollständige Übersetzung ohne Ergänzungen, Kürzungen oder Zusammenfassung mit gleicher
Absatzstruktur. Eine Plausibilitätsprüfung (Längenverhältnis, Absatzanzahl, Floskeln) meldet
Auffälligkeiten als Warnung in der Freigabe-Card. In OSDP landet im Native- und im
English-Translated-Reiter der ausgelesene Originaltext unverändert.

DeepL bleibt als Option (API-Key nötig; der Gratis-Plan hat 500.000 Zeichen im Monat und verlangt
eine Kreditkarte zur Verifizierung). Über die Claude-Code-Brücke kostet die Übersetzung nichts extra.

## Installation

1. Repository klonen oder ZIP entpacken
2. Chrome: `chrome://extensions` → **Entwicklermodus** → **„Entpackte Erweiterung laden“** → Projektordner
3. Extension-Symbol anklicken → Ansicht „Einstellungen“:
   - Sprachmodell wählen: **Claude-Code-Brücke** („Claude-Code-Brücke voreinstellen“, siehe unten),
     **Claude API** (API-Key von console.anthropic.com; „Sparmodus“ wählt das günstige Haiku 5.5)
     oder **eigener Server**
   - Übersetzer wählen (Claude, lokal, DeepL, Chrome)
   - „Speichern“, dann „Übersetzung testen“ bzw. „Verbindung testen“
4. In OSDP einloggen (ein Tab mit `osdp.zentdok.at` genügt)

Nach Code-Änderungen in `chrome://extensions` auf „Aktualisieren“ (↻) klicken.

### Datumsregel

„Letzter Freitag“ ist der jüngste Freitag **vor** heute. Ältere Artikel werden nie eingetragen.

| Heute | Erlaubt ab |
|---|---|
| Montag | Freitag vor 3 Tagen |
| Dienstag–Donnerstag | Freitag der laufenden Vorwoche |
| Freitag | Freitag der Vorwoche (7 Tage) |
| Samstag / Sonntag | gestern / vorgestern |

### Zeitplan

Uhrzeit in den Einstellungen (z. B. 07:55). Mo–Fr öffnet sich die App (oder der offene App-Tab
bekommt den Auftrag) und führt Scan und Relevanzprüfung für den zuletzt gewählten Bereich aus,
damit die Liste fertig ist, wenn du anfängst. Eingetragen wird nur, wenn du den Lauf startest.
Chrome muss laufen.

## Claude-Abo statt API-Key: die Claude-Code-Brücke

Wer kein API-Guthaben kaufen will, nutzt das Kontingent seines claude.ai-Abos (Pro/Max) über
**Claude Code**, das im Abo enthalten ist. `tools/claude-bridge.mjs` ist ein kleiner lokaler Server,
der jede Anfrage der Extension an `claude -p` weiterreicht. Direkt mit der Website oder mit
ausgelesenen Anmelde-Tokens arbeitet die Extension bewusst nicht.

Einrichtung auf dem PC, an dem Chrome läuft. Claude Code braucht ein claude.ai-Abo (Pro oder
Max; der Gratis-Plan enthält kein Claude Code), die Brücke braucht Node.js (LTS-Installer von
nodejs.org, Version 20 oder neuer). Git ist nicht nötig.

```
# Windows, PowerShell (nativer Installer, empfohlen; zeigt beim Download keinen Fortschritt an):
irm https://claude.ai/install.ps1 | iex
# alternativ überall: npm install -g @anthropic-ai/claude-code   (Node.js 22 oder neuer)

claude --version                   # in einem NEUEN Terminal prüfen
claude auth login                  # mit dem claude.ai-Konto anmelden (Browserfenster)
claude auth status                 # "authMethod": "claude.ai" muss erscheinen
node tools/claude-bridge.mjs       # oder Doppelklick auf tools\start-claude-bridge.cmd (Windows)
```

Die Brücke meldet sich mit `http://localhost:4310/v1`, zeigt den gefundenen Claude-Code-Pfad und
prüft beim Start die Anmeldung. In den Extension-Einstellungen „Claude-Code-Brücke voreinstellen“
klicken, speichern, „Verbindung testen“. Das Fenster der Brücke muss offen bleiben, solange die
Extension arbeitet; jede Anfrage erscheint dort als Zeile.
Optionen: `--model opus|sonnet|haiku` (Standard `opus` = Opus 5.5), `--effort low|medium|high`
(Standard `medium`), `--parallel 2`, `--port 4310`. Status und Zähler: `http://localhost:4310/__bridge/status`.

Die Brücke startet das unveränderte Claude Code ohne Werkzeuge und ohne Sitzung
(`--tools "" --disallowedTools "*" --max-turns 1 --safe-mode --no-session-persistence`), übergibt den
System-Prompt per Datei und den Artikeltext per stdin und entfernt `ANTHROPIC_API_KEY` aus der
Umgebung, damit nie über die API abgerechnet wird. Ist in der Windows-Umgebung ein
`ANTHROPIC_API_KEY` gesetzt, würde Claude Code im Druckmodus sonst immer diesen Key verwenden.

**„claude wird nicht erkannt“ (Windows):** Der native Installer legt `claude.exe` unter
`%USERPROFILE%\.local\bin` ab und trägt den Ordner in den Benutzer-PATH ein. Ein schon offenes
Windows Terminal gibt neuen Tabs aber den alten PATH mit: alle Terminalfenster schließen und ein
neues öffnen. Die Brücke findet `claude.exe` dort auch ohne PATH. Prüfen und notfalls direkt
aufrufen:

```
dir $env:USERPROFILE\.local\bin
& "$env:USERPROFILE\.local\bin\claude.exe" --version
```

Fehlt die Datei, ist die Installation nicht durchgelaufen: `winget install Anthropic.ClaudeCode`
oder, da Node.js ohnehin installiert ist, `npm install -g @anthropic-ai/claude-code`.

Hinweis zu den Nutzungsbedingungen: Anthropic erlaubt die Anmeldung mit dem eigenen Abo im
unveränderten Claude Code für den persönlichen Gebrauch; das Kontingent darf nicht für andere
Personen oder als Dienst weitergegeben werden. Die Brücke ist deshalb nur für den eigenen PC gedacht
und nimmt nur Verbindungen von `localhost` an.

**Nutzungslimit:** Meldet Claude Code, dass das Abo-Kontingent erschöpft ist, antwortet die Brücke
mit HTTP 429 und der Zeit, ab der es weitergeht (soweit Claude Code sie nennt). Der Lauf hält an,
zeigt „Nutzungslimit erreicht – bitte warten“ und merkt sich die bereits erledigten Meldungen;
später einfach erneut starten. Bis zur gemeldeten Zeit beantwortet die Brücke weitere Anfragen
sofort mit 429, ohne Claude Code erneut aufzurufen.

Verbrauch je Meldung: eine Übersetzungs- und eine Tagging-Anfrage (die Relevanzprüfung bündelt bis
zu 50 Schlagzeilen je Anfrage). Mit `--model sonnet` reicht das Kontingent deutlich länger.

## Brücke von der Arbeit aus nutzen (Heim-PC bleibt an)

Darf am Arbeits-PC nichts installiert werden, läuft die Brücke zu Hause und ist über einen
verschlüsselten Tunnel erreichbar. Die Extension in der Arbeit spricht die Tunnel-Adresse an; das
Abo-Kontingent nutzt weiter nur du selbst. Pflicht: ein Zugangs-Token (sonst könnte jeder mit der
Adresse dein Kontingent verbrauchen) und HTTPS (liefert der Tunnel). Ein offener Port am Router ist
nicht vorgesehen.

### Einmalige Einrichtung zu Hause (feste Adresse über Tailscale Funnel, empfohlen)

1. Tailscale von tailscale.com installieren (Windows-Installer) und über das Symbol in der Taskleiste
   anmelden (Konto mit Google, Microsoft, Apple oder GitHub; kostenlos). Nur der Heim-PC braucht
   Tailscale, der Arbeits-PC nicht.
2. Eine Textdatei `tools\tunnel.txt` mit dem Inhalt `tailscale` anlegen (eine Zeile).
3. Beim ersten Start von `tools\start-morning.cmd` zeigt Tailscale einen Link, über den „Funnel“ für
   dein Konto freigeschaltet wird (einmal im Browser bestätigen), danach das Skript erneut starten.
   Die Adresse lautet dann `https://<pc-name>.<tailnet>.ts.net` und bleibt fest.
4. Energieoptionen: Ruhezustand/Energie sparen auf „Nie“ (das Skript blockiert ihn zusätzlich,
   solange es läuft). Bildschirm aus ist in Ordnung; Chrome muss zu Hause nicht laufen.

Alternativen in `tools\tunnel.txt`: eine ngrok-Domain (`winget install ngrok.ngrok`, `ngrok config
add-authtoken …`, kostenlose Domain im ngrok-Dashboard) oder `cloudflare` für einen
Cloudflare-Schnelltunnel (`winget install Cloudflare.cloudflared`), dessen Adresse sich bei jedem
Start ändert.

### Jeden Morgen: `tools\start-morning.cmd`

Doppelklick. Das Skript prüft Node.js, Claude Code und die Anmeldung (öffnet bei Bedarf den
Login), startet die Brücke mit Token (`tools\bridge-token.txt`, wird beim ersten Mal erzeugt) und
den Tunnel, prüft von außen, ob eine Anfrage bis zur Brücke durchkommt, schreibt Adresse und Token
nach `tools\bridge-address.txt`, zeigt beides groß im Fenster, hält den PC wach und startet Brücke
oder Tunnel neu, wenn sie ausfallen. Alle fünf Minuten eine Statuszeile (Anfragen, Fehler,
Nutzungslimit). Fenster offen lassen; Beenden mit Strg+C. Protokolle unter `tools\logs\`.

### In der Arbeit, einmalig in den Extension-Einstellungen

Anbieter „Lokaler Server“, Server-URL `https://<deine Domain>/v1`, Modellname `opus`, API-Key = der
Token, Übersetzung „Lokales Modell“, „Speichern“, „Verbindung testen“. Bei fester ngrok-Domain bleibt
das dauerhaft gültig. Ohne gültigen Token antwortet die Brücke mit 401 und protokolliert den Versuch.

Blockiert der Firmen-Proxy die Tunnel-Adresse, bleibt nur der API-Key-Weg unten. Die Brücke selbst
startet ohne Token nur auf localhost; `--host 0.0.0.0` (eigenes Netz/VPN) verlangt ebenfalls einen
Token. Einzelstart ohne Skript: `tools\start-claude-bridge-remote.cmd` plus `tools\start-tunnel.cmd`.

## Am Arbeits-PC ohne Installation

Darf auf dem PC nichts installiert werden (kein Node.js, kein Claude Code), fällt die Brücke weg.
Die Extension selbst braucht nur den Entwicklermodus in `chrome://extensions`; ist der per
Richtlinie gesperrt, läuft auch sie nicht. Sonst bleiben drei Wege:

1. **Claude API mit API-Key (funktioniert sofort, kostet Cent-Beträge).** Konto auf
   console.anthropic.com anlegen, Guthaben laden (Mindestbetrag 5 $, optional ein monatliches
   Ausgabenlimit setzen), unter „API Keys“ einen Key erzeugen. In den Einstellungen
   **„Sparmodus: API-Key + Haiku“** klicken, Key einfügen, „Speichern“, „Übersetzung testen“.
   Haiku 5.5 reicht für Übersetzung und Tagging; bei rund zehn Meldungen am Tag liegt der
   Verbrauch grob bei 10–40 Cent pro Arbeitstag (der Tag-Katalog wird zwischengespeichert).
   Sonnet 5.5 kostet etwa das 3–5-Fache, Opus 5.5 etwa das 5–10-Fache. Bei einem Rate-Limit
   (HTTP 429) hält der Lauf an und zeigt an, ab wann es weitergeht.
2. **Ohne Modell (kostenlos, halbautomatisch).** Übersetzung auf „Chrome integriert“ stellen
   (Chrome 138+, Sprachpaket wird beim ersten Mal geladen), „Tags per Modell“ ausschalten.
   Die Relevanzprüfung entfällt: „Quellen scannen“, dann die passenden Meldungen per Haken selbst
   auswählen und „Ausgewählte eintragen“. Gesetzt werden nur die Pflichttags; Ort, Themen und WB
   trägst du vor dem Save in OSDP selbst nach.
3. **Brücke am Heim-PC** ist nur im eigenen Netz sinnvoll. Sie über einen Tunnel aus dem Internet
   erreichbar zu machen ist nicht vorgesehen: der Firmen-Proxy blockiert so etwas meist, der
   Heim-PC müsste laufen, und ein offener Zugang zum eigenen Abo-Kontingent ist ein Risiko.
   Erlaubt die IT ein portables Node.js (nur entpacken, kein Installer), läuft die Brücke auch am
   Arbeits-PC.

Einstellungen, Quellen, Regeln und Verlauf lassen sich in den Einstellungen als JSON exportieren
und auf dem anderen PC importieren.

## Sprachmodell: Claude oder eigener PC

| | Claude API | Lokaler Server |
|---|---|---|
| Einrichtung | API-Key | Server-URL + Modellname (Brücke: voreingestellt) |
| Kosten | pro Token (Katalog wird gecacht) | Brücke: Abo-Kontingent; eigenes Modell: keine |
| Qualität Tagging/Übersetzung | sehr gut | Brücke: wie Claude; eigenes Modell: abhängig vom Modell (ab ca. 27–32B Parametern brauchbar) |

### Eigenes Modell einrichten (vorbereitet, noch nicht live)

Die Extension spricht jede **OpenAI-kompatible** Chat-Schnittstelle an (`/v1/chat/completions`).

**Ollama** (empfohlen, einfach):

```
# auf dem Heim-PC
OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS="chrome-extension://*" ollama serve
ollama pull qwen2.5:32b        # oder gemma3:27b, llama3.3:70b, mistral-large …
```

Einstellungen: URL `http://<IP-des-PCs>:11434/v1`, Modell `qwen2.5:32b`, Anbieter „Lokaler Server“,
Übersetzung „Lokales Modell“. `OLLAMA_ORIGINS` ist nötig, weil Ollama Anfragen aus Chrome-Extensions
sonst ablehnt. `OLLAMA_HOST=0.0.0.0` macht den Server im Netzwerk erreichbar; von außerhalb des
Heimnetzes braucht es ein VPN (z. B. Tailscale/WireGuard), kein offener Port ins Internet.

**LM Studio**: Server starten, „Serve on Local Network“ und CORS aktivieren, URL `http://<IP>:1234/v1`.
**vLLM / llama.cpp server**: `--host 0.0.0.0`, URL `http://<IP>:8000/v1` bzw. `:8080/v1`.

Strukturierte JSON-Antworten werden zuerst per `json_schema` angefordert; unterstützt der Server das
nicht, fällt die Extension automatisch auf `json_object` und zuletzt auf Text mit JSON-Extraktion zurück.
„Verbindung testen“ in den Einstellungen prüft Erreichbarkeit, Modellliste und eine Mini-Antwort.

## Quellen

Standardliste in `src/lib/sources.js` (BleepingComputer, The Record, The Hacker News, SecurityWeek,
CyberScoop, Dark Reading, Infosecurity, Krebs, The Register; BBC World, Guardian World, Al Jazeera,
Defense News, Breaking Defense, The War Zone, Military Times, Politico Europe, DW, Kyiv Independent,
Times of Israel, UN News, NATO; AP News und Reuters per Übersichtsseite). Die Liste wird in der
Ansicht „Quellen“ gepflegt; eine leere Liste bedeutet Standardquellen. Für den Textimport gilt eine
Quelle pro Zeile:

```
Name | URL | cyber|krimisi|both | rss|html | URL-Muster (nur html, optional)
```

Fehlerhafte Quellen stehen nach dem Scan mit Fehlermeldung in der Quellen-Status-Tabelle; „Testen“
in der Quellen-Ansicht zeigt die ersten Treffer einer Quelle.

## OSDP-Integration (Stand)

Die Oberfläche ist aus dem HAR-Export vollständig bekannt (Analyse in `docs/OSDP_Analyse.md`) und
die Extension wurde **End-to-End gegen die echte Angular-App im lokalen Nachbau getestet**
(`tests/e2e-mock.mjs`): Felder, CKEditor in allen drei Reitern, Datum, Autor, Tags, Freigabe-Leiste
und Save-Erkennung inklusive geprüftem `POST /api/news`-Payload.

| Bereich im Editor | Umsetzung |
|---|---|
| Native / English Translated / German Translated | `formcontrolname`-Felder + CKEditor `setData()` |
| Metadata | `article_created_at` (Datepicker, `DD/MM/YYYY`), `article_author` + Button „Set to Autor ungenannt“ |
| Tags | direkt über die Angular-Komponente per UID (Eltern vor Kindern); Fallback: Pfad aufklappen und Checkbox anhaken; Kontrolle über die Chips |
| Save | klickt der Nutzer; Toast „Item Added!“ oder geleertes Formular = gespeichert; „Duplicate, URL already in the database!“ → Meldung wird als Duplikat markiert |
| Freigabe-Leiste | eigenes Element mit Shadow DOM am unteren Rand, verändert die Seite sonst nicht |
| Öffnen des Editors | App laden, dann per Hash navigieren (ein Deep-Link direkt nach dem Laden landet in OSDP auf „keine Berechtigung“) |

Offen bleibt der Test gegen den echten Server (Login, echte Antwortzeiten).

## Tests

Siehe `tests/README.md`. Ohne Browser: `node tests/catalog.test.mjs`, `stores.test.mjs`,
`prompts.test.mjs`, `har-tools.test.mjs`, `bridge.test.mjs`. Mit Playwright: `app.test.mjs`,
`design.test.mjs`, `review.test.mjs`, `extension-v2.test.mjs`, `extension-v3.test.mjs` und
`node tests/e2e-mock.mjs` gegen den Nachbau.

## Lokale Entwicklung mit Nachbau der OSDP-Oberfläche

Ohne Zugriff auf die echte Seite lässt sich das Frontend aus einem HAR-Export lokal betreiben:

```
node tools/redact-har.mjs site-dump/osdp.har               # Zugangsdaten entfernen → osdp.redacted.har
node tools/har-to-mock.mjs site-dump/osdp.redacted.har     # Frontend-Dateien + API-Antworten → mock-osdp/
node tools/mock-osdp-server.mjs                             # http://localhost:4300/#/newsEditor
```

Windows: Doppelklick auf `tools\start-mock-osdp.cmd` erzeugt den Nachbau beim ersten Start und
startet den Server. Dafür müssen `tools/har-to-mock.mjs`, `tools/mock-osdp-server.mjs`,
`tools/mock-osdp-index.html` und `site-dump/osdp.redacted.har` im Projektordner liegen.

Der Server liefert die aufgezeichneten Antworten (Login, Tag-Baum, Extract …), protokolliert
„Save“-Aufrufe und speichert nichts. In den Extension-Einstellungen das URL-Muster des OSDP-Tabs
auf `http://localhost:4300/*` stellen, dann läuft die App gegen den Nachbau.
Was dafür exportiert werden muss, steht in `site-dump/README.md`.

## Projektstruktur

```
manifest.json                      Manifest V3
docs/OSDP_Tagging_Handbuch.md      Tagging-Regeln und Tag-Katalog (Quelle)
docs/DESIGN.md                     Design-System der App (Tokens, Komponenten)
tools/build-tag-catalog.mjs        Handbuch → src/config/osdp-tags.json
tools/redact-har.mjs               HAR-Export schwärzen (Cookies, Tokens, Passwörter)
tools/har-to-mock.mjs              HAR → lokaler Nachbau (mock-osdp/)
tools/mock-osdp-server.mjs         Nachbau-Server auf localhost:4300
tools/start-mock-osdp.cmd          Windows-Starter für den Nachbau
tools/claude-bridge.mjs            Claude-Code-Brücke (Abo-Kontingent statt API-Key)
tools/start-claude-bridge.cmd      Windows-Starter für die Brücke
tools/start-claude-bridge-remote.cmd Brücke mit Zugangs-Token (für den Tunnel)
tools/start-tunnel.cmd             Cloudflare-Tunnel zur Brücke
tools/start-morning.cmd, morning.ps1  Morgenstart: Brücke + Tunnel starten, prüfen, überwachen
src/config/osdp-tags.json          Tag-Katalog (673 Tags, Pfade, Tooltip-Ausschnitte)
src/background.js                  Service Worker (App-Tab öffnen, Zeitplan)
src/app/                           App-Seite: app.html, app.js, ui.js, views/ (Lauf, Quellen, Verlauf, Regeln, Einstellungen), ui.css, app.css
src/lib/llm.js                     Modell-Anbindung (Claude / lokal)
src/lib/claude.js                  Claude Messages API (raw HTTP)
src/lib/classify.js                Relevanzprüfung
src/lib/tagger.js                  Tag-Vorschlag nach Handbuch (kompakter Katalog, Regelwerk)
src/lib/tag-catalog.js             Katalog, Regeln, Validierung
src/lib/translate.js               Übersetzung (Claude / lokal / DeepL / Chrome) mit Plausibilitätsprüfung
src/lib/rules.js                   Lernregeln, Korrekturerkennung
src/lib/history.js                 Verlauf, Duplikate, Statistik, Export
src/lib/sources-store.js           Quellenverwaltung
src/lib/data-transfer.js           Gesamtexport/-import
src/lib/osdp-driver.js             Steuerung des OSDP-Editors, Freigabe-Schleife
src/lib/sources.js, feeds.js       Standardquellen, RSS/Atom, Link-Sammlung
src/lib/tabloader.js               Seiten in Hintergrund-Tabs laden
src/lib/dates.js, author.js        Datumsregel, Autor-Normalisierung
src/content/news-extractor.js      Artikel auslesen
src/content/osdp-filler.js         DOM-Schritte im OSDP-Editor (Felder, Tag-Baum, Leiste, Save-Erkennung, Export)
src/content/osdp-inspector.js      Struktur-Dump des OSDP-Editors
site-dump/                         HAR-Export (geschwärzt) und DOM-Dumps
```

Kein Build-Schritt, keine Abhängigkeiten.
