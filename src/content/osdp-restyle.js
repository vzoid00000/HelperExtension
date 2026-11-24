// Aufgeräumte OSDP-Oberfläche – nur lokal im Browser des Nutzers, der Server bleibt unverändert.
//
// Was passiert (Einstellung „OSDP-Oberfläche aufräumen“, Standard an):
//   • News-Editor: Subtitle-Felder, Reiter „Summary“ und der Button „Summary“ werden ausgeblendet,
//     in den Metadaten bleiben nur Date, Author und Language Source (Place, Koordinaten,
//     Translation Service, Files sind weg).
//   • Metadata und Tags stehen untereinander auf einer Seite: Die rechte Reitergruppe behält ihre
//     Inhalte (preserveContent, gesetzt in der MAIN-Welt durch osdp-restyle-main.js), der Reiter
//     „Tags“ wird einmal aktiviert, danach zeigt CSS beide Reiterkörper dauerhaft an. Die Chips mit
//     den gewählten Tags wandern aus der Native-Karte zwischen Metadaten und Tag-Baum.
//   • CKEditor: Werkzeugleiste ausgeblendet; das Schema erlaubt nur Absätze mit reinem Text
//     (MAIN-Welt). Eingefügte Überschriften, Fett, Links, Bilder, Tabellen, Listen werden zu Text.
//   • Dunkles Design (Einstellung „Dunkles Design in OSDP als Standard“): beim Laden wird OSDPs
//     eigener Schalter (Mond-Symbol) einmal betätigt, darüber liegt ein ruhiges Farbschema.
//
// Die MAIN-Welt sieht die Flags als Attribute am <html>-Element (data-osdp-helper-restyle,
// data-osdp-helper-plain) und meldet gesetztes preserveContent als data-osdp-helper-preserved an
// der Reitergruppe. Der Filler (osdp-filler.js) funktioniert unverändert: ausgeblendete Reiter
// lassen sich weiterhin per click() wählen, die Formularfelder bleiben dieselben.

