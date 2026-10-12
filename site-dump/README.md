# site-dump – Was von OSDP exportiert werden soll

Ziel: Alles, was nötig ist, um die OSDP-Oberfläche **lokal nachzubauen** und die Extension
ohne Zugriff auf die echte Seite zu testen. Alle Dateien hierher legen und committen.

## 1. HAR-Export (wichtigste Datei)

Ein HAR enthält alle Dateien des Frontends (index.html, main.js, styles.css, Assets) **und**
alle Antworten des Servers (Login, Tag-Baum, Speichern, Extract, Translate). Daraus baut
`tools/har-to-mock.mjs` den lokalen Nachbau.

So aufnehmen (Chrome):

1. OSDP-Tab öffnen, **F12** → Reiter **Network**
2. Oben **„Preserve log“** anhaken, Filter auf **„All“** (nicht nur Fetch/XHR)
3. **F5** drücken, damit index.html und alle Bundles neu geladen werden
4. Falls die Anmeldung erscheint: einloggen (der Login-Request ist für den Nachbau nützlich)
5. News-Editor öffnen und **alles einmal benutzen**:
   - eine bestehende News aufrufen (über „Search“) und zurück zu „Add Item“
   - Reiter **Metadata** öffnen, Autor- und Datumsfeld anklicken, „Autor ungenannt“-Button drücken
   - Reiter **Tags** öffnen, mehrere Knoten aufklappen (Cyber, KriMiSi, Newsinfo → geographische Lokationen, Auftragstags), ein paar Tags anhaken und wieder abhaken
   - im Feld „Search Terms“ etwas tippen (Autocomplete-Request)
   - URL einer Test-News in „Source“ eintragen, **Extract** klicken, danach **Translate** klicken
   - eine **Test-News speichern** („Save“), wenn das erlaubt ist, sonst diesen Schritt auslassen
6. Network-Tab: Rechtsklick in die Liste → **„Save all as HAR with content“**
   (neuere Chrome-Versionen fragen: „Export HAR (with sensitive data)“ wählen, damit Inhalte enthalten sind)
7. Datei als `site-dump/osdp.har` speichern

Dann **schwärzen** (entfernt Cookies, Tokens, Passwörter, JWTs):

```
node tools/redact-har.mjs site-dump/osdp.har
```

Erzeugt `site-dump/osdp.redacted.har`. **Nur diese Datei committen** (`.gitignore` blockt das Original).
Vor dem Commit die Datei kurz nach dem eigenen Benutzernamen/Passwort durchsuchen.

## 2. DOM-Dumps (Extension → Werkzeuge)

- **„OSDP-Formular analysieren“** mit geöffnetem Reiter **Metadata** → `osdp-dump-….json/.html`
- **„Tag-Baum mit Tooltips exportieren“** → `osdp-tags-….json` (alle 673 Tags mit vollständigen Tooltips)

## 3. Screenshots (optional, aber hilfreich)

Je ein Bildschirmfoto von: Native-Tab, German-Translated-Tab, Metadata-Tab, Tags-Tab mit
aufgeklappten Knoten, Snackbar/Meldung nach dem Speichern, Login-Seite. Als `screenshot-….png`.

## 4. Sonstiges (falls vorhanden)

- Tagging-Handbuch (liegt bereits unter `docs/`)
- Vorlagen oder Beispiele fertiger Wochenberichte (zeigt, wie WB-Einträge aussehen sollen)
- Liste der vorgegebenen News-Seiten

## Nachbau lokal starten

```
node tools/har-to-mock.mjs site-dump/osdp.redacted.har       # erzeugt mock-osdp/
node tools/mock-osdp-server.mjs                                # http://localhost:4300/#/newsEditor
```

In den Extension-Einstellungen „URL-Muster des OSDP-Tabs“ auf `http://localhost:4300/*` setzen.
Der Nachbau liefert die aufgezeichneten Serverantworten; „Save“ wird protokolliert
(Konsole des Servers und `http://localhost:4300/__mock/log`), aber nichts wirklich gespeichert.
Einzelne Antworten lassen sich über `mock-osdp/overrides.json` ändern.

## Vorhandener Dump (12.10.2026)

Angular 17.3 + Angular Material, CKEditor 5. Tab-Gruppen Native | English Translated |
German Translated | Summary sowie Metadata | Tags. Kopfzeile: Save, Extract, Summary, Translate.
Der Reiter „Metadata“ war nicht geöffnet und fehlt daher noch.
