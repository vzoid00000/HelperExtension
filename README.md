# OSDP News Helper (Chrome Extension)

Automatisiert das Eintragen von News in den OSDP News-Editor
(`https://osdp.zentdok.at/#/newsEditor`) in den Bereichen **Cyber** und **KriMiSi**.

## Was die Automatik macht

1. **Quellen scannen**: Liest alle konfigurierten Nachrichtenquellen (RSS-Feeds und
   Übersichtsseiten) und sammelt Meldungen ab dem letzten Freitag.
2. **Relevanz prüfen**: Das Modell bewertet jede Schlagzeile (Bereich Cyber/KriMiSi/keiner,
   Wichtigkeit 0–10). Alles ab der Schwelle (Standard 6) wird ausgewählt.
3. **Eintragen**: Für jede ausgewählte Meldung
   - Artikel laden; Text, Autor und Datum auslesen (Datum erneut gegen „letzter Freitag“ geprüft)
   - Autor nur, wenn es eine natürliche Person ist, sonst „Autor ungenannt“
   - Titel und Text Englisch → Deutsch übersetzen
   - **Tags nach dem Tagging-Handbuch vergeben** (siehe unten)
   - OSDP-Editor neu laden und befüllen: Native (URL, Titel, englischer Text), English Translated
     (dasselbe Englisch), German Translated (deutscher Titel und Text), Metadata (Autor, Datum), Tags
   - „Save“ klicken (abschaltbar), URL als erledigt merken, Eintrag in den **Verlauf** schreiben

Dieselbe Meldung von mehreren Quellen wird jeweils eigenständig eingetragen.

## Tagging nach Handbuch

Grundlage ist `docs/OSDP_Tagging_Handbuch.md`; der Katalog mit allen 673 Tags liegt als
`src/config/osdp-tags.json` vor (`node tools/build-tag-catalog.mjs` erzeugt ihn neu aus dem Handbuch).

Für jeden Artikel liest das Modell den vollständigen Text und den Katalog und liefert einen
Vorschlag. `src/lib/tag-catalog.js` prüft ihn gegen die festen Regeln:

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

Im OSDP-Tab klappt die Extension den Tag-Baum entlang des Pfads auf und hakt genau die
Ziel-Checkbox an (`src/content/osdp-filler.js`, Schritt `applyTags`). Fehlt ein Modell, werden nur
die Pflichttags gesetzt (Struktur, News, Nachrichtenseite, „kein Standort“) und im Protokoll
darauf hingewiesen.

Die Tooltips im Handbuch sind auf 30 Zeichen gekürzt. Side Panel → Werkzeuge →
**„Tag-Baum mit Tooltips exportieren“** liest im OSDP-Tab alle vollständigen Tooltips aus und
speichert `osdp-tags-….json`. Damit lassen sich die Tag-Definitionen in den Prompt übernehmen.

## Verlauf und Wochenbericht

Jede gespeicherte News landet im Verlauf (Automatik-Seite, unten): Zeit, Struktur, WB-Kennzeichnung,
Titel, Quelle, Zusammenfassung, Autor, Tags. Die Kopfzeile zeigt die Zählung für heute und die
laufende Woche inklusive WB-Cyber / WB-KriMiSi. Export als Markdown (Zwischenablage) oder CSV.
Die WB-Kennzeichnung lässt sich im Verlauf umschalten, falls sie in OSDP nachträglich geändert wurde.

## Installation

1. Repository klonen oder ZIP entpacken
2. Chrome: `chrome://extensions` → **Entwicklermodus** → **„Entpackte Erweiterung laden“** → Projektordner
3. Extension-Icon → Side Panel → ⚙ Einstellungen:
   - Sprachmodell wählen: **Claude API** (API-Key von console.anthropic.com) oder **lokales Modell**
   - Übersetzer wählen (Claude, lokal, DeepL, Chrome)
   - „Speichern“, dann „Übersetzung testen“ bzw. „Verbindung testen“
