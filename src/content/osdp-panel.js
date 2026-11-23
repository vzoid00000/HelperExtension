// Seitenpanel direkt in der OSDP-Oberfläche: Die App-Seite der Extension (src/app/app.html) wird als
// <iframe> rechts neben den OSDP-Inhalt gesetzt, die Seite rückt entsprechend zusammen. Das iframe ist
// eine Extension-Seite mit allen Rechten (Tabs, Scripting, Speicher); der Driver steuert den
// umgebenden Tab (eingebetteter Modus, kein Neuladen der Seite).
//
// Umschalten: Reiter am rechten Rand, Klick auf das Extension-Symbol (Nachricht vom Service Worker)
// oder Nachricht { type: 'osdp-helper-panel', action: 'toggle' | 'open' | 'close' }.
// Zustand (offen, Breite) liegt in chrome.storage.local unter 'panel'.

(() => {
  if (window.top !== window) return;
  const HOST_ID = 'osdp-helper-panel';
  const STYLE_ID = 'osdp-helper-panel-style';
  if (document.getElementById(HOST_ID)) return;

  const MIN_W = 380;
  const MAX_W = 960;
  const DEFAULT_W = 540;
  const APP_URL = chrome.runtime.getURL('src/app/app.html?embedded=1');
  const state = { open: false, width: DEFAULT_W };
  let host = null;
  let els = null;

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .tab { position: fixed; right: 0; bottom: 96px; z-index: 2147483000; writing-mode: vertical-rl; transform: rotate(180deg);
      padding: 12px 7px; border-radius: 0 8px 8px 0; border: 1px solid #27272a; border-right: 0; background: #09090b; color: #fafafa;
      font: 600 12px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: .04em; cursor: pointer;
      box-shadow: -4px 0 16px rgba(0,0,0,.35); user-select: none; }
    .tab:hover { background: #18181b; }
    .tab .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #52525b; margin-top: 8px; }
    .tab .dot.busy { background: #3b82f6; }
    .tab .dot.ok { background: #22c55e; }
    .panel { position: fixed; top: 0; right: 0; height: 100vh; z-index: 2147483001; display: none; flex-direction: column;
      background: #09090b; border-left: 1px solid #27272a; box-shadow: -8px 0 24px rgba(0,0,0,.4); }
    .panel.open { display: flex; }
    .head { display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px; border-bottom: 1px solid #27272a; color: #fafafa;
      font: 600 12px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .head .name { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #a1a1aa; font-weight: 500; }
    .head button { all: unset; cursor: pointer; padding: 5px 9px; border-radius: 6px; border: 1px solid #27272a; color: #e4e4e7;
      font: 500 12px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .head button:hover { background: #18181b; }
    .head button:focus-visible { outline: 2px solid #a1a1aa; }
    iframe { flex: 1 1 auto; width: 100%; border: 0; background: #09090b; }
    .handle { position: absolute; left: -4px; top: 0; width: 8px; height: 100%; cursor: col-resize; }
    .handle:hover, .handle.active { background: rgba(59,130,246,.35); }
  `;

  function pageStyle() {
    let st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = STYLE_ID;
      document.documentElement.append(st);
    }
    const w = state.width;
    st.textContent = state.open
      ? `:root { --osdp-helper-w: ${w}px; }
         html { margin-right: ${w}px !important; }
         #toast-container { right: ${w + 16}px !important; }
         #osdp-helper-bar { right: ${w}px !important; }`
      : '';
  }

  function ensureHost() {
    if (host && host.isConnected) return host;
    host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;

    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.type = 'button';
    tab.title = 'OSDP News Helper ein-/ausblenden (Alt+H)';
    tab.append(document.createTextNode('OSDP Helper'));
    const dot = document.createElement('span');
    dot.className = 'dot';
    tab.append(dot);
    tab.addEventListener('click', () => setOpen(!state.open));

    const panel = document.createElement('div');
    panel.className = 'panel';
    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.title = 'Breite ändern';
    const head = document.createElement('div');
    head.className = 'head';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = 'OSDP News Helper';
    const btnTab = document.createElement('button');
    btnTab.type = 'button';
    btnTab.textContent = 'Als Tab';
    btnTab.title = 'Die App in einem eigenen Tab öffnen';
    btnTab.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'osdp-helper-open-app' }).catch(() => {}));
    const btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.textContent = '✕';
    btnClose.title = 'Panel schließen';
    btnClose.addEventListener('click', () => setOpen(false));
    head.append(name, btnTab, btnClose);
    panel.append(handle, head);
    root.append(style, tab, panel);
    document.documentElement.append(host);
    els = { tab, dot, panel, handle, frame: null };

    // Breite per Ziehen am linken Rand
    let dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      handle.classList.add('active');
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      state.width = Math.max(MIN_W, Math.min(MAX_W, Math.round(window.innerWidth - e.clientX)));
      applyWidth();
    });
    const stopDrag = () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('active');
      persist();
    };
    handle.addEventListener('pointerup', stopDrag);
    handle.addEventListener('pointercancel', stopDrag);
    return host;
  }

  function applyWidth() {
    els.panel.style.width = `${state.width}px`;
    els.tab.style.right = state.open ? `${state.width}px` : '0';
    pageStyle();
  }

  function setOpen(open) {
    ensureHost();
    state.open = !!open;
    if (state.open && !els.frame) {
      const frame = document.createElement('iframe');
      frame.src = APP_URL;
      frame.title = 'OSDP News Helper';
      frame.allow = 'clipboard-write';
      els.panel.append(frame);
      els.frame = frame;
    }
    els.panel.classList.toggle('open', state.open);
    els.tab.setAttribute('aria-expanded', state.open ? 'true' : 'false');
    applyWidth();
    persist();
  }

  function persist() {
    try {
      chrome.storage.local.set({ panel: { open: state.open, width: state.width } });
    } catch {
      /* Extension neu geladen */
    }
  }

  function setStatus(kind) {
    if (!els) return;
    els.dot.className = `dot${kind ? ' ' + kind : ''}`;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'osdp-helper-panel') return;
    if (msg.action === 'toggle') setOpen(!state.open);
    else if (msg.action === 'open') setOpen(true);
    else if (msg.action === 'close') setOpen(false);
    else if (msg.action === 'status') setStatus(msg.kind || '');
    sendResponse({ ok: true, open: state.open, width: state.width });
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      setOpen(!state.open);
    }
  });

  chrome.storage.local.get('panel').then((stored) => {
    const p = stored?.panel || {};
    if (Number.isFinite(p.width)) state.width = Math.max(MIN_W, Math.min(MAX_W, p.width));
    ensureHost();
    applyWidth();
    if (p.open) setOpen(true);
  }).catch(() => {
    ensureHost();
    applyWidth();
  });
})();
