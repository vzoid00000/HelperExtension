# Tests

Alle Tests laufen mit Node ≥ 20 ohne Build-Schritt. Die Browser-Tests brauchen das npm-Paket
`playwright` (global oder im Projekt) mit installiertem Chromium.

```
node tests/catalog.test.mjs          # Tag-Katalog: Regeln, Auflösung, Validierung (ohne Browser)
node tests/har-tools.test.mjs        # redact-har, har-to-mock, mock-osdp-server (ohne Browser)
node tests/bridge.test.mjs           # Claude-Code-Brücke mit CLI-Attrappe (ohne Browser)
node tests/extension-v2.test.mjs     # Extension laden, Extractor, Filler gegen Nachbau-Fixture
node tests/extension-v3.test.mjs     # Tag-Baum (applyTags, exportTagTree), lokaler LLM-Client, Verlauf
node tests/review.test.mjs           # Freigabe-Schleife: fillArticle ohne Save → waitForReview (Leiste, Save-Klick, Duplikat, Abbruch)
node tests/app.test.mjs              # App-Seite v0.6: Navigation, Einstellungen, Quellen, Regeln, Verlauf, Lauf mit Freigabe (Mock-LLM + Fixture)
node tests/stores.test.mjs           # Quellen-Verwaltung, Verlauf (Duplikate, Suche), Regeln, Gesamtexport/-import (ohne Browser)
node tests/prompts.test.mjs          # Kompakter Katalog, Tagging-/Übersetzungs-/Relevanz-Prompts mit Regelwerk (ohne Browser)
node tests/design.test.mjs           # Seitengerüst src/app/app.html: IDs, Dark Theme, Überläufe, Screenshots (ohne app.js)
```

## App-Seite (`tests/app.test.mjs`)

Lädt die Extension und öffnet `src/app/app.html` (die einzige Seite seit v0.6). Geprüft werden
Navigation (Klick und Hash `#lauf`, `#quellen`, `#verlauf`, `#regeln`, `#einstellungen`), die
Einstellungen (Sparmodus-Preset, Speichern nach `chrome.storage`, Validierung), die Quellen-Verwaltung
(Dialog mit Validierungsfehler, Anlegen, Switch, Bearbeiten, Löschen, Text-Dialog), die Regeln (Anlegen
per Enter, Switch, `rulesPromptBlock`, Korrektur-Dialog mit Regel-Vorschlag) und der Verlauf
(Duplikat-Badge mit Tooltip, KPIs je Zeitraum, Suche, WB umschalten, „Korrektur melden“).

Der Lauf wird ohne Netz durchgespielt: ein lokaler HTTP-Server liefert `tests/fixtures/article.html`
mit dem heutigen Datum (Datumsregel), ein Mock-LLM beantwortet Übersetzung (Text) und Tagging (JSON
mit gültigen Katalogpfaden), die OSDP-Fixture `tests/fixtures/osdp-real.html` läuft als `file://`-Tab
(`osdpUrlPattern = file:///*`). Ablauf: URL manuell hinzufügen → „Ausgewählte eintragen“ → Formular
in der Fixture gefüllt, Freigabe-Card und Leiste sichtbar, kein Save-Event → „Überspringen“ → Status
„übersprungen“ → erneut eintragen → „Als gespeichert markieren“ → Verlauf hat einen Eintrag, URL als
erledigt gemerkt, Meldungsliste überlebt ein Neuladen. Dabei wird gezählt, dass genau eine
Übersetzungs- und eine Tagging-Anfrage gestellt wurden (Titel + Text in einer Anfrage).

Weitere Blöcke prüfen die Korrekturen aus der Code-Review: Hinweistexte, Platzhalter mit echten
Katalogtags, `isRunning()`/`stopRun()`, die Bereichssperre während eines Laufs, den Warn-Hinweis in
der Leiste bei Problemen beim Ausfüllen, die Duplikat-Vorabprüfung vor Übersetzung und Tagging,
dass transiente Status (`processing`/`waiting`) nach einem Neuladen zurückgesetzt sind und dass
`?autorun=1` aus der Adresse entfernt wird.

Hinweis: In der Fixture lässt sich der Tag-Baum nicht aufklappen (nur drei Wurzelknoten ohne Kinder),
deshalb melden die Tag-Schritte „nicht gefunden“ als Problem – der Lauf läuft wie in OSDP weiter und
zeigt die Hinweise in der Freigabe-Card; die Chip-Liste bleibt leer, sodass keine Korrektur erkannt wird
(der Korrektur-Dialog wird im Regeln-Block direkt getestet).

## Freigabe-Schleife (`tests/review.test.mjs`)

Lädt die Extension, öffnet `tests/fixtures/osdp-real.html` als `file://`-Tab und steuert ihn mit dem
echten `OsdpDriver` aus einer Extension-Seite (`osdpUrlPattern = file:///*`; Erweiterungen aus
`--load-extension` haben Dateizugriff, deshalb erreicht `chrome.scripting` den Tab). Geprüft werden
`fillArticle` ohne Save (`report.chips`, `report.sourceValue`), die Leiste (`showOverlay` idempotent,
`readOverlay`, `hideOverlay`) und `waitForReview` mit allen Ausgängen:

| Szenario | Auslöser | Ergebnis |
|---|---|---|
| a | „Überspringen“ in der Leiste | `skip`; danach lädt `freshEditor` neu |
| b | Save-Button der Fixture (Toast „Item Added!“ + Formular-Reset) | `saved`, `chips` = Tags vor dem Reset |
| c | `external()` liefert `abort`, alter Erfolgstoast noch sichtbar | `abort`; alter Toast zählt nicht |
| d | Toast „Duplicate, URL already in the database!“ | `duplicate` |
| e | Formular-Reset ohne Erfolgstoast (Toast schon weg), Fehlertoast davor | `saved` über `formReset` |
| f | `timeoutMs` abgelaufen | `timeout` |
| g | OSDP-Tab geschlossen | `lost`, kein neuer Tab |

Die Fixture leert nach „Save“ wie OSDP (`resetArticleForm`) Felder, Editoren, Tags und Chips und
blendet den Toast nach 4 s aus; `window.__showToast(kind, title, message)` und `window.__resetForm()`
stehen Tests zur Verfügung. `tests/extension-v2.test.mjs` läuft damit unverändert.

## End-to-End gegen die echte OSDP-Oberfläche (aus dem HAR-Export)

```
node tests/e2e-mock.mjs
```

Der Test ist standalone: fehlt `mock-osdp/`, baut er ihn aus `site-dump/osdp.redacted.har`
(`tools/har-to-mock.mjs`) und startet `tools/mock-osdp-server.mjs` selbst (Port aus
`mock-osdp/api.json`, sonst `MOCK_PORT` bzw. 4300; ein bereits laufender Nachbau auf dem Port wird
weiterverwendet). Ablauf wie in der App: Extension geladen, `fillArticle` ohne Save gegen die echte
Angular-App (Felder, CKEditor in drei Reitern, Metadata, Tags über Angular, Nachkorrektur per
DOM-Klick), Freigabe-Leiste sichtbar, dann wird „Save“ im OSDP-Tab geklickt wie vom Nutzer →
`waitForReview` liefert `saved`, der `POST /api/news`-Payload wird geprüft und das Formular ist leer.