4. In OSDP einloggen (ein Tab mit `osdp.zentdok.at` genügt)

Nach Code-Änderungen in `chrome://extensions` auf „Aktualisieren“ (↻) klicken.

## Bedienung

**Automatik** (Side Panel → „Automatik öffnen“):

- **▶ Alles automatisch**: Scan → Relevanzprüfung → Eintragen in einem Rutsch.
- Oder Schritt für Schritt: **1 · Quellen scannen**, **2 · Relevanz prüfen**, Auswahl kontrollieren
  (Haken, Spalte „WB“ auf auto/ja/nein, Zeile anklicken für Begründung und Tags), **3 · Ausgewählte eintragen**.
- **■ Stopp** beendet nach der laufenden Meldung.

**Einzelner Artikel** (Side Panel): Artikel-Tab öffnen → „Aktuellen Tab auslesen“ → prüfen →
„Übersetzen“ → „Formular ausfüllen“ (Tags werden dabei ebenfalls vergeben; optional „Save“).

**Zeitplan**: Uhrzeit in den Einstellungen (z. B. 08:00). Mo–Fr öffnet sich die Automatik-Seite
und startet „Alles automatisch“. Chrome muss laufen.

### Datumsregel

„Letzter Freitag“ ist der jüngste Freitag **vor** heute. Ältere Artikel werden nie eingetragen.

| Heute | Erlaubt ab |
|---|---|
| Montag | Freitag vor 3 Tagen |
| Dienstag–Donnerstag | Freitag der laufenden Vorwoche |
| Freitag | Freitag der Vorwoche (7 Tage) |
| Samstag / Sonntag | gestern / vorgestern |

## Sprachmodell: Claude oder eigener PC

| | Claude API | Lokales Modell |
|---|---|---|
| Einrichtung | API-Key | Server-URL + Modellname |
| Kosten | pro Token (Katalog wird gecacht) | keine |
| Qualität Tagging/Übersetzung | sehr gut | abhängig vom Modell (ab ca. 27–32B Parametern brauchbar) |

### Lokales Modell einrichten (vorbereitet, noch nicht live)

Die Extension spricht jede **OpenAI-kompatible** Chat-Schnittstelle an (`/v1/chat/completions`).

**Ollama** (empfohlen, einfach):

```
# auf dem Heim-PC
OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS="chrome-extension://*" ollama serve
ollama pull qwen2.5:32b        # oder gemma3:27b, llama3.3:70b, mistral-large …
```

Einstellungen: URL `http://<IP-des-PCs>:11434/v1`, Modell `qwen2.5:32b`, Anbieter „Lokales Modell“,
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
Times of Israel, UN News, NATO; AP News und Reuters per Übersichtsseite). Eigene Liste in den
Einstellungen, eine Quelle pro Zeile:

```
Name | URL | cyber|krimisi|both | rss|html | URL-Muster (nur html, optional)
```

Die Feed-URLs konnten aus der Entwicklungsumgebung heraus nicht geprüft werden; fehlerhafte Quellen
stehen nach dem Scan mit Fehlermeldung in der Quellen-Tabelle.

## OSDP-Integration (Stand)

Die Oberfläche ist aus dem HAR-Export vollständig bekannt (Analyse in `docs/OSDP_Analyse.md`) und
die Extension wurde **End-to-End gegen die echte Angular-App im lokalen Nachbau getestet**
(`tests/e2e-mock.mjs`): Felder, CKEditor in allen drei Reitern, Datum, Autor, Tags und Speichern
inklusive geprüftem `POST /api/news`-Payload.