(() => {
  if (window.top !== window) return;
  const html = document.documentElement;
  if (html.hasAttribute('data-osdp-helper-restyle')) return;

  const STYLE_ID = 'osdp-helper-restyle-style';
  const ROOT = 'osdp-helper-restyle';
  const DARK = 'osdp-helper-dark';
  const ONEPAGE = 'osdp-helper-onepage';
  const HIDE = 'data-osdp-helper-hide';
  const state = { on: true, dark: true, darkClicked: false };

  const collapse = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const text = (el) => collapse(el ? el.textContent : '');

  // ------------------------------------------------------------------------------------ CSS ----
  const CSS = `
html.${ROOT} { --oh-bg: #09090b; --oh-surface: #111113; --oh-surface-2: #18181b; --oh-surface-3: #1f1f23; --oh-border: #27272a;
  --oh-border-strong: #3f3f46; --oh-text: #e4e4e7; --oh-text-strong: #fafafa; --oh-muted: #a1a1aa; --oh-dim: #71717a;
  --oh-accent: #3b82f6; --oh-accent-strong: #2563eb; --oh-font: Inter, "Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif; }

/* ---- Ausblenden und Layout (hell wie dunkel) ---- */
html.${ROOT} [${HIDE}] { display: none !important; }
html.${ROOT} app-editor form > div.tw-flex { display: flex !important; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 16px;
  position: sticky; top: 0; z-index: 20; }
html.${ROOT} app-editor form > div.tw-flex > button { width: auto !important; min-width: 108px; }
html.${ROOT} app-editor form > div.tw-grid { display: grid !important; grid-template-columns: minmax(0, 1fr) minmax(360px, 420px) !important;
  gap: 16px; align-items: start; padding: 0 16px 32px; }
html.${ROOT} app-editor form > div.tw-grid > div.tw-col-span-2 { grid-column: auto !important; min-width: 0; }
@media (max-width: 1100px) {
  html.${ROOT} app-editor form > div.tw-grid { grid-template-columns: minmax(0, 1fr) !important; }
}
html.${ROOT} app-editor .tw-min-h-\\[400px\\] { min-height: 0 !important; }
html.${ROOT} app-editor mat-card-content > div > p { margin: 10px 0 6px; font-size: 12px; font-weight: 600; letter-spacing: .04em;
  text-transform: uppercase; color: var(--oh-muted); }
html.${ROOT} app-editor .mat-mdc-form-field { width: 100%; }
html.${ROOT} app-editor .mat-mdc-tab-body-content > div > mat-card > mat-card { border: 0 !important; padding: 0 !important; background: transparent !important; box-shadow: none !important; }

/* Metadata + Tags auf einer Seite */
html.${ROOT} mat-tab-group.${ONEPAGE} > .mat-mdc-tab-header { display: none !important; }
html.${ROOT} mat-tab-group.${ONEPAGE} .mat-mdc-tab-body-wrapper { display: flex !important; flex-direction: column !important; gap: 12px;
  overflow: visible !important; height: auto !important; }
html.${ROOT} mat-tab-group.${ONEPAGE} mat-tab-body { position: relative !important; display: block !important; height: auto !important;
  overflow: visible !important; flex: none !important; visibility: visible !important; }
html.${ROOT} mat-tab-group.${ONEPAGE} .mat-mdc-tab-body-content { display: block !important; transform: none !important;
  visibility: visible !important; min-height: 0 !important; height: auto !important; overflow: visible !important; }
html.${ROOT} mat-tab-group.${ONEPAGE} .mat-mdc-tab-body-content::before, html.${ROOT} .osdp-helper-chips::before { display: block; margin: 0 0 8px 2px;
  font-size: 12px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--oh-muted); }
html.${ROOT} mat-tab-group.${ONEPAGE} mat-tab-body:nth-of-type(1) .mat-mdc-tab-body-content::before { content: 'Metadaten'; }
html.${ROOT} .osdp-helper-chips::before { content: 'Gewählte Tags'; }
html.${ROOT} .osdp-helper-chips { display: block; padding: 12px 14px 10px; border: 1px solid #d4d4d8; border-radius: 10px; background: #fff; }
html.${ROOT} body.dark-theme .osdp-helper-chips { border-color: var(--oh-border); background: var(--oh-surface); }
html.${ROOT} .osdp-helper-chips::before { margin: 0 0 10px; }
html.${ROOT} .osdp-helper-chips .mat-mdc-chip-set { padding: 0; }
html.${ROOT} mat-tab-group.${ONEPAGE} mat-tab-body:nth-of-type(1) .mat-mdc-tab-body-content::before { margin-left: 2px; }
html.${ROOT} mat-tab-group.${ONEPAGE} mat-tab-body:nth-of-type(1) mat-card.tw-p-4 { padding: 12px 14px 0 !important; }
html.${ROOT} mat-tab-group.${ONEPAGE} mat-tab-body:nth-of-type(2) mat-card { padding: 12px 10px 10px 6px; }
html.${ROOT} .osdp-helper-chips:not(.has-chips)::after { content: 'Noch keine Tags – unten suchen oder im Baum anhaken.'; display: block; font-size: 12.5px; color: var(--oh-dim); padding: 2px 2px 4px; }
html.${ROOT} mat-tab-group.${ONEPAGE} mat-tab-body:nth-of-type(2) .mat-mdc-tab-body-content::before { content: 'Tag-Baum'; }
html.${ROOT} mat-tab-group.${ONEPAGE} mat-tab-body:nth-of-type(2) mat-card > div > .mat-mdc-form-field.tw-p-4 { padding: 0 0 6px !important; }
html.${ROOT} mat-tab-group.${ONEPAGE} mat-tab-body:nth-of-type(2) .mat-mdc-form-field-subscript-wrapper { display: none; }
html.${ROOT} app-editor mat-chip-listbox .mdc-evolution-chip-set__chips { gap: 6px; }

/* CKEditor als reines Textfeld */
html.${ROOT} app-editor .ck.ck-editor__top { display: none !important; }
html.${ROOT} app-editor .ck.ck-editor__main > .ck-editor__editable { min-height: 480px; border-radius: 8px !important; padding: 14px 16px !important;
  font-size: 15px; line-height: 1.65; font-family: var(--oh-font); }
html.${ROOT} app-editor .ck.ck-editor__editable.ck-focused { box-shadow: none !important; outline: 0 !important; }

/* Tag-Baum: kompakt, Farbe als schmaler Balken statt Vollfläche */
html.${ROOT} app-editor tag-tree .mat-tree { background: transparent !important; }
html.${ROOT} app-editor tag-tree .mat-tree .mat-tree-node { background-color: transparent !important; min-height: 30px !important; border-radius: 6px;
  padding-right: 6px; }
html.${ROOT} app-editor tag-tree .mat-tree .mat-tree-node[data-osdp-helper-color] { box-shadow: inset 3px 0 0 var(--tag-color); }
html.${ROOT} app-editor tag-tree .mat-tree .mat-tree-node .checklist-leaf-node { margin-left: 1.4em; }
html.${ROOT} app-editor tag-tree .mat-tree .mat-tree-node .mat-mdc-checkbox .mdc-form-field, html.${ROOT} app-editor tag-tree .mat-tree .mat-tree-node .mdc-label { font-size: 13.5px; letter-spacing: 0; }
html.${ROOT} app-editor tag-tree .mat-tree .mat-tree-node .mat-mdc-icon-button { --mdc-icon-button-state-layer-size: 32px; width: 32px; height: 32px; padding: 4px; }

/* Chips: dezente Fläche in der Tag-Farbe */
html.${ROOT} app-editor .mat-mdc-chip.selected-tag-chip { border-radius: 999px !important; height: 26px !important;
  background: color-mix(in srgb, var(--tag-color, #94a3b8) 28%, #ffffff) !important; border: 1px solid color-mix(in srgb, var(--tag-color, #94a3b8) 70%, transparent); }
html.${ROOT} app-editor .mat-mdc-chip.selected-tag-chip .mdc-evolution-chip__text-label { font-size: 12.5px; font-weight: 500; letter-spacing: 0; }

/* ---- Dunkles Design ---- */
/* Bis OSDPs Schalter betätigt ist: kein weißes Aufblitzen (Klasse fällt danach weg, Hell bleibt dann wählbar) */
html.${ROOT}.${DARK}.osdp-helper-dark-pending { background: var(--oh-bg); }
html.${ROOT}.${DARK}.osdp-helper-dark-pending body:not(.dark-theme) { background: var(--oh-bg) !important; color: var(--oh-text); }
html.${ROOT} body.dark-theme { background: var(--oh-bg) !important; color: var(--oh-text) !important; font-family: var(--oh-font) !important; font-weight: 400 !important;
  --mdc-outlined-text-field-outline-color: var(--oh-border); --mdc-outlined-text-field-hover-outline-color: var(--oh-border-strong);
  --mdc-outlined-text-field-focus-outline-color: var(--oh-accent); --mdc-outlined-text-field-label-text-color: var(--oh-muted);
  --mdc-outlined-text-field-hover-label-text-color: var(--oh-text); --mdc-outlined-text-field-focus-label-text-color: var(--oh-accent);
  --mdc-outlined-text-field-input-text-color: var(--oh-text-strong); --mdc-outlined-text-field-caret-color: var(--oh-accent);
  --mdc-outlined-text-field-disabled-outline-color: var(--oh-border); --mdc-outlined-text-field-error-outline-color: #f87171;
  --mat-select-enabled-trigger-text-color: var(--oh-text-strong); --mat-select-enabled-arrow-color: var(--oh-muted); --mat-select-placeholder-text-color: var(--oh-muted);
  --mat-select-panel-background-color: var(--oh-surface-2); --mat-option-label-text-color: var(--oh-text);
  --mdc-outlined-card-container-color: var(--oh-surface); --mdc-outlined-card-outline-color: var(--oh-border); --mdc-elevated-card-container-color: var(--oh-surface);
  --mat-tab-header-active-label-text-color: var(--oh-text-strong); --mat-tab-header-inactive-label-text-color: var(--oh-muted);
  --mat-tab-header-active-focus-label-text-color: var(--oh-text-strong); --mat-tab-header-active-hover-label-text-color: var(--oh-text-strong);
  --mat-tab-header-active-ripple-color: transparent; --mat-tab-header-inactive-ripple-color: transparent;
  --mdc-tab-indicator-active-indicator-color: var(--oh-accent); --mat-tab-header-active-focus-indicator-color: var(--oh-accent); --mat-tab-header-active-hover-indicator-color: var(--oh-accent);
  --mdc-checkbox-unselected-icon-color: var(--oh-border-strong); --mdc-checkbox-unselected-hover-icon-color: var(--oh-muted);
  --mdc-checkbox-selected-icon-color: var(--oh-accent); --mdc-checkbox-selected-hover-icon-color: var(--oh-accent-strong); --mdc-checkbox-selected-focus-icon-color: var(--oh-accent);
  --mdc-checkbox-selected-checkmark-color: #fff; --mdc-form-field-label-text-color: var(--oh-text);
  --mat-menu-container-color: var(--oh-surface-2); --mat-menu-item-label-text-color: var(--oh-text); --mat-menu-item-icon-color: var(--oh-muted);
  --mat-autocomplete-background-color: var(--oh-surface-2); --mat-optgroup-label-text-color: var(--oh-muted);
  --mat-datepicker-calendar-container-background-color: var(--oh-surface-2); --mat-datepicker-calendar-date-text-color: var(--oh-text);
  --mat-datepicker-calendar-date-selected-state-background-color: var(--oh-accent); --mat-datepicker-calendar-header-text-color: var(--oh-muted);
  --mat-datepicker-calendar-body-label-text-color: var(--oh-muted); --mat-datepicker-calendar-period-button-text-color: var(--oh-text);
  --mat-datepicker-calendar-navigation-button-icon-color: var(--oh-muted); --mat-datepicker-calendar-date-today-outline-color: var(--oh-border-strong);
  --mat-datepicker-calendar-date-hover-state-background-color: var(--oh-surface-3); --mdc-icon-button-icon-color: var(--oh-muted);
  --mat-icon-color: var(--oh-muted); --mat-dialog-container-color: var(--oh-surface); --mat-table-background-color: var(--oh-surface);
  --mat-paginator-container-background-color: var(--oh-surface); --mat-paginator-container-text-color: var(--oh-muted);
  --mat-tree-node-text-color: var(--oh-text); --mat-tree-container-background-color: transparent; }
html.${ROOT} body.dark-theme app-nav mat-toolbar, html.${ROOT} body.dark-theme .mat-toolbar { background: #0f0f11 !important; color: var(--oh-text) !important;
  border-bottom: 1px solid var(--oh-border); min-height: 54px; }
html.${ROOT} body.dark-theme app-nav .mat-mdc-button:not(:disabled) { color: var(--oh-text) !important; }
html.${ROOT} body.dark-theme app-nav .active-link .mat-mdc-button { background: var(--oh-surface-2); border-radius: 8px; }
html.${ROOT} body.dark-theme .mat-mdc-card { background: var(--oh-surface) !important; color: var(--oh-text) !important; border: 1px solid var(--oh-border) !important;
  border-radius: 10px !important; box-shadow: none !important; }
html.${ROOT} body.dark-theme .mat-mdc-tab-header { border-bottom: 1px solid var(--oh-border); }
html.${ROOT} body.dark-theme .mat-mdc-tab .mdc-tab__text-label { letter-spacing: 0 !important; font-weight: 500; }
html.${ROOT} body.dark-theme .mat-mdc-tab.mdc-tab--active { background: transparent !important; }
html.${ROOT} body.dark-theme .mat-mdc-tab .mdc-tab__ripple::before, html.${ROOT} body.dark-theme .mat-mdc-tab .mat-mdc-tab-ripple { display: none !important; }
html.${ROOT} body.dark-theme .mat-mdc-tab .mdc-tab-indicator__content--underline { border-color: var(--oh-accent) !important; border-top-width: 2px !important; }
html.${ROOT} body.dark-theme .mat-mdc-tab-header-pagination-chevron { border-color: var(--oh-muted); }
html.${ROOT} body.dark-theme .mdc-text-field--outlined .mdc-notched-outline__leading, html.${ROOT} body.dark-theme .mdc-text-field--outlined .mdc-notched-outline__notch,
html.${ROOT} body.dark-theme .mdc-text-field--outlined .mdc-notched-outline__trailing { border-width: 1px !important; }
html.${ROOT} body.dark-theme .mat-mdc-form-field .mat-mdc-form-field-icon-suffix .mat-icon, html.${ROOT} body.dark-theme .mat-mdc-form-field [matsuffix] .mat-icon { color: var(--oh-muted); }
html.${ROOT} body.dark-theme .mat-mdc-form-field-error { color: #f87171; }
html.${ROOT} body.dark-theme .mat-mdc-raised-button, html.${ROOT} body.dark-theme .mat-mdc-unelevated-button { box-shadow: none !important; border-radius: 8px !important;
  letter-spacing: 0 !important; font-weight: 500 !important; --mdc-protected-button-container-elevation: 0; --mdc-protected-button-hover-container-elevation: 0; --mdc-protected-button-focus-container-elevation: 0; }
html.${ROOT} body.dark-theme .mat-mdc-raised-button:not(:disabled) { background: var(--oh-surface-2) !important; color: var(--oh-text-strong) !important; border: 1px solid var(--oh-border); }
html.${ROOT} body.dark-theme .mat-mdc-raised-button:not(:disabled):hover { background: var(--oh-surface-3) !important; }
html.${ROOT} body.dark-theme .mat-mdc-raised-button.mat-accent:not(:disabled) { background: var(--oh-accent-strong) !important; border-color: var(--oh-accent-strong); color: #fff !important; }
html.${ROOT} body.dark-theme .mat-mdc-raised-button.mat-accent:not(:disabled):hover { background: #1d4ed8 !important; }
html.${ROOT} body.dark-theme .mat-mdc-raised-button.mat-warn:not(:disabled) { background: #7f1d1d !important; border-color: #991b1b; color: #fecaca !important; }
html.${ROOT} body.dark-theme .mat-mdc-raised-button:disabled { background: #121214 !important; color: #52525b !important; border: 1px solid var(--oh-border); }
html.${ROOT} body.dark-theme .mat-mdc-button:not(:disabled), html.${ROOT} body.dark-theme .mat-mdc-icon-button:not(:disabled) { color: var(--oh-text); }
html.${ROOT} body.dark-theme app-editor form > div.tw-flex { background: var(--oh-bg); border-bottom: 1px solid var(--oh-border); }
html.${ROOT} body.dark-theme app-editor .ck.ck-editor__main > .ck-editor__editable { background: #0d0d0f !important; color: var(--oh-text) !important; border: 1px solid var(--oh-border) !important; }
html.${ROOT} body.dark-theme app-editor .ck.ck-editor__editable.ck-focused { border-color: var(--oh-accent) !important; }
html.${ROOT} body.dark-theme app-editor .ck.ck-editor__editable .ck-placeholder::before { color: var(--oh-dim); }
html.${ROOT} body.dark-theme app-editor tag-tree .mat-tree { background: transparent !important; }
html.${ROOT} body.dark-theme app-editor tag-tree .mat-tree .mat-tree-node { color: var(--oh-text) !important; }
html.${ROOT} body.dark-theme app-editor tag-tree .mat-tree .mat-tree-node:hover { background-color: var(--oh-surface-2) !important; }
html.${ROOT} body.dark-theme app-editor tag-tree .mat-tree .mat-tree-node h5, html.${ROOT} body.dark-theme app-editor tag-tree .mat-tree .mat-tree-node span,
html.${ROOT} body.dark-theme app-editor tag-tree .mat-tree .mat-tree-node p, html.${ROOT} body.dark-theme app-editor tag-tree .mat-tree .mat-tree-node label,
html.${ROOT} body.dark-theme app-editor tag-tree .mat-tree .mat-tree-node .mat-mdc-checkbox, html.${ROOT} body.dark-theme app-editor tag-tree .mat-tree .mat-tree-node .mat-mdc-checkbox .mdc-form-field,
html.${ROOT} body.dark-theme app-editor tag-tree .mat-tree .mat-tree-node .mat-mdc-checkbox .mdc-form-field .mdc-label { color: var(--oh-text) !important; }
html.${ROOT} body.dark-theme app-editor tag-tree .mat-tree .mat-tree-node .mat-icon { color: var(--oh-muted); }
html.${ROOT} body.dark-theme app-editor .mat-mdc-chip.selected-tag-chip { background: color-mix(in srgb, var(--tag-color, #52525b) 22%, var(--oh-surface-2)) !important;
  border-color: color-mix(in srgb, var(--tag-color, #52525b) 55%, transparent); }
html.${ROOT} body.dark-theme app-editor .mat-mdc-chip.selected-tag-chip .mdc-evolution-chip__text-label { color: var(--oh-text-strong) !important; }
html.${ROOT} body.dark-theme app-editor .mat-mdc-chip.selected-tag-chip .mat-icon { color: var(--oh-muted) !important; }
html.${ROOT} body.dark-theme .mat-mdc-select-panel, html.${ROOT} body.dark-theme .mat-mdc-autocomplete-panel, html.${ROOT} body.dark-theme .mat-mdc-menu-panel,
html.${ROOT} body.dark-theme .mat-datepicker-content { background: var(--oh-surface-2) !important; color: var(--oh-text) !important; border: 1px solid var(--oh-border); border-radius: 8px !important; box-shadow: 0 12px 32px rgba(0,0,0,.5) !important; }
html.${ROOT} body.dark-theme .mat-mdc-option, html.${ROOT} body.dark-theme .mat-mdc-option .mdc-list-item__primary-text { color: var(--oh-text) !important; }
html.${ROOT} body.dark-theme .mat-mdc-option div[style*="color: black"] { color: var(--oh-text) !important; }
html.${ROOT} body.dark-theme .mat-mdc-option:hover:not(.mdc-list-item--disabled), html.${ROOT} body.dark-theme .mat-mdc-option.mat-mdc-option-active { background: var(--oh-surface-3) !important; }
html.${ROOT} body.dark-theme .mat-mdc-tooltip .mdc-tooltip__surface { background: var(--oh-surface-3); color: var(--oh-text); border: 1px solid var(--oh-border-strong); }
html.${ROOT} body.dark-theme h1, html.${ROOT} body.dark-theme h2, html.${ROOT} body.dark-theme h3, html.${ROOT} body.dark-theme h4 { color: var(--oh-text-strong); }
html.${ROOT} body.dark-theme ::-webkit-scrollbar { width: 10px; height: 10px; }
html.${ROOT} body.dark-theme ::-webkit-scrollbar-track { background: transparent; }
html.${ROOT} body.dark-theme ::-webkit-scrollbar-thumb { background: var(--oh-border-strong); border-radius: 5px; border: 2px solid var(--oh-bg); }
html.${ROOT} body.dark-theme ::-webkit-scrollbar-thumb:hover { background: #52525b; }
`;

  function ensureStyle() {
    let st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = STYLE_ID;
      (document.head || html).append(st);
    }
    if (st.textContent !== CSS) st.textContent = CSS;
    return st;
  }

  function applyState() {
    ensureStyle();
    html.classList.toggle(ROOT, state.on);
    html.classList.toggle(DARK, state.on && state.dark);
    html.classList.toggle('osdp-helper-dark-pending', state.on && state.dark && !state.darkClicked);
    html.setAttribute('data-osdp-helper-restyle', state.on ? '1' : '0');
    html.setAttribute('data-osdp-helper-plain', state.on ? '1' : '0');
    if (state.on) scheduleScan();
  }

  // --------------------------------------------------------------------------- Einstellungen ----
  function readSettings(settings) {
    const s = settings || {};
    state.on = s.osdpRestyle !== false;
    state.dark = s.osdpRestyleDark !== false;
  }

  try {
    chrome.storage.local.get('settings').then((stored) => {
      readSettings(stored?.settings);
      applyState();
    }).catch(() => applyState());
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      readSettings(changes.settings.newValue);
      applyState();
    });
  } catch {
    applyState();
  }

  // ------------------------------------------------------------------------------- Dunkel ----
  /** OSDPs eigenen Schalter einmal pro Seitenaufruf betätigen (wird nicht gespeichert, daher jedes Mal). */
  function ensureDark() {
    if (!state.dark || state.darkClicked || !document.body) return;
    const done = () => {
      state.darkClicked = true;
      html.classList.remove('osdp-helper-dark-pending');
    };
    if (document.body.classList.contains('dark-theme')) {
      done();
      return;
    }
    const icon = [...document.querySelectorAll('mat-toolbar button mat-icon, app-nav button mat-icon')].find((i) => text(i) === 'dark_mode');
    const btn = icon?.closest('button');
    if (!btn) return;
    done();
    btn.click();
  }

  // ------------------------------------------------------------------------------- Editor ----
  const groupTabs = (g) => [...g.querySelectorAll('.mat-mdc-tab')].filter((t) => t.closest('mat-tab-group') === g);
  const groupBodies = (g) => [...g.querySelectorAll('mat-tab-body')].filter((b) => b.closest('mat-tab-group') === g);
  const hide = (el) => el && !el.hasAttribute(HIDE) && el.setAttribute(HIDE, '1');

  function hideClutter(editor) {
    for (const b of editor.querySelectorAll('form > div.tw-flex > button')) if (/^summary$/i.test(text(b))) hide(b);
    for (const f of editor.querySelectorAll('[formcontrolname^="article_subtitle"]')) {
      const field = f.closest('mat-form-field');
      const wrap = field?.parentElement;
      hide(wrap && wrap.localName === 'div' && wrap.children.length === 1 ? wrap : field);
    }
    for (const f of editor.querySelectorAll('[formcontrolname="article_place"], [formcontrolname="lat"], [formcontrolname="lon"], [formcontrolname="translation_service"]')) {
      hide(f.closest('mat-form-field'));
    }
    for (const el of editor.querySelectorAll('file-upload')) hide(el);
    for (const g of editor.querySelectorAll('mat-tab-group')) {
      const tabs = groupTabs(g);
      if (!tabs.length) continue;
      const labels = tabs.map(text);
      if (labels.some((l) => /^native$/i.test(l))) {
        g.setAttribute('data-osdp-helper-group', 'content');
        const idx = labels.findIndex((l) => /^summary$/i.test(l));
        if (idx >= 0) {
          hide(tabs[idx]);
          hide(groupBodies(g)[idx]);
        }
      } else if (labels.some((l) => /^metadata$/i.test(l)) && !g.hasAttribute('data-osdp-helper-group')) {
        g.setAttribute('data-osdp-helper-group', 'meta');
      }
    }
  }

  /** Metadata + Tags untereinander: nach preserveContent (MAIN-Welt) den Reiter „Tags“ einmal aktivieren, dann beide zeigen. */
  function onePage(editor) {
    const g = editor.querySelector('mat-tab-group[data-osdp-helper-group="meta"]');
    if (!g || g.getAttribute('data-osdp-helper-preserved') !== '1') return;
    const tabs = groupTabs(g);
    const tagsTab = tabs.find((t) => /^tags$/i.test(text(t)));
    if (!tagsTab) return; // z. B. geprüfter Artikel ohne Tags-Reiter
    const bodies = groupBodies(g);
    const metaBody = bodies[0];
    const tagsBody = bodies[tabs.indexOf(tagsTab)];
    if (!metaBody || !tagsBody) return;
    const metaReady = !!metaBody.querySelector('input, mat-select');
    const tagsReady = !!tagsBody.querySelector('tag-tree, mat-form-field');
    if (!tagsReady) {
      const active = tagsTab.classList.contains('mdc-tab--active') || tagsTab.getAttribute('aria-selected') === 'true';
      if (!active && !g.hasAttribute('data-osdp-helper-tags-clicked')) {
        g.setAttribute('data-osdp-helper-tags-clicked', '1');
        tagsTab.click();
      }
      return;
    }
    if (metaReady && !g.classList.contains(ONEPAGE)) g.classList.add(ONEPAGE);
    moveChips(editor, g, tagsBody);
  }

  /** Chip-Liste der gewählten Tags aus der Native-Karte zwischen Metadaten und Tag-Baum setzen. */
  function moveChips(editor, g, tagsBody) {
    const wrapper = tagsBody.parentElement;
    if (!wrapper || !wrapper.classList.contains('mat-mdc-tab-body-wrapper')) return;
    let box = wrapper.querySelector(':scope > .osdp-helper-chips');
    if (!box) {
      box = document.createElement('div');
      box.className = 'osdp-helper-chips';
      wrapper.insertBefore(box, tagsBody);
    }
    if (!box.querySelector('mat-chip-listbox')) {
      const content = editor.querySelector('mat-tab-group[data-osdp-helper-group="content"]');
      const native = content ? groupBodies(content)[0] : null;
      const listbox = native?.querySelector('mat-chip-listbox.selected-tags-container');
      if (listbox) box.append(listbox);
    }
    box.classList.toggle('has-chips', !!box.querySelector('mat-chip-option, mat-chip'));
  }

  /** Inline-Farben (Chips, Baumknoten) als --tag-color bereitstellen; Weiß zählt nicht. */
  function colorize(editor) {
    const nodes = editor.querySelectorAll('mat-chip-option.selected-tag-chip, tag-tree mat-tree-node');
    for (const el of nodes) {
      const c = el.style.backgroundColor;
      const plain = !c || /^(#fff(fff)?|white|rgb\(255,\s*255,\s*255\)|transparent)$/i.test(c.trim());
      if (plain) {
        if (el.hasAttribute('data-osdp-helper-color')) {
          el.removeAttribute('data-osdp-helper-color');
          el.style.removeProperty('--tag-color');
        }
        continue;
      }
      if (el.style.getPropertyValue('--tag-color') !== c) el.style.setProperty('--tag-color', c);
      if (!el.hasAttribute('data-osdp-helper-color')) el.setAttribute('data-osdp-helper-color', '1');
    }
  }

  function scan() {
    if (!state.on) return;
    ensureDark();
    const editor = document.querySelector('app-editor');
    if (!editor) return;
    hideClutter(editor);
    onePage(editor);
    colorize(editor);
  }

  let timer = 0;
  function scheduleScan() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      try {
        scan();
      } catch (e) {
        console.warn('OSDP News Helper: Aufräumen fehlgeschlagen', e);
      }
    }, 120);
  }

  const observer = new MutationObserver(() => {
    if (state.on) scheduleScan();
  });
  observer.observe(html, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-osdp-helper-preserved', 'style', 'aria-selected'] });
})();
