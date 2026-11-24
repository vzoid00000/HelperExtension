// Der Helper als fester Bereich in der OSDP-Seite („Dock“): Die App-Seite der Extension
// (src/app/app.html) läuft als <iframe> direkt unter der OSDP-Kopfleiste, oberhalb des News-Editors –
// kein eigener Tab, kein Seitenpanel, kein Reiter am Rand. Das iframe ist eine Extension-Seite mit
// allen Rechten (Tabs, Scripting, Speicher); der Driver steuert den umgebenden Tab (eingebetteter
// Modus, kein Neuladen der Seite).
//
// Das Dock wird in <app-root> direkt hinter <app-nav> eingehängt. Diese Stelle überlebt die
// Navigation innerhalb von OSDP (nur der Router-Inhalt wechselt), das iframe und ein laufender
// Durchlauf bleiben also erhalten. Sichtbar ist das Dock nur im News-Editor (app-editor vorhanden);
// auf anderen OSDP-Seiten ist es ausgeblendet, läuft aber weiter.
//
// Bedienung: Kopfzeile mit Status, Ein-/Ausklappen (auch Alt+H oder Klick auf das Extension-Symbol),
// Höhe per Ziehen an der Unterkante. Zustand (eingeklappt, Höhe) in chrome.storage.local 'dock'.
// Nachrichten vom Service Worker: { type: 'osdp-helper-panel', action: 'toggle'|'open'|'close'|'autorun'|'status' }.
// 'autorun' (Zeitplan) wird per postMessage an genau dieses iframe weitergereicht – kommt die Nachricht,
// bevor die App ihren ersten Status gemeldet hat (Seite lädt gerade), wird sie bis dahin aufgehoben.
// Die App meldet ihren Status per postMessage an diese Seite ({ type: 'osdp-helper-status', text, kind }).