| Bereich im Editor | Umsetzung |
|---|---|
| Native / English Translated / German Translated | `formcontrolname`-Felder + CKEditor `setData()` |
| Metadata | `article_created_at` (Datepicker, `DD/MM/YYYY`), `article_author` + Button „Set to Autor ungenannt“ |
| Tags | direkt über die Angular-Komponente per UID (Eltern vor Kindern); Fallback: Pfad aufklappen und Checkbox anhaken; Kontrolle über die Chips |
| Save | Toast „Item Added!“ = Erfolg; „Duplicate, URL already in the database!“ → Meldung wird als Duplikat markiert |
| Öffnen des Editors | App laden, dann per Hash navigieren (ein Deep-Link direkt nach dem Laden landet in OSDP auf „keine Berechtigung“) |

Offen bleibt nur der Test gegen den echten Server (Login, echte Antwortzeiten).

## Tests

Siehe `tests/README.md`. Kurzfassung: `node tests/catalog.test.mjs`, `node tests/har-tools.test.mjs`,
`node tests/extension-v2.test.mjs`, `node tests/extension-v3.test.mjs` (Playwright nötig) und
`node tests/e2e-mock.mjs` gegen den laufenden Nachbau.

## Lokale Entwicklung mit Nachbau der OSDP-Oberfläche

Ohne Zugriff auf die echte Seite lässt sich das Frontend aus einem HAR-Export lokal betreiben:

```
node tools/redact-har.mjs site-dump/osdp.har               # Zugangsdaten entfernen → osdp.redacted.har
node tools/har-to-mock.mjs site-dump/osdp.redacted.har     # Frontend-Dateien + API-Antworten → mock-osdp/
node tools/mock-osdp-server.mjs                             # http://localhost:4300/#/newsEditor
```

Der Server liefert die aufgezeichneten Antworten (Login, Tag-Baum, Extract …), protokolliert
„Save“-Aufrufe und speichert nichts. In den Extension-Einstellungen das URL-Muster des OSDP-Tabs
auf `http://localhost:4300/*` stellen, dann laufen Side Panel und Automatik gegen den Nachbau.
Was dafür exportiert werden muss, steht in `site-dump/README.md`.

## Projektstruktur

```
manifest.json                      Manifest V3
docs/OSDP_Tagging_Handbuch.md      Tagging-Regeln und Tag-Katalog (Quelle)
tools/build-tag-catalog.mjs        Handbuch → src/config/osdp-tags.json
tools/redact-har.mjs               HAR-Export schwärzen (Cookies, Tokens, Passwörter)
tools/har-to-mock.mjs              HAR → lokaler Nachbau (mock-osdp/)
tools/mock-osdp-server.mjs         Nachbau-Server auf localhost:4300
src/config/osdp-tags.json          Tag-Katalog (673 Tags, Pfade, Tooltip-Ausschnitte)
src/background.js                  Service Worker (Side Panel, Zeitplan)
src/auto/                          Automatik-Seite (Scan → Relevanz → Eintragen, Verlauf)
src/sidepanel/                     Side Panel (Einzelartikel, Werkzeuge)
src/options/                       Einstellungen
src/lib/llm.js                     Modell-Anbindung (Claude / lokal)
src/lib/claude.js                  Claude Messages API (raw HTTP)
src/lib/classify.js                Relevanzprüfung
src/lib/tagger.js                  Tag-Vorschlag nach Handbuch
src/lib/tag-catalog.js             Katalog, Regeln, Validierung
src/lib/translate.js               Übersetzung (Claude / lokal / DeepL / Chrome)
src/lib/history.js                 Verlauf, Statistik, Export
src/lib/osdp-driver.js             Steuerung des OSDP-Editors
src/lib/sources.js, feeds.js       Quellen, RSS/Atom, Link-Sammlung
src/lib/tabloader.js               Seiten in Hintergrund-Tabs laden
src/lib/dates.js, author.js        Datumsregel, Autor-Normalisierung
src/content/news-extractor.js      Artikel auslesen
src/content/osdp-filler.js         DOM-Schritte im OSDP-Editor (Felder, Tag-Baum, Save, Export)
src/content/osdp-inspector.js      Struktur-Dump des OSDP-Editors
site-dump/                         Ablage für DOM-Dumps
```

Kein Build-Schritt, keine Abhängigkeiten.
