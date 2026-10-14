# Design-System „OSDP News Helper“ (v0.6)

Stil: **shadcn/ui, Thema „zinc“, Dark Mode** – reines CSS ohne Tailwind, ohne externe Fonts
(Extension-CSP). Dateien: `src/app/ui.css` (Design-System), `src/app/app.css` (Seitenlayout),
`src/app/app.html` (Gerüst aller Ansichten). Schrift: `Inter, "Segoe UI", system-ui, sans-serif`,
Grundgröße 14px, Abstände 16/24px, Radius `--radius: 0.5rem`.

## Tokens (`:root`, HSL-Tripel → `hsl(var(--token))`, mit Alpha `hsl(var(--token) / 0.5)`)

| Token | Wert | Verwendung |
|---|---|---|
| `--background` / `--foreground` | `240 10% 3.9%` / `0 0% 98%` | Seite, Text |
| `--card`, `--popover` | wie Background | Karten, Dialoge |
| `--primary` / `--primary-foreground` | `0 0% 98%` / `240 5.9% 10%` | Hauptaktion (weiß auf dunkel) |
| `--secondary`, `--muted`, `--accent`, `--border`, `--input` | `240 3.7% 15.9%` | Flächen, Linien, Hover |
| `--muted-foreground` | `240 5% 64.9%` | Nebentext, Tabellenkopf |
| `--destructive` | `0 62.8% 30.6%` | Rote Buttons/Badges (Fläche) |
| `--ring` | `240 4.9% 83.9%` | Fokusring |
| `--sidebar-background` | `240 5.9% 10%` | Navigation links |
| `--success`, `--warning`, `--danger`, `--info` | grün, gelb, rot (hell), blau | Status, Text auf dunklem Grund |
| `--cyber` (Blau), `--krimisi` (Amber), `--wb` (Violett), `--innotech` (Teal) | Fachfarben | Badges, KPI-Werte |

Weitere: `--font-sans`, `--font-mono`, `--shadow-sm`, `--shadow-lg`, `--radius-md` (6px), `--radius-sm` (4px).

## Komponenten (Klassen)

- **Buttons** `.btn` + Variante `.btn-primary | .btn-secondary | .btn-outline | .btn-ghost | .btn-destructive`;
  Kombinationen `.btn-outline.btn-destructive` (roter Rahmen) und `.btn-ghost.btn-destructive`;
  Größen `.btn-sm` (32px), `.btn-xs` (28px, für Tabellen), `.btn-lg`; `.btn-icon` (quadratisch); Icon als `<svg class="icon"><use href="#i-…"/></svg>`.
- **Felder** `.input`, `.select`, `.textarea` (+ `-sm`/`-xs`), `.input-icon` (Suchfeld mit Symbol),
  `.field` (Label + Eingabe + Hinweis: `.label`, `.hint`), `.form-grid` (2 Spalten, `.span-2`), `.switch-row` (Text links, Schalter rechts).
- **Schalter/Checkbox** `<input type="checkbox" class="switch">` bzw. `class="checkbox"`; Textvarianten `.switch-label`, `.check-label`.
- **Badges** `.badge` + `.badge-secondary | -muted | -outline | -destructive | -success | -warning | -danger | -cyber | -krimisi | -wb | -innotech`, `.badge-sm`; Farbpunkt `.dot` (z. B. `.badge-outline.scope-tagging`).
- **Tag-Chips** `.chips > .chip` (`.chip-added` grün, `.chip-removed` rot durchgestrichen, `.chip-sm`).
- **Card** `.card > .card-header (.card-title, .card-description) + .card-content + .card-footer`;
  `.card-header-row` für Titel links / Toolbar rechts (`.card-heading` + `.toolbar`); `.card-compact`.
- **Tabelle** `.table-wrap > table.table` (muted Kopfzeile, dünne Trennlinien, Hover); Zellen `.num` (rechtsbündig, Tabellenziffern),
  `.title-cell` (Ellipsis, max. 420px), `.clip`/`.clip-2` (1 bzw. 2 Zeilen), `.actions` (rechts, Icon-Buttons `.btn-ghost.btn-xs.btn-icon`),
  `.table-sm`; Zeilen `.selected`, `.clickable`, `.details`.