(() => {
  if (window.top !== window) return;
  const HOST_ID = 'osdp-helper-dock';
  if (document.getElementById(HOST_ID)) return;

  const MIN_H = 180;
  const MAX_H = 1400;
  const DEFAULT_H = 440;
  // appReady: die App hat ihren ersten Status gemeldet; ein vorher eintreffender Zeitplan-Start wartet
  const state = { collapsed: false, height: DEFAULT_H, appReady: false, pendingAutorun: false };
  let host = null;
  let els = null;

  const CSS = `
    :host { all: initial; display: block; }
    :host([hidden]) { display: none; }
    * { box-sizing: border-box; }
    .dock { display: flex; flex-direction: column; background: #09090b; color: #e4e4e7; border-bottom: 1px solid #27272a;
      font: 12px/1.3 Inter, "Segoe UI", system-ui, Roboto, sans-serif; }
    :host([data-theme="light"]) .dock { background: #fafafa; color: #18181b; border-bottom-color: #d4d4d8; }
    .head { display: flex; align-items: center; gap: 10px; height: 34px; padding: 0 12px 0 16px; border-bottom: 1px solid #27272a; }
    :host([data-theme="light"]) .head { border-bottom-color: #e4e4e7; }
    .head.collapsed { border-bottom: 0; }
    .name { font-weight: 600; letter-spacing: .03em; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #52525b; flex: none; }
    .dot.busy { background: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.25); }
    .dot.warn { background: #f59e0b; }
    .dot.ok { background: #22c55e; }
    .status { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #a1a1aa; }
    :host([data-theme="light"]) .status { color: #52525b; }
    .head button { all: unset; cursor: pointer; padding: 5px 10px; border-radius: 6px; border: 1px solid #27272a; color: #e4e4e7; font: 500 12px/1 inherit; font-family: inherit; }
    .head button:hover { background: #18181b; }
    .head button:focus-visible { outline: 2px solid #a1a1aa; }
    :host([data-theme="light"]) .head button { border-color: #d4d4d8; color: #18181b; }
    :host([data-theme="light"]) .head button:hover { background: #f4f4f5; }
    .body { display: flex; flex-direction: column; }
    .body.collapsed { display: none; }
    iframe { display: block; width: 100%; border: 0; background: #09090b; }
    :host([data-theme="light"]) iframe { background: #fafafa; }
    .handle { height: 7px; cursor: row-resize; background: transparent; }
    .handle:hover, .handle.active { background: rgba(59,130,246,.35); }
  `;

  function appUrl() {
    return chrome.runtime.getURL('src/app/app.html?embedded=1');
  }

  function mountPoint() {
    const nav = document.querySelector('app-root > app-nav');
    if (nav) return { parent: nav.parentElement, before: nav.nextSibling };
    const root = document.querySelector('app-root');
    if (root) return { parent: root, before: root.firstChild };
    return document.body ? { parent: document.body, before: document.body.firstChild } : null;
  }

  function ensureHost() {
    if (host && host.isConnected) return host;
    const mp = mountPoint();
    if (!mp) return null;
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      const root = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = CSS;

      const dock = document.createElement('div');
      dock.className = 'dock';
      const head = document.createElement('div');
      head.className = 'head';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = 'OSDP Helper';
      const dot = document.createElement('span');
      dot.className = 'dot';
      const status = document.createElement('span');
      status.className = 'status';
      status.textContent = 'Lädt …';
      const btnToggle = document.createElement('button');
      btnToggle.type = 'button';
      btnToggle.title = 'Helper ein-/ausklappen (Alt+H)';
      btnToggle.addEventListener('click', () => setCollapsed(!state.collapsed));
      head.append(name, dot, status, btnToggle);

      const body = document.createElement('div');
      body.className = 'body';
      const frame = document.createElement('iframe');
      frame.src = appUrl();
      frame.title = 'OSDP News Helper';
      frame.allow = 'clipboard-write';
      const handle = document.createElement('div');
      handle.className = 'handle';
      handle.title = 'Höhe ändern';
      body.append(frame, handle);
      dock.append(head, body);
      root.append(style, dock);
      els = { head, dot, status, btnToggle, body, frame, handle };

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
        applyHeight();
      });
      const stopDrag = () => {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('active');
        frame.style.pointerEvents = '';
        persist();
      };
      handle.addEventListener('pointerup', stopDrag);
      handle.addEventListener('pointercancel', stopDrag);
    }
    mp.parent.insertBefore(host, mp.before);
    applyTheme();
    applyHeight();
    applyCollapsed();
    applyVisibility();
    return host;
  }

  function applyHeight() {
    if (els) els.frame.style.height = `${state.height}px`;
  }

  function applyCollapsed() {
    if (!els) return;
    els.body.classList.toggle('collapsed', state.collapsed);
    els.head.classList.toggle('collapsed', state.collapsed);
    els.btnToggle.textContent = state.collapsed ? 'Ausklappen ▾' : 'Einklappen ▴';
    els.btnToggle.setAttribute('aria-expanded', state.collapsed ? 'false' : 'true');
  }

  function applyTheme() {
    if (!host) return;
    host.setAttribute('data-theme', document.body?.classList.contains('dark-theme') ? 'dark' : 'light');
  }

  /** Nur im News-Editor (Route #/newsEditor) sichtbar; das iframe läuft verborgen weiter.
   *  (Die News-Liste hat einen eigenen, versteckten app-editor in der Detail-Schublade – zählt nicht.) */
  function applyVisibility() {
    if (!host) return;
    const inEditor = !!document.querySelector('app-news-editor app-editor');
    if (inEditor) host.removeAttribute('hidden');
    else host.setAttribute('hidden', '');
  }

  function setCollapsed(collapsed) {
    if (!ensureHost()) return;
    state.collapsed = !!collapsed;
    applyCollapsed();
    persist();
  }

  function persist() {
    try {
      chrome.storage.local.set({ dock: { collapsed: state.collapsed, height: state.height } });
    } catch {
      /* Extension neu geladen */
    }
  }

  function setStatus(text, kind) {
    if (!els) return;
    els.status.textContent = text || '';
    els.status.title = text || '';
    els.dot.className = `dot${kind ? ' ' + kind : ''}`;
  }

  function toApp(msg) {
    try {
      els?.frame?.contentWindow?.postMessage(msg, '*');
    } catch {
      /* iframe noch nicht da */
    }
  }

  // Status der App (postMessage aus dem iframe)
  window.addEventListener('message', (e) => {
    if (!els || e.source !== els.frame.contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'osdp-helper-status') {
      setStatus(String(d.text || ''), ['busy', 'warn', 'ok'].includes(d.kind) ? d.kind : '');
      if (!state.appReady) {
        state.appReady = true;
        if (state.pendingAutorun) {
          state.pendingAutorun = false;
          toApp({ type: 'osdp-helper-autorun' });
        }
      }
    }
  });

  /** Zeitplan-Start an die App (sofort, oder sobald sie bereit ist). */
  function autorun() {
    setCollapsed(false);
    if (state.appReady) toApp({ type: 'osdp-helper-autorun' });
    else state.pendingAutorun = true;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'osdp-helper-panel') return;
    if (msg.action === 'toggle') setCollapsed(!state.collapsed);
    else if (msg.action === 'open') setCollapsed(false);
    else if (msg.action === 'close') setCollapsed(true);
    else if (msg.action === 'status') setStatus(msg.text || '', msg.kind || '');
    else if (msg.action === 'autorun') autorun();
    sendResponse({ ok: true, open: !state.collapsed, height: state.height, appReady: state.appReady, visible: !!host && !host.hasAttribute('hidden') });
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      setCollapsed(!state.collapsed);
    }
  });

  // Route-/Theme-Wechsel beobachten (app-editor kommt und geht, body.dark-theme wechselt)
  let timer = 0;
  const observer = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      ensureHost();
      applyTheme();
      applyVisibility();
    }, 150);
  });

  function start() {
    ensureHost();
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  chrome.storage.local.get('dock').then((stored) => {
    const d = stored?.dock || {};
    if (Number.isFinite(d.height)) state.height = Math.max(MIN_H, Math.min(MAX_H, d.height));
    if (d.collapsed) state.collapsed = true;
    start();
  }).catch(start);
})();
