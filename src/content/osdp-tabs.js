// Der Helper als Reiter im OSDP-News-Editor: Neben „Native | English Translated | German Translated“
// stehen „Lauf | Quellen | Verlauf | Regeln | Einstellungen“. Ein Klick darauf zeigt die jeweilige
// Ansicht der Extension-App (src/app/app.html als iframe) an der Stelle der Reiterkörper; ein Klick
// auf einen OSDP-Reiter bringt das Formular zurück. Kein eigener Tab, kein Panel, kein Dock.
//
// Technik: Die Reiter sind eigene Elemente mit den Material-Klassen in OSDPs Reiterleiste (gleiche
// Optik, OSDP weiß nichts davon). Das iframe hängt dauerhaft am <body> (überlebt die Navigation
// innerhalb von OSDP, ein Durchlauf läuft weiter) und wird absolut über den Reiterkörper-Bereich
// gelegt, der dabei nur unsichtbar geschaltet wird (Platz bleibt, Formularzustand bleibt). Beim
// Verlassen des Editors ist das iframe ausgeblendet, läuft aber weiter.
//
// Nachrichten vom Service Worker: { type: 'osdp-helper-panel', action: 'toggle'|'open'|'close'|'autorun'|'status' }.
// Die App meldet Status per postMessage ({ type: 'osdp-helper-status', text, kind }); die erste Meldung
// gilt als „bereit“ (ein vorher eingetroffener Zeitplan-Start wartet bis dahin). Alt+H wechselt
// zwischen „Lauf“ und dem Formular.

