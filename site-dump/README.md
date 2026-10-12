# site-dump

Hier liegen die Dateien, die die Struktur des OSDP News-Editors beschreiben. Sie sind die
Grundlage für `src/content/osdp-filler.js` und `src/lib/osdp-driver.js`.

## Vorhandener Dump (12.10.2026)

Ergab: Angular 17.3 + Angular Material, CKEditor 5. Zwei Tab-Gruppen:

- Native | English Translated | German Translated | Summary
  (je `article_source`, `article_title…`, `article_subtitle…`, `article_content…`)
- Metadata | Tags (Tag-Baum: Struktur, Cyber, KriMiSi, InnoTech, Allgemeine Tags, Newsinfo, Auftragstags)

Kopfzeile: Save, Extract, Summary, Translate.

**Offen:** Der Reiter „Metadata“ war beim Dump nicht geöffnet und ist lazy gerendert, daher
fehlen Autor- und Datumsfeld sowie der „Autor ungenannt“-Button.

## Nächster Dump: Reiter „Metadata“

1. OSDP News-Editor öffnen, am besten mit einer bereits gespeicherten Test-News
2. Rechts den Reiter **„Metadata“** anklicken, damit er gerendert ist
3. Optional: im Reiter „Tags“ die Knoten „Cyber“ und „KriMiSi“ aufklappen (Pfeil links),
   damit die Unter-Tags sichtbar sind
4. Side Panel → Werkzeuge → „OSDP-Formular analysieren“
5. Die zwei Dateien hierher legen oder im Chat einfügen

## Optional: Speicher-Request

DevTools (F12) → Network → Fetch/XHR → Test-News speichern → Request → Rechtsklick → Copy →
„Copy as fetch“ → als `save-request.txt` ablegen. **Vorher `Authorization`, `Cookie` und
Tokens entfernen.** Damit ließe sich die News direkt über die API anlegen.