- **Tabs** `.tabs > button.tab[.active]` (Unterstrich) mit Zähler `.tab-count`; **Segment** `.segmented > button.segment[.active]` (+ `.segmented-sm`).
- **Dialog** `<dialog class="dialog">` (`.dialog-lg`) mit `.dialog-header (.dialog-title, .dialog-description)`, `.dialog-body`, `.dialog-footer`; öffnen per `showModal()`, Backdrop und Einblendung sind gestylt.
- **Toast** `#toasts.toast-stack > .toast[.toast-success|.toast-warn|.toast-error] > .toast-title + .toast-desc + button.toast-close`; zum Ausblenden `.toast-leaving` setzen, dann entfernen.
- **Status** `.status` (+ `.status-ok | .status-warn | .status-err | .status-busy`), leer = unsichtbar; Hinweisbox `.alert` (+ `.alert-info`, `.alert-warn`, `.alert-title`).
- **Fortschritt** `.progress > .progress-bar` (Breite per `style.width`), `.progress-indeterminate`; `.spinner`.
- **KPI** `.stat > .stat-label + .stat-value (+ .stat-hint)`; Farbvarianten `.stat-cyber`, `.stat-krimisi`, `.stat-wb`, `.stat-warning`.
- **Sonstiges** `.empty` (Leerzustand mit `.empty-title`), `.kbd`, `.log` (Protokoll `<pre>`), `.muted`, `.small`, `.mono`, `.row`, `.stack`, `.toolbar`, `.spacer`, `.sep`, `.divider`.

## Layout (`app.css`)

`.app` = Grid `220px | 1fr`. `.sidebar` (sticky, 100vh): `.brand`, `.nav > a.nav-link[data-view][.active]` mit Icon + `.nav-text` + optional `.nav-count`,
`.sidebar-footer` (Statuspunkt `.status-dot[-busy|-warn|-off]`, Version). `.main > .main-inner` (max. 1240px). Jede Ansicht ist
`section.view#view-…` (alle außer der ersten `hidden`), beginnt mit `.page-header` (`.page-title`, `.page-sub`, `.page-actions`).
Raster: `.grid-2`, `.stats` (6 KPI), `.settings-cols` (2 Spalten). Unter 1100px: eine Spalte, kompaktere Tabellen; unter 900px: Sidebar als Icon-Leiste (60px).
Tabellen mit vielen Spalten (`#itemsTable`, `#historyTable`, `#sourcesManageTable`, `#rulesTable`) haben eine Mindestbreite und scrollen innerhalb von `.table-wrap` horizontal.

Statusfarben in Tabellen: `.st-new|relevant|irrelevant|processing|waiting|filled|saved|skipped|error|too_old|duplicate|known`.

## Beispiele

```html
<button class="btn btn-primary"><svg class="icon"><use href="#i-play"/></svg>Automatik starten</button>
<button class="btn btn-outline btn-destructive btn-sm">Stopp</button>

<span class="badge badge-cyber">Cyber</span> <span class="badge badge-wb">WB-KriMiSi</span>
<div class="chips"><span class="chip"><span>Ransomware</span></span><span class="chip chip-added"><span>Belgien</span></span></div>

<div class="field"><label class="label" for="x">Name</label><input id="x" class="input"><div class="hint">Hinweis</div></div>
<div class="switch-row"><div><div class="label">Tags per Modell</div><div class="hint">…</div></div><input type="checkbox" class="switch"></div>

<div class="status status-ok">Gespeichert.</div>
<div class="toast toast-success"><div class="toast-title">Gespeichert</div><div class="toast-desc">Weiter mit 2 von 3.</div></div>
```

Regeln: Farben nur über Tokens, keine Inline-Styles außer Breiten (`progress-bar`), keine Inline-Skripte/-Handler (CSP),
Icons als `<symbol>` im Sprite am Seitenanfang (`#i-play`, `#i-rss`, `#i-history`, `#i-book`, `#i-sliders`, `#i-plus`, `#i-search`,
`#i-stop`, `#i-scan`, `#i-check`, `#i-x`, `#i-skip`, `#i-external`, `#i-trash`, `#i-pencil`, `#i-download`, `#i-upload`, `#i-copy`,
`#i-sparkles`, `#i-info`, `#i-inbox`, `#i-eraser`, `#i-refresh`, `#i-text`, `#i-wand`, `#i-news`).
Test: `node tests/design.test.mjs` (IDs, Konsolenfehler, Überlauf, Screenshots je Ansicht in 1400×900 und 1000×800).
