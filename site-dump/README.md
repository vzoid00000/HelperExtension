# site-dump

Hier kommen die Dateien hinein, die die Struktur des OSDP News-Editors beschreiben.
Sie werden gebraucht, um die Feldzuordnung in `src/config/osdp-selectors.js` exakt festzulegen.

## Was hier liegen soll

1. **`osdp-dump-<datum>.json` und `osdp-dump-<datum>.html`**
   Erzeugt über die Extension: Side Panel → Werkzeuge → „OSDP-Formular analysieren“.
   Dabei sollte der News-Editor geöffnet sein, idealerweise mit einer bereits
   ausgefüllten Test-News (dann sieht man z. B. das Datumsformat).

2. **Optional: `save-request.txt`** – der Netzwerk-Request, den die Seite beim Speichern
   einer News abschickt. So aufnehmen:
   - DevTools (F12) → Tab „Network“ → Filter „Fetch/XHR“
   - Eine Test-News speichern
   - Den Request anklicken → Rechtsklick → Copy → „Copy as fetch“ (oder „Copy as cURL“)
   - In diese Datei einfügen

3. **Optional: Screenshot** des Editors (`editor.png`).

## WICHTIG: Keine Zugangsdaten committen

Vor dem Ablegen im Repository aus dem Request unbedingt entfernen bzw. durch `XXX` ersetzen:

- `Authorization: Bearer …`
- `Cookie: …`
- `X-CSRF-Token`, `X-XSRF-TOKEN` oder ähnliche Tokens

Der JSON/HTML-Dump der Extension enthält keine Cookies oder Tokens, aber ggf. den
Inhalt der gerade geöffneten News – also bitte nur mit einer Test-News erzeugen.
