# OSDP News Helper (Chrome Extension)

Automatisiert das Eintragen von News in den OSDP News-Editor
(`https://osdp.zentdok.at/#/newsEditor`):

1. Artikel auf einer englischsprachigen News-Seite auslesen (URL, Titel, Autor, Datum, Text)
2. Datum gegen die „letzter Freitag“-Regel prüfen
3. Titel und Text Englisch → Deutsch übersetzen (Claude API, DeepL oder Chrome-intern)
4. Alles in das OSDP-Formular eintragen (Speichern bleibt manuell, zur Kontrolle)

Bereiche: **Cyber** (Cyberangriffe, Aufrüstung/Verbesserung von Systemen) und
**KriMiSi** (Krisen, Militär, Sicherheit: Kriege, Anschläge, wichtige diplomatische Treffen).

## Status

| Teil | Stand |
|---|---|
| Artikel auslesen (Meta-Tags, JSON-LD, Textheuristik) | fertig, muss an echten Seiten getestet werden |
| Datumsregel „letzter Freitag“ | fertig |
| Autor: nur natürliche Personen, sonst „Autor ungenannt“ | fertig (Heuristik, manuell korrigierbar) |
| Übersetzung Claude / DeepL / Chrome | fertig |
| OSDP-Formular ausfüllen | **vorläufig** – Felder werden über Label-Text gesucht, bis der DOM-Dump vorliegt |
| OSDP-Analyse (Dump) | fertig |

## Installation (Entwicklermodus)

1. Repository klonen oder als ZIP herunterladen und entpacken
2. Chrome: `chrome://extensions` öffnen → oben rechts **Entwicklermodus** einschalten
3. **„Entpackte Erweiterung laden“** → den Projektordner (mit `manifest.json`) auswählen
4. Auf das Extension-Icon klicken → das Side Panel öffnet sich
5. Zahnrad ⚙ → Übersetzungs-Anbieter wählen und API-Key eintragen → Speichern → „Übersetzung testen“

Nach Code-Änderungen: in `chrome://extensions` bei der Extension auf „Aktualisieren“ (↻) klicken.

## Arbeitsablauf

1. News-Artikel im Browser öffnen, Side Panel öffnen
2. **Bereich** wählen (Cyber / KriMiSi)
3. **„Aktuellen Tab auslesen“** – Felder werden gefüllt, Datum wird geprüft:
   - grün „OK“: Datum ist ≥ letzter Freitag
   - rot „zu alt“: Artikel darf nicht eingetragen werden (Eintragen wird blockiert)
   - gelb „Datum unbekannt“: Datum von Hand eintragen (TT.MM.JJJJ)
   - Autor: Wenn der erkannte Autor keine Person ist (Redaktion, Agentur, „Staff“), ist
     „Autor ungenannt“ automatisch angehakt. Jederzeit manuell änderbar.
4. **„Übersetzen“** – Titel (DE) und Text (DE) werden erzeugt; bitte gegenlesen und ggf. korrigieren
5. OSDP-Tab mit dem News-Editor offen haben → **„Formular ausfüllen“**
   - Die Extension wechselt zum OSDP-Tab und zeigt, welche Felder gefüllt wurden
   - Im OSDP-Editor kontrollieren und dort speichern

Der Entwurf bleibt im Side Panel erhalten, bis „Leeren“ gedrückt oder ein neuer Artikel ausgelesen wird.

### Datumsregel

„Letzter Freitag“ ist der jüngste Freitag **vor** heute:

| Heute | Erlaubt ab |
|---|---|
| Montag | Freitag vor 3 Tagen |
| Dienstag–Donnerstag | Freitag der laufenden Vorwoche |
| Freitag | Freitag der Vorwoche (7 Tage) |
| Samstag / Sonntag | gestern / vorgestern |

Logik in `src/lib/dates.js` (`lastFriday`, `checkArticleDate`).

## Übersetzung

| Anbieter | Qualität | Kosten | Einrichtung |
|---|---|---|---|
| Claude API (`claude-opus-5-5`) | sehr gut | pro Zeichen, API-Key | console.anthropic.com → API Key |
| DeepL | gut | Free-Tarif 500.000 Zeichen/Monat | deepl.com/pro-api → Free-Key (`…:fx`) |
| Chrome integriert | mittel | kostenlos | Chrome 138+, Sprachmodell wird beim ersten Mal geladen |

Beim Claude-Aufruf ist der serverseitige Fallback aktiviert: Falls der Sicherheitsfilter
eine Übersetzung ablehnt (kann bei Cyberangriff-Texten vorkommen), wird sie automatisch
auf einem anderen Claude-Modell wiederholt.

API-Keys werden nur lokal in `chrome.storage.local` gespeichert und nie ins Repository geschrieben.

## OSDP-Feldzuordnung anpassen

Die Zuordnung steht in `src/config/osdp-selectors.js`. Solange die echten Selektoren
fehlen, sucht der Filler Felder über Label-Text, Platzhalter, `aria-label`, `name`,
`id` und `formControlName`.

So wird die Zuordnung exakt:

1. OSDP News-Editor öffnen (am besten mit einer ausgefüllten Test-News)
2. Side Panel → Werkzeuge → **„OSDP-Formular analysieren“**
3. Die zwei Dateien aus dem Download-Ordner nach `site-dump/` kopieren (siehe `site-dump/README.md`)
4. Daraus werden die `selector`-Einträge gesetzt. Ohne Neuladen der Extension gehen auch
   Overrides in den Einstellungen (JSON), z. B.:

```json
{
  "title": { "selector": "input[formcontrolname=title]" },
  "date": { "selector": "input[formcontrolname=newsDate]" },
  "authorUnknownButton": { "selector": "button.author-unknown" }
}
```

## Projektstruktur

```
manifest.json                      Manifest V3
src/background.js                  Service Worker (Side Panel öffnen, Defaults)
src/sidepanel/                     Oberfläche (HTML/CSS/JS)
src/options/                       Einstellungen
src/lib/dates.js                   Datumsregel, Parsen, Formatieren
src/lib/author.js                  Autor-Normalisierung (natürliche Person?)
src/lib/translate.js               Übersetzung (Claude / DeepL / Chrome)
src/lib/settings.js                Einstellungen und Defaults
src/content/news-extractor.js      Auslesen von News-Seiten
src/content/osdp-filler.js         Eintragen in den OSDP-Editor
src/content/osdp-inspector.js      Struktur-Dump des OSDP-Editors
src/config/osdp-selectors.js       Feldzuordnung OSDP
site-dump/                         Ablage für den OSDP-Dump
```

Kein Build-Schritt, keine Abhängigkeiten.

## Hinweise

- `host_permissions: <all_urls>` ist nötig, damit „Aktuellen Tab auslesen“ auf jeder News-Seite
  funktioniert, ohne jede Domain einzeln freizugeben.
- Bei Paywall-Seiten wird nur der sichtbare Text ausgelesen.
- Rich-Text-Editoren (Quill, ProseMirror, contenteditable) werden unterstützt; TinyMCE/CKEditor
  in iframes nur, wenn sie same-origin sind.