(() => {
  if (window.top !== window) return;
  const HOST_ID = 'osdp-helper-tabs';
  if (document.getElementById(HOST_ID)) return;

  const VIEWS = [
    ['run', 'Lauf'],
    ['sources', 'Quellen'],
    ['history', 'Verlauf'],
    ['rules', 'Regeln'],
    ['settings', 'Einstellungen']
  ];
  const MIN_H = 360;
  const MAX_H = 2400;
  const DEFAULT_H = 760;
  // height folgt der Inhaltshöhe der App (osdp-helper-size), bis der Nutzer selbst zieht (manualHeight)
  const state = { view: null, height: DEFAULT_H, manualHeight: false, appReady: false, pendingAutorun: false, status: { text: '', kind: '' } };
  let host = null;
  let frame = null;
  let handle = null;
  let group = null; // aktuelle Reitergruppe des Route-Editors
  let pageStyle = null;

  const text = (el) => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();

  // ---------------------------------------------------------------- iframe-Host (dauerhaft) ----
  const HOST_CSS = `
    :host { all: initial; position: absolute; z-index: 6; display: none; }
    :host([data-active]) { display: block; }
    * { box-sizing: border-box; }
    iframe { display: block; width: 100%; height: 100%; border: 0; background: transparent; }
    .handle { position: absolute; left: 0; right: 0; bottom: -4px; height: 8px; cursor: row-resize; }
    .handle:hover, .handle.active { background: rgba(59,130,246,.35); }
  `;

  function ensureHost() {
    if (host && host.isConnected) return host;
    if (!document.body) return null;
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      const root = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = HOST_CSS;
      frame = document.createElement('iframe');
      frame.src = chrome.runtime.getURL('src/app/app.html?embedded=1');
      frame.title = 'OSDP News Helper';
      frame.allow = 'clipboard-write';
      handle = document.createElement('div');
      handle.className = 'handle';
      handle.title = 'Höhe ändern';
      root.append(style, frame, handle);

      let dragging = false;
      let startY = 0;
      let startH = 0;
      handle.addEventListener('pointerdown', (e) => {
        dragging = true;
        startY = e.clientY;
        startH = state.height;
        handle.classList.add('active');
        handle.setPointerCapture(e.pointerId);
        frame.style.pointerEvents = 'none';
        e.preventDefault();
      });
      handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        state.height = Math.max(MIN_H, Math.min(MAX_H, Math.round(startH + (e.clientY - startY))));
        place();
      });
      const stop = () => {
        if (!dragging) return;
        dragging = false;
        state.manualHeight = true;
        handle.classList.remove('active');
        frame.style.pointerEvents = '';
        persist();
      };
      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);
    }
    document.body.append(host);
    return host;
  }

  function ensurePageStyle() {
    if (pageStyle && pageStyle.isConnected) return;
    pageStyle = document.createElement('style');
    pageStyle.id = 'osdp-helper-tabs-style';
    pageStyle.textContent = `
      .osdp-helper-tab .mdc-tab__text-label { display: inline-flex; align-items: center; gap: 7px; }
      .osdp-helper-tab .osdp-helper-dot { width: 7px; height: 7px; border-radius: 50%; background: transparent; }
      .osdp-helper-tab .osdp-helper-dot[data-kind="busy"] { background: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.25); }
      .osdp-helper-tab .osdp-helper-dot[data-kind="warn"] { background: #f59e0b; }
      .osdp-helper-tab .osdp-helper-dot[data-kind="ok"] { background: #22c55e; }
      .osdp-helper-sep { align-self: center; width: 1px; height: 22px; margin: 0 6px; background: currentColor; opacity: .18; }
      .mat-mdc-tab-body-wrapper[data-osdp-helper-covered] > mat-tab-body { visibility: hidden !important; }
    `;
    (document.head || document.documentElement).append(pageStyle);
  }

  // ---------------------------------------------------------------- Reiter in OSDPs Leiste ----
  function findGroup() {
    for (const g of document.querySelectorAll('app-news-editor app-editor mat-tab-group')) {
      const tabs = [...g.querySelectorAll('.mat-mdc-tab')].filter((t) => t.closest('mat-tab-group') === g);
      if (tabs.some((t) => /^native$/i.test(text(t)))) return g;
    }
    return null;
  }

  function makeTab(view, label) {
    const tab = document.createElement('div');
    tab.className = 'mdc-tab mat-mdc-tab mat-mdc-focus-indicator osdp-helper-tab';
    tab.setAttribute('role', 'tab');
    tab.tabIndex = 0;
    tab.dataset.view = view;
    const ripple = document.createElement('span');
    ripple.className = 'mdc-tab__ripple';
    const content = document.createElement('span');
    content.className = 'mdc-tab__content';
    const textLabel = document.createElement('span');
    textLabel.className = 'mdc-tab__text-label';
    textLabel.append(document.createTextNode(label));
    if (view === 'run') {
      const dot = document.createElement('span');
      dot.className = 'osdp-helper-dot';
      textLabel.append(dot);
    }
    content.append(textLabel);
    const indicator = document.createElement('span');
    indicator.className = 'mdc-tab-indicator';
    const line = document.createElement('span');
    line.className = 'mdc-tab-indicator__content mdc-tab-indicator__content--underline';
    indicator.append(line);
    tab.append(ripple, content, indicator);
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      activate(view);
    });
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate(view);
      }
    });
    return tab;
  }

  const ownTabs = () => (group ? [...group.querySelectorAll('.osdp-helper-tab')] : []);
  const osdpTabs = () => (group ? [...group.querySelectorAll('.mat-mdc-tab:not(.osdp-helper-tab)')].filter((t) => t.closest('mat-tab-group') === group) : []);
  const wrapper = () => group?.querySelector(':scope > .mat-mdc-tab-body-wrapper') || null;

  function ensureTabs() {
    const g = findGroup();
    if (g !== group) {
      group = g;
      if (!group) {
        state.view = null;
        updateHostVisibility();
        return;
      }
    }
    if (!group) return;
    const labels = group.querySelector('.mat-mdc-tab-labels');
    if (!labels || labels.querySelector('.osdp-helper-tab')) {
      applyStatusDot();
      return;
    }
    const sep = document.createElement('span');
    sep.className = 'osdp-helper-sep';
    labels.append(sep);
    for (const [view, label] of VIEWS) labels.append(makeTab(view, label));
    // Klick auf einen OSDP-Reiter: zurück zum Formular (vor Angulars Handler, damit die Klassen stimmen)
    labels.addEventListener('click', (e) => {
      const t = e.target.closest('.mat-mdc-tab');
      if (!t || t.classList.contains('osdp-helper-tab')) return;
      showForm(t);
    }, true);
    applyStatusDot();
    if (state.view) activate(state.view, { silent: true });
  }

  function setActiveClasses(tab, active) {
    tab.classList.toggle('mdc-tab--active', active);
    tab.classList.toggle('mdc-tab-indicator--active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  }

  /** Eigene Ansicht zeigen: OSDP-Reiter optisch abwählen, Reiterkörper verdecken, iframe darüber. */
  function activate(view, { silent = false } = {}) {
    if (!group || !ensureHost()) return;
    state.view = view;
    for (const t of ownTabs()) setActiveClasses(t, t.dataset.view === view);
    for (const t of osdpTabs()) setActiveClasses(t, false);
    const w = wrapper();
    if (w) w.setAttribute('data-osdp-helper-covered', '1');
    toApp({ type: 'osdp-helper-show', view });
    updateHostVisibility();
    place();
    if (!silent) persist();
  }

  /** Zurück zum OSDP-Formular; `clicked` ist der angeklickte OSDP-Reiter (Angular setzt die Klassen nur bei Indexwechsel). */
  function showForm(clicked) {
    state.view = null;
    for (const t of ownTabs()) setActiveClasses(t, false);
    const w = wrapper();
    if (w) {
      w.removeAttribute('data-osdp-helper-covered');
      w.style.minHeight = '';
    }
    if (clicked) {
      for (const t of osdpTabs()) setActiveClasses(t, t === clicked);
    }
    updateHostVisibility();
    persist();
  }

  function updateHostVisibility() {
    if (!host) return;
    const show = !!(group && group.isConnected && state.view);
    if (show) host.setAttribute('data-active', '1');
    else host.removeAttribute('data-active');
  }

  /** iframe über den Reiterkörper-Bereich legen (Dokumentkoordinaten), Platz im Fluss reservieren. */
  function place() {
    if (!host || !host.hasAttribute('data-active')) return;
    const w = wrapper();
    if (!w) return;
    w.style.minHeight = `${state.height}px`;
    const r = w.getBoundingClientRect();
    host.style.left = `${Math.round(r.left + window.scrollX)}px`;
    host.style.top = `${Math.round(r.top + window.scrollY)}px`;
    host.style.width = `${Math.round(r.width)}px`;
    host.style.height = `${state.height}px`;
  }

  function applyStatusDot() {
    const dot = group?.querySelector('.osdp-helper-tab[data-view="run"] .osdp-helper-dot');
    if (!dot) return;
    dot.dataset.kind = state.status.kind || '';
    dot.title = state.status.text || '';
    const tab = dot.closest('.osdp-helper-tab');
    if (tab) tab.title = state.status.text ? `Lauf – ${state.status.text}` : 'Lauf';
  }

  function persist() {
    try {
      chrome.storage.local.set({ tabs: { view: state.view, height: state.manualHeight ? state.height : null } });
    } catch {
      /* Extension neu geladen */
    }
  }

  function toApp(msg) {
    try {
      frame?.contentWindow?.postMessage(msg, '*');
    } catch {
      /* iframe noch nicht da */
    }
  }

  function syncTheme() {
    toApp({ type: 'osdp-helper-theme', dark: !!document.body?.classList.contains('dark-theme') });
  }

  // ---------------------------------------------------------------- Nachrichten ----
  window.addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'osdp-helper-status') {
      state.status = { text: String(d.text || ''), kind: ['busy', 'warn', 'ok'].includes(d.kind) ? d.kind : '' };
      applyStatusDot();
      if (!state.appReady) {
        state.appReady = true;
        syncTheme();
        if (state.view) toApp({ type: 'osdp-helper-show', view: state.view });
        if (state.pendingAutorun) {
          state.pendingAutorun = false;
          toApp({ type: 'osdp-helper-autorun' });
        }
      }
    } else if (d.type === 'osdp-helper-size' && Number.isFinite(d.height)) {
      // Inhaltshöhe der App: Bereich mitwachsen lassen (kein innerer Scrollbalken), solange nicht von Hand gezogen
      if (!state.manualHeight) {
        const h = Math.max(MIN_H, Math.min(MAX_H, Math.ceil(d.height) + 4));
        if (h !== state.height) {
          state.height = h;
          place();
        }
      }
    } else if (d.type === 'osdp-helper-navigate' && typeof d.view === 'string') {
      // Die App hat selbst die Ansicht gewechselt (z. B. „Korrektur melden“ → Regeln): Reiter nachziehen
      if (group && state.view && state.view !== d.view && VIEWS.some(([v]) => v === d.view)) activate(d.view);
    }
  });

  function autorun() {
    if (group) activate('run');
    if (state.appReady) toApp({ type: 'osdp-helper-autorun' });
    else state.pendingAutorun = true;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'osdp-helper-panel') return;
    if (msg.action === 'toggle') (state.view ? showForm(osdpTabs()[0]) : group && activate('run'));
    else if (msg.action === 'open') group && activate('run');
    else if (msg.action === 'close') showForm(osdpTabs()[0]);
    else if (msg.action === 'autorun') autorun();
    else if (msg.action === 'status') {
      state.status = { text: msg.text || '', kind: msg.kind || '' };
      applyStatusDot();
    }
    sendResponse({ ok: true, view: state.view, inEditor: !!group, appReady: state.appReady, height: state.height });
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      if (state.view) showForm(osdpTabs()[0]);
      else if (group) activate('run');
    }
  });

  // ---------------------------------------------------------------- Beobachten ----
  let timer = 0;
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      ensureHost();
      ensurePageStyle();
      ensureTabs();
      updateHostVisibility();
      place();
    }, 120);
  };
  const observer = new MutationObserver(schedule);
  let lastDark = null;
  const themeObserver = new MutationObserver(() => {
    const dark = !!document.body?.classList.contains('dark-theme');
    if (dark !== lastDark) {
      lastDark = dark;
      syncTheme();
    }
  });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => place()) : null;

  function start() {
    ensureHost();
    ensurePageStyle();
    ensureTabs();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    if (ro) ro.observe(document.documentElement);
    window.addEventListener('resize', place);
    // Reiterkörper-Bereich beobachten (ändert sich beim Wechsel Native → German, Größe der Karten)
    setInterval(() => {
      if (host?.hasAttribute('data-active')) place();
    }, 1000);
  }

  chrome.storage.local.get('tabs').then((stored) => {
    const t = stored?.tabs || {};
    if (Number.isFinite(t.height)) {
      state.height = Math.max(MIN_H, Math.min(MAX_H, t.height));
      state.manualHeight = true;
    }
    if (typeof t.view === 'string' && VIEWS.some(([v]) => v === t.view)) state.view = t.view;
    start();
  }).catch(start);
})();
