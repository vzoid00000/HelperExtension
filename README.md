# OSDP News Helper (Chrome Extension)

Automatisiert das Eintragen von News in den OSDP News-Editor
(`https://osdp.zentdok.at/#/newsEditor`) in zwei Bereichen:

- **Cyber**: Cyberangriffe von Relevanz, Aufstockung/Verbesserung von Systemen
- **KriMiSi**: Krisen, Militär, Sicherheit (Kriege, Anschläge, wichtige diplomatische Treffen)

## Was die Automatik macht

1. **Quellen scannen**: Liest alle konfigurierten Nachrichtenquellen (RSS-Feeds und
   Übersichtsseiten) und sammelt Meldungen ab dem letzten Freitag.
2. **Relevanz prüfen**: Claude bewertet jede Schlagzeile (Bereich Cyber/KriMiSi/keiner,
   Wichtigkeit 0–10). Alles ab der Schwelle (Standard 6) wird ausgewählt.
3. **Eintragen**: Für jede ausgewählte Meldung
   - Artikel laden und Text, Autor, Datum auslesen (Datum erneut gegen „letzter Freitag“ geprüft)
   - Autor nur, wenn es eine natürliche Person ist, sonst „Autor ungenannt“
   - Titel und Text Englisch → Deutsch übersetzen (Claude, DeepL oder Chrome-intern)
   - OSDP-Editor neu laden und befüllen: Native (URL, Titel, Inhalt), English Translated,
     German Translated, Metadata (Autor, Datum), Tags (Cyber oder KriMiSi)
   - „Save“ klicken (abschaltbar) und die URL als erledigt merken

Dieselbe Meldung von mehreren Quellen wird jeweils eigenständig eingetragen.

## Installation

1. Repository klonen oder ZIP entpacken
2. Chrome: `chrome://extensions` → **Entwicklermodus** einschalten → **„Entpackte Erweiterung laden“** → Projektordner wählen
3. Extension-Icon klicken → Side Panel → ⚙ Einstellungen:
   - **Claude API-Key** eintragen (console.anthropic.com). Nötig für die Relevanzprüfung und die Standard-Übersetzung.
   - Optional DeepL-Key, Quellen, Schwelle, Zeitplan
   - „Speichern“, dann „Übersetzung testen“
4. In OSDP einloggen (ein Tab mit `osdp.zentdok.at` reicht, die Extension nutzt die Anmeldung des Browsers)

Nach Code-Änderungen in `chrome://extensions` auf „Aktualisieren“ (↻) klicken.

## Bedienung

**Automatik** (Side Panel → „Automatik öffnen“ oder direkt die Seite `src/auto/auto.html` der Extension):

- **▶ Alles automatisch** führt Scan → Relevanzprüfung → Eintragen in einem Rutsch aus.
- Oder Schritt für Schritt: **1 · Quellen scannen**, **2 · Relevanz prüfen**, Auswahl in der
  Tabelle kontrollieren (Haken setzen/entfernen, Zeile anklicken für Begründung), **3 · Ausgewählte eintragen**.
- **■ Stopp** beendet nach der laufenden Meldung.
- Das Protokoll zeigt jeden Schritt; Fehler stehen in der Status-Spalte (Maus darüber).

**Einzelner Artikel** (Side Panel): Artikel-Tab öffnen → „Aktuellen Tab auslesen“ → prüfen →
„Übersetzen“ → „Formular ausfüllen“ (optional mit „Save“).

**Zeitplan**: In den Einstellungen eine Uhrzeit eintragen (z. B. 08:00). Mo–Fr öffnet sich zu
dieser Zeit die Automatik-Seite und startet „Alles automatisch“. Chrome muss dafür laufen.

### Datumsregel

„Letzter Freitag“ ist der jüngste Freitag **vor** heute. Ältere Artikel werden nie eingetragen.

| Heute | Erlaubt ab |
|---|---|
| Montag | Freitag vor 3 Tagen |
| Dienstag–Donnerstag | Freitag der laufenden Vorwoche |
| Freitag | Freitag der Vorwoche (7 Tage) |
| Samstag / Sonntag | gestern / vorgestern |

## Quellen

Standardliste in `src/lib/sources.js` (BleepingComputer, The Record, The Hacker News, SecurityWeek,
CyberScoop, Dark Reading, Infosecurity, Krebs, The Register; BBC World, Guardian World, Al Jazeera,
Defense News, Breaking Defense, The War Zone, Military Times, Politico Europe, DW, Kyiv Independent,
Times of Israel, UN News, NATO; AP News und Reuters per Übersichtsseite).

Eigene Liste in den Einstellungen, eine Quelle pro Zeile:

```
Name | URL | cyber|krimisi|both | rss|html | URL-Muster (nur html, optional)
BleepingComputer | https://www.bleepingcomputer.com/feed/ | cyber | rss
AP News – World | https://apnews.com/world-news | krimisi | html | apnews\.com/article/
# Deaktivierte Quelle | https://… | both | rss
```

Die Feed-URLs der Standardliste konnten aus der Entwicklungsumgebung heraus nicht geprüft werden.
Fehlerhafte Quellen stehen nach dem Scan mit Fehlermeldung in der Quellen-Tabelle und
lassen sich in den Einstellungen korrigieren.

## Übersetzung und Relevanzprüfung

| Anbieter | Qualität | Kosten | Einrichtung |
|---|---|---|---|
| Claude API (`claude-opus-5-5`) | sehr gut | pro Token, API-Key | console.anthropic.com → API Key |
| DeepL | gut | Free-Tarif 500.000 Zeichen/Monat | deepl.com/pro-api → Free-Key (`…:fx`) |
| Chrome integriert | mittel | kostenlos | Chrome 138+, Modell wird beim ersten Mal geladen |

Die Relevanzprüfung läuft immer über Claude (Schlagzeilen in Paketen zu 40, strukturierte
JSON-Antwort). Beim Claude-Aufruf ist der serverseitige Fallback aktiviert: Lehnt der
Sicherheitsfilter eine Anfrage ab (bei Texten über Cyberangriffe möglich), wird sie automatisch
auf einem anderen Claude-Modell wiederholt.

API-Keys werden nur lokal in `chrome.storage.local` gespeichert.

## OSDP-Integration (Stand)

Die Struktur des Editors stammt aus dem DOM-Dump (`site-dump/`): Angular 17 + Angular Material,
CKEditor 5 für die Inhalte.

| Bereich im Editor | Umsetzung | Stand |
|---|---|---|
| Native: Source, Title, Content | `formcontrolname` + CKEditor `setData()` | aus Dump bekannt, getestet gegen Nachbau |
| English Translated / German Translated | wie Native, eigene Controls | aus Dump bekannt |
| Tags: Cyber / KriMiSi | Checkbox im Tag-Baum | aus Dump bekannt |
| Save / Extract | Buttons in der Kopfzeile | aus Dump bekannt |
| **Metadata: Autor, Datum, „Autor ungenannt“** | Suche über Label-Text im Reiter | **Reiter war im Dump nicht geöffnet – noch unbestätigt** |

Der Reiter „Metadata“ wird lazy gerendert; die Extension öffnet ihn und sucht Felder mit
Label „Author/Autor“ und „Date/Datum“ sowie einen Button „Autor ungenannt“. Was sie dort
findet, steht im Bericht (Zeile in der Meldungstabelle aufklappen → „Metadata-Felder“).
Für eine exakte Zuordnung bitte einen Dump mit geöffnetem Reiter „Metadata“ erzeugen
(siehe `site-dump/README.md`).

## Projektstruktur

```
manifest.json                      Manifest V3
src/background.js                  Service Worker (Side Panel, Zeitplan)
src/auto/                          Automatik-Seite (Scan → Relevanz → Eintragen)
src/sidepanel/                     Side Panel (Einzelartikel, Werkzeuge)
src/options/                       Einstellungen
src/lib/sources.js                 Standardquellen, Quellen-Format
src/lib/feeds.js                   RSS/Atom parsen, Links sammeln
src/lib/tabloader.js               Seiten in Hintergrund-Tabs laden
src/lib/classify.js                Relevanzprüfung (Claude, JSON-Schema)
src/lib/translate.js               Übersetzung (Claude / DeepL / Chrome)
src/lib/claude.js                  Claude Messages API (raw HTTP)
src/lib/osdp-driver.js             Steuerung des OSDP-Editors (Tabs, CKEditor, Save)
src/lib/dates.js                   Datumsregel, Parsen, Formatieren
src/lib/author.js                  Autor-Normalisierung
src/lib/settings.js                Einstellungen und Defaults
src/content/news-extractor.js      Artikel auslesen, Links sammeln
src/content/osdp-filler.js         DOM-Schritte im OSDP-Editor
src/content/osdp-inspector.js      Struktur-Dump des OSDP-Editors
site-dump/                         Ablage für DOM-Dumps
```

Kein Build-Schritt, keine Abhängigkeiten.

## Hinweise

- `host_permissions: <all_urls>` ist nötig, um Feeds und Artikel beliebiger News-Seiten zu laden.
- Seiten, die einfache Abrufe blockieren (z. B. Reuters), werden in einem unsichtbaren
  Hintergrund-Tab geladen. Paywall-Inhalte sind nur lesbar, wenn der Browser eingeloggt ist.
- Bereits eingetragene URLs werden gemerkt und beim nächsten Scan übersprungen
  („Liste leeren“ setzt das zurück).
