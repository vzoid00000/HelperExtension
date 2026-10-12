# OSDP News-Editor – technische Analyse

Quelle: HAR-Export vom 12.10.2026 (`site-dump/osdp.redacted.har`), daraus das Angular-Bundle
`main.js` (Dev-Build, lesbar) und die aufgezeichneten API-Antworten. Ergänzt durch die DOM-Dumps
und den Tag-Export in `site-dump/`.

## Technik

- Angular 17.3 (Dev-Build: `ng-reflect-*`-Attribute, `window.ng` verfügbar), Angular Material, NgRx Store,
  CKEditor 5 (classic build), ngx-toastr für Meldungen, ngx-spinner, Moment-Datepicker.
- API same-origin unter `/api` (`environment.SERVER_URL = "/api"`). Auth per Cookie/JWT (`/api/oauth/checkAuth`
  liefert `{username, role}`); Login läuft über ein Popup `https://news.zentdok.at/#/login?closeAfterLogin=true`.

## Formular (`app-editor`, `inputForm`)

| Control | Reiter | Bemerkung |
|---|---|---|
| `article_source` | Native (und gespiegelt in EN/DE) | `(focusout)` → Duplikatprüfung `POST /api/news/checkURLDuplicates`, `(keydown.enter)` → Extract |
| `article_title`, `article_subtitle`, `article_content` (CKEditor) | Native | |
| `article_title_translateden`, `article_subtitle_translateden`, `article_content_translateden` | English Translated | |
| `article_title_translatedde`, `article_subtitle_translatedde`, `article_content_translatedde` | German Translated | |
| `article_created_at` | Metadata | mat-datepicker, `MomentDateAdapter`, `MAT_DATE_LOCALE = en-GB`, `useUtc`; Eingabe **`DD/MM/YYYY`**; `[max]` = heute |
| `article_author` | Metadata | Button `matTooltip="Set to Autor ungenannt"` → `setUnknownAuthor()` setzt `Autor ungenannt` |
| `article_language` | Metadata | mat-select; leer → beim Speichern `"en"` |
| `article_place`, `lat`, `lon`, `translation_service` | Metadata | optional |
| `article_tags` | Tags | Liste von Tag-UIDs (Zahlen); `article_platforms` wird beim Speichern aus den Tags abgeleitet |

Formular → Store: `inputForm.valueChanges` mit **250 ms Debounce** → `updateArticle`. Store → Formular bei
`programmaticArticleUpdate` (z. B. nach Extract oder der Duplikatprüfung, die `{...this.news, article_domain}`
zurückschreibt). Folge für die Automatisierung: Quellfeld setzen, **≥ 300 ms warten, dann erst blur**,
sonst schreibt die Duplikatprüfung den noch leeren Store-Wert ins Feld zurück.

## Speichern (`updateData(newArticle)`)

Prüfungen vor dem Absenden (jeweils Toast „Error“):

1. Native: `article_content`, `article_title`, `article_source` nicht leer
2. English: `article_content_translateden`, `article_title_translateden` nicht leer
3. German: `article_content_translatedde`, `article_title_translatedde` nicht leer
4. `article_tags` nicht leer („Set tags before saving“)
5. `article_created_at` nicht nach heute („Article date is not allowed to be greater than current day.“)
6. `article_source` muss eine gültige URL sein („Please provide a valid source URL.“)

Dann `updateItem` → `POST /api/news` (neu) bzw. `PUT /api/news/:id`. Erfolg: Toast **„Item Added!“**
(`toast-success`), `resetArticleForm` (Formular leer), erster Reiter aktiv, keine Navigation.
HTTP 409 → Toast **„Duplicate, URL already in the database!“**; 401 → Login-Popup; 403 → „User can only edit own entries!“.

Payload-Felder (Auszug): `article_title, article_author, article_created_at (ISO, UTC-Mitternacht),
article_language, article_tags [UIDs], article_platforms, article_content*, article_title_translated*,
article_hashvalue, article_domain`.

## Tag-Baum (`tag-tree`)

- Flacher `mat-tree`; Knoten `mat-tree-node[aria-level][aria-expanded]`, Toggle `button[mattreenodetoggle]`,
  `mat-checkbox` mit `label.mdc-label`; vollständiger Tooltip im Element, auf das `aria-describedby` zeigt.
- Checkbox `(change)` → `todoLeafItemSelectionToggle(node)` → `addCurrentTag({id: uid})` / `removeCurrentTag`.
  **Kein** Kaskadieren auf Kinder. Eltern bereits gewählter Tags erscheinen „indeterminate“
  (`rlySelected = false`); `blockIfChildIsSelected` verhindert den Klick auf einen solchen Elternknoten.
  Daher: **Eltern vor Kindern** setzen.
- Programmatischer Weg (Dev-Build): `ng.getComponent(document.querySelector('tag-tree'))`,
  `idToNodeMap.get(uid)` → `nestedNodeMap.get(…)` → `todoLeafItemSelectionToggle(flatNode)`.
- `GET /api/tags` liefert alle Tags mit `uid`, `parent`, `item`, `description`, `platform`.

## Berechtigungen

`AuthGuard.canActivate` liest die Rollenrechte **synchron** aus dem Store; beim ersten Laden eines
Deep-Links (`#/newsEditor` nach F5) sind sie oft noch nicht da → Umleitung auf `#/permissionError`.
Umgehung: Seite laden, kurz warten, dann per `location.hash = '#/newsEditor'` navigieren.

## Weitere Endpunkte

| Aufruf | Zweck |
|---|---|
| `POST /api/scrape {url, news: true, html: false, detailed: false}` | serverseitiger Extractor: `{title, authors[], content, content_formatted, publishing_date, language, subtitle}` |
| `POST /api/translate` | Übersetzung über NeuralSeek (`/api/translations/translationTool`) |
| `POST /api/search {query, onlyMeta, from, size, tags, …}` | Trefferliste; `article.tags` = UIDs |
| `GET /api/role/byName/:role` | Rechte (`canCreateEntries`, `canSearch`, …) |

## Nachbau

`tools/har-to-mock.mjs` + `tools/mock-osdp-server.mjs` liefern das Frontend lokal; `tests/e2e-mock.mjs`
füllt darin einen Artikel komplett aus und prüft den `POST /api/news`-Payload.
