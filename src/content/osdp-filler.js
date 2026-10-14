// Wird in den OSDP-Tab injiziert (isolierte Welt) und führt einzelne Schritte im
// News-Editor aus. Die Struktur stammt aus dem DOM-Dump (Angular 17 + Material):
//
//   Tab-Gruppe 1: Native | English Translated | German Translated | Summary
//     je Tab: input[formcontrolname=article_source|article_title|article_title_translatedde…]
//             ckeditor[formcontrolname=article_content…]  (CKEditor 5 → wird in der
//             MAIN-Welt über editor.setData() befüllt, siehe lib/osdp-driver.js)
//   Tab-Gruppe 2: Metadata | Tags
//     Tags: mat-tree (flach gerendert) mit mat-tree-node[aria-level][aria-expanded],
//           Toggle-Button [mattreenodetoggle], mat-checkbox mit label.mdc-label;
//           vollständiger Tooltip im Element, auf das aria-describedby zeigt
//   Oben: Buttons Save | Extract | Summary | Translate
//
// Freigabe-Schleife (lib/osdp-driver.js → waitForReview): showOverlay zeigt unten eine Leiste
// mit „Überspringen“/„Abbrechen“ und startet einen Beobachter im Tab (500 ms + Klick-Listener auf
// „Save“), der Erfolgstoast / Duplikat-Toast / Formular-Reset nach Save-Klick / Leisten-Klick per
// chrome.runtime.sendMessage({ type: 'osdp-helper-review', … }) sofort an die App meldet. Der Driver
// pollt zusätzlich readOverlay (Aktion) und watchSave (Toasts, Formularzustand, Save-Indizien) als
// Rückfallebene; hideOverlay räumt auf. Bleibt der Empfänger aus (App-Tab geschlossen), entfernt
// sich die Leiste nach ca. 10 s selbst. Gespeichert wird nur vom Nutzer selbst.
//
// Aufruf: globalThis.__osdpHelper.run('<schritt>', daten)

(() => {
  if (globalThis.__osdpHelper?.run) return;

  // Kennung dieser Injektion: ändert sich nur, wenn das Dokument neu geladen wurde (neue isolierte
  // Welt). Der Driver erkennt daran einen Reload während der Freigabe.
  const session = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const collapse = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const text = (el) => collapse(el ? el.textContent : '');
  const norm = (s) => collapse(s).toLowerCase();

  function isVisible(el) {
    if (!el || !el.getClientRects || el.getClientRects().length === 0) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  // ------------------------------------------------------------ Tabs ----
  const tabGroups = () => [...document.querySelectorAll('mat-tab-group')];
  const groupTabs = (g) => [...g.querySelectorAll('.mat-mdc-tab, [role="tab"]')].filter((t) => t.closest('mat-tab-group') === g);
  const groupBodies = (g) => [...g.querySelectorAll('mat-tab-body')].filter((b) => b.closest('mat-tab-group') === g);

  function findGroup(labelPattern) {
    const re = new RegExp(labelPattern, 'i');
    return tabGroups().find((g) => groupTabs(g).some((t) => re.test(text(t)))) || null;
  }

  /** Tab anklicken und dessen Body zurückgeben (wartet bei lazy gerenderten Tabs). */
  async function selectTab(group, labelPattern) {
    if (!group) return null;
    const re = new RegExp(labelPattern, 'i');
    const tabs = groupTabs(group);
    const idx = tabs.findIndex((t) => re.test(text(t)));
    if (idx < 0) return null;
    const tab = tabs[idx];
    const active = tab.classList.contains('mdc-tab--active') || tab.getAttribute('aria-selected') === 'true';
    if (!active) {
      tab.click();
      await sleep(350);
    }
    let body = groupBodies(group)[idx];
    for (let i = 0; i < 25 && body && !(body.querySelector('input, textarea, button, mat-tree, ckeditor, mat-form-field')); i++) {
      await sleep(200);
      body = groupBodies(group)[idx];
    }
    return body || null;
  }

  // ---------------------------------------------------------- Inputs ----
  function setNativeValue(el, value, { blur = true } = {}) {
    const proto = el.localName === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    el.focus();
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (blur) blurField(el);
  }

  function blurField(el) {
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  }

  /**
   * Feld setzen. Das Quellfeld (article_source) löst bei blur die Duplikatprüfung aus, die den
   * Artikel aus dem Store zurückschreibt – deshalb erst Eingabe, dann warten, bis der Store den
   * Wert hat, dann blur (sonst wird das Feld wieder geleert).
   */
  async function fillControl(body, controlName, value, { settleMs = 0 } = {}) {
    const el = body?.querySelector(`input[formcontrolname="${controlName}"], textarea[formcontrolname="${controlName}"]`);
    if (!el) return false;
    setNativeValue(el, value, { blur: settleMs === 0 });
    if (settleMs > 0) {
      await sleep(settleMs);
      blurField(el);
      await sleep(150);
    }
    return true;
  }

  /** Eingabefeld über den Label-Text finden (mat-form-field → mat-label). */
  function findLabelField(body, pattern) {
    if (!body) return null;
    const re = new RegExp(pattern, 'i');
    for (const ff of body.querySelectorAll('mat-form-field')) {
      const label = text(ff.querySelector('mat-label, label'));
      const placeholder = ff.querySelector('input, textarea')?.getAttribute('placeholder') || '';
      if (re.test(label) || re.test(placeholder)) {
        const input = ff.querySelector('input, textarea, mat-select, select');
        if (input) return input;
      }
    }
    for (const l of body.querySelectorAll('label')) {
      if (!re.test(text(l))) continue;
      const forId = l.getAttribute('for');
      const el = forId && document.getElementById(forId);
      if (el) return el;
      const inner = l.querySelector('input, textarea, select');
      if (inner) return inner;
    }
    for (const i of body.querySelectorAll('input, textarea')) {
      const hay = [i.getAttribute('placeholder'), i.getAttribute('aria-label'), i.getAttribute('formcontrolname'), i.getAttribute('name')].filter(Boolean).join(' ');
      if (hay && re.test(hay)) return i;
    }
    return null;
  }

  function findButton(root, pattern) {
    const re = new RegExp(pattern, 'i');
    return [...(root || document).querySelectorAll('button, [role="button"], a.mdc-button, mat-icon')].find((b) => {
      const hay = `${text(b)} ${b.getAttribute('aria-label') || ''} ${b.getAttribute('mattooltip') || ''} ${b.getAttribute('title') || ''}`;
      return re.test(hay) && isVisible(b);
    }) || null;
  }

  function describeBody(body) {
    if (!body) return null;
    return {
      labels: [...body.querySelectorAll('mat-label, label, legend')].map(text).filter(Boolean),
      buttons: [...body.querySelectorAll('button, [role="button"]')].map((b) => `${text(b)}${b.getAttribute('aria-label') ? ' [' + b.getAttribute('aria-label') + ']' : ''}`).filter(Boolean),
      inputs: [...body.querySelectorAll('input, textarea, mat-select, select, mat-checkbox, mat-slide-toggle')].map((i) => ({
        tag: i.localName,
        type: i.getAttribute('type') || undefined,
        formControlName: i.getAttribute('formcontrolname') || undefined,
        placeholder: i.getAttribute('placeholder') || undefined,
        id: i.id || undefined,
        value: typeof i.value === 'string' ? i.value.slice(0, 80) : undefined
      }))
    };
  }

  const topBar = () => document.querySelector('app-editor form > div, app-editor form') || document.body;
  const spinnerVisible = () => [...document.querySelectorAll('ngx-spinner .ngx-spinner-overlay, ngx-spinner div')].some(isVisible);
  const snackbarText = () => text(document.querySelector('mat-snack-bar-container, .mat-mdc-snack-bar-container, simple-snack-bar')) || '';

  /**
   * Toasts (ngx-toastr): OSDP meldet Erfolg/Fehler darüber („Item Added!“, „Duplicate, URL already in the database!“ …).
   * Jedes Toast-Element bekommt eine stabile id, damit der Driver alte Toasts (10 s Anzeigedauer) von neuen unterscheiden kann.
   */
  let toastSeq = 0;
  function toasts() {
    return [...document.querySelectorAll('#toast-container .ngx-toastr, #toast-container .toast, .toast-container .ngx-toastr')].map((t) => {
      if (!t.dataset.osdpHelperToast) t.dataset.osdpHelperToast = `${session}:${++toastSeq}`;
      return {
        id: t.dataset.osdpHelperToast,
        kind: /toast-error/.test(t.className) ? 'error' : /toast-success/.test(t.className) ? 'success' : /toast-warning/.test(t.className) ? 'warning' : 'info',
        title: text(t.querySelector('.toast-title')),
        message: text(t.querySelector('.toast-message')) || text(t)
      };
    });
  }

  // -------------------------------------------------------- Tag-Baum ----
  function treeNodes(body) {
    return [...body.querySelectorAll('mat-tree-node')].map((el) => ({
      el,
      label: text(el.querySelector('label.mdc-label, label')),
      level: parseInt(el.getAttribute('aria-level') || '1', 10),
      expanded: el.getAttribute('aria-expanded') === 'true',
      toggle: el.querySelector('button[mattreenodetoggle]:not([disabled])'),
      checkbox: el.querySelector('input[type="checkbox"]'),
      host: el.querySelector('mat-checkbox')
    }));
  }

  async function expandNode(node) {
    if (node.expanded || !node.toggle) return node.expanded;
    // Ohne type-Attribut wäre der Button innerhalb des <form> ein Submit-Button.
    if (!node.toggle.getAttribute('type')) node.toggle.setAttribute('type', 'button');
    node.toggle.click();
    for (let i = 0; i < 20; i++) {
      await sleep(100);
      if (node.el.getAttribute('aria-expanded') === 'true') break;
    }
    await sleep(150);
    return node.el.getAttribute('aria-expanded') === 'true';
  }

  /** Knoten über den vollständigen Pfad (Segmente) finden; klappt Eltern bei Bedarf auf. */
  async function findTreePath(body, segments) {
    let nodes = treeNodes(body);
    let startIdx = 0;
    let current = null;
    for (let d = 0; d < segments.length; d++) {
      const want = norm(segments[d]);
      const level = d + 1;
      let found = null;
      for (let i = startIdx; i < nodes.length; i++) {
        const n = nodes[i];
        if (d > 0 && n.level <= d) break; // Teilbaum des Elternknotens verlassen
        if (n.level === level && norm(n.label) === want) {
          found = { n, i };
          break;
        }
      }
      if (!found) {
        return { error: `„${segments[d]}“ nicht gefunden unter ${segments.slice(0, d).join(' → ') || 'Wurzel'}` };
      }
      current = found.n;
      if (d < segments.length - 1) {
        const ok = await expandNode(current);
        if (!ok && !current.expanded) return { error: `„${segments[d]}“ lässt sich nicht aufklappen` };
        nodes = treeNodes(body);
        let idx = nodes.findIndex((x) => x.el === current.el);
        if (idx < 0) idx = nodes.findIndex((x) => x.level === level && norm(x.label) === want);
        startIdx = idx + 1;
      }
    }
    return { node: current };
  }

  function tooltipOf(node) {
    const host = node.host || node.el.querySelector('[aria-describedby]');
    const ids = host?.getAttribute('aria-describedby') || '';
    const full = ids.split(/\s+/).map((id) => text(document.getElementById(id))).filter(Boolean).join(' ');
    return full || host?.getAttribute('ng-reflect-message') || '';
  }

  /** Ausgewählte Tags (Chips unter dem Suchfeld). OSDP rendert je Tag eine Kette aus Pfad-Chips; relevant ist der letzte. */
  const chips = () => {
    const out = [];
    for (const c of document.querySelectorAll('mat-chip-listbox mat-chip, mat-chip-listbox mat-chip-option, mat-chip-listbox mat-chip-row')) {
      const t = text(c).replace(/\s*cancel$/i, '').trim();
      if (t && !out.includes(t)) out.push(t);
    }
    return out;
  };

  // ------------------------------------------------- Freigabe-Leiste ----
  const BAR_ID = 'osdp-helper-bar';
  const BAR_STYLE_ID = 'osdp-helper-bar-style';
  let barHost = null; // von dieser Welt erzeugte Leiste
  // 'skip' | 'abort' | null – nur in dieser Closure (isolierte Welt), nie im DOM: Seitenskripte können
  // die Aktion so nicht vortäuschen. Wird von readOverlay (Driver) oder vom Beobachter abgeholt.
  let barAction = null;

  const BAR_CSS = `
    :host { all: initial; display: block; position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647; pointer-events: none; }
    .bar { pointer-events: auto; box-sizing: border-box; display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 7px 14px;
      background: #09090b; color: #fafafa; border-top: 1px solid #27272a; box-shadow: 0 -6px 18px rgba(0, 0, 0, .35);
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .bar.warn { border-top: 2px solid #d97706; box-shadow: 0 -6px 18px rgba(217, 119, 6, .35); }
    .brand { font-weight: 600; color: #a1a1aa; white-space: nowrap; }
    .dot { color: #52525b; }
    .count { color: #a1a1aa; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
    .badge { display: inline-block; padding: 2px 9px; border-radius: 999px; border: 1px solid #3f3f46; background: #18181b; color: #e4e4e7;
      font-size: 11px; font-weight: 500; white-space: nowrap; }
    .badge:empty { display: none; }
    .badge.wb { border-color: #b45309; color: #fbbf24; background: #1c1917; }
    .badge.check { border-color: #d97706; color: #fbbf24; background: #1c1917; font-weight: 600; }
    .hint { color: #a1a1aa; white-space: nowrap; }
    .hint:empty { display: none; }
    .bar.warn .hint { flex: 2 1 auto; min-width: 0; white-space: normal; color: #fbbf24; }
    button { all: unset; box-sizing: border-box; cursor: pointer; padding: 6px 12px; border-radius: 6px; border: 1px solid #3f3f46; background: #18181b;
      color: #fafafa; font: inherit; font-weight: 500; line-height: 1.2; white-space: nowrap; }
    button:hover { background: #27272a; }
    button:focus-visible { outline: 2px solid #a1a1aa; outline-offset: 1px; }
    button.danger { border-color: #7f1d1d; color: #fca5a5; }
    button.danger:hover { background: #450a0a; }
    @media (max-width: 900px) { .bar:not(.warn) .hint { display: none; } }
  `;

  function barElements(host) {
    const r = host.shadowRoot;
    return {
      bar: r.querySelector('.bar'),
      count: r.querySelector('.count'),
      title: r.querySelector('.title'),
      structure: r.querySelector('.badge.structure'),
      wb: r.querySelector('.badge.wb'),
      check: r.querySelector('.badge.check'),
      hint: r.querySelector('.hint')
    };
  }

  /** Leiste anlegen (einmalig pro Welt). Eine Leiste aus einer früheren Welt (Extension neu geladen) wird ersetzt. */
  function ensureBar() {
    const existing = document.getElementById(BAR_ID);
    if (existing && existing === barHost && existing.shadowRoot) return existing;
    if (existing) existing.remove();
    const host = document.createElement('div');
    host.id = BAR_ID;
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = BAR_CSS;
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'OSDP News Helper');
    const mk = (tag, cls, txt) => {
      const el = document.createElement(tag);
      el.className = cls;
      if (txt) el.textContent = txt;
      return el;
    };
    // Die Aktion steckt als Konstante in der Closure des Handlers (kein data-Attribut, das die Seite ändern könnte)
    const mkAction = (cls, label, action, tip) => {
      const b = mk('button', cls, label);
      b.type = 'button';
      b.title = tip;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        barAction = action;
        // Sofort melden (ein inzwischen sichtbarer Erfolg/Duplikat gewinnt gegen den Klick)
        if (observer) observeTick(observer, { fromClick: true });
      });
      return b;
    };
    const btnSkip = mkAction('skip', 'Überspringen', 'skip', 'Diese Meldung nicht eintragen und mit der nächsten weitermachen');
    const btnAbort = mkAction('danger abort', 'Abbrechen', 'abort', 'Lauf beenden');
    bar.append(mk('span', 'brand', 'OSDP News Helper'), mk('span', 'dot', '·'), mk('span', 'count'), mk('span', 'dot', '·'), mk('span', 'title'), mk('span', 'badge structure'), mk('span', 'badge wb'), mk('span', 'badge check'), mk('span', 'hint'), btnSkip, btnAbort);
    root.append(style, bar);
    (document.body || document.documentElement).append(host);
    // Toasts (ngx-toastr, unten rechts) über die Leiste heben, damit „Item Added!“ sichtbar bleibt
    if (!document.getElementById(BAR_STYLE_ID)) {
      const pageStyle = document.createElement('style');
      pageStyle.id = BAR_STYLE_ID;
      pageStyle.textContent = '#toast-container.toast-bottom-right, #toast-container.toast-bottom-left, #toast-container.toast-bottom-center, #toast-container.toast-bottom-full-width { bottom: 58px !important; }';
      document.head.append(pageStyle);
    }
    barHost = host;
    return host;
  }

  function removeBar() {
    stopObserver();
    document.getElementById(BAR_ID)?.remove();
    document.getElementById(BAR_STYLE_ID)?.remove();
    barHost = null;
    barAction = null;
  }

  /** Quell- und Titelfeld des Native-Reiters (OSDP hält alle Reiter im DOM: preserveContent). */
  function nativeFields() {
    const native = findGroup('native');
    const body = native ? groupBodies(native)[0] : null;
    const source = body?.querySelector('input[formcontrolname="article_source"]') || document.querySelector('input[formcontrolname="article_source"]');
    const title = body?.querySelector('input[formcontrolname="article_title"]') || document.querySelector('input[formcontrolname="article_title"]');
    return { source, title };
  }

  const SAVE_BUTTON = '^\\s*(save|update)\\s*$|speichern';

  /**
   * Messpunkt der Freigabe (von watchSave und vom Beobachter benutzt): Toasts, Formularzustand, Chips.
   * Erfolg: Toast „Item Added!“/„Item Updated!“ – verschwindet nach 10 s, deshalb zusätzlich
   * formReset: expectSource war gesetzt und Quelle + Titel sind jetzt leer (resetArticleForm). Ein
   * formReset allein beweist keinen Save (der Nutzer kann das Formular von Hand leeren) – dazu dienen
   * saveClicked (Klick auf „Save“ seit showOverlay) und spinnerSeen (Spinner seit showOverlay gesehen).
   * ignoreToastIds: Toasts, die schon vor der Freigabe sichtbar waren (zählen nicht als Ergebnis).
   */
  function measure({ expectSource = '', ignoreToastIds = [] } = {}) {
    const all = toasts();
    const sb = snackbarText();
    if (sb) all.push({ kind: 'info', title: 'snackbar', message: sb });
    const ignore = ignoreToastIds instanceof Set ? ignoreToastIds : new Set(ignoreToastIds || []);
    const fresh = all.filter((t) => !t.id || !ignore.has(t.id));
    const f = nativeFields();
    const sourceValue = f.source?.value || '';
    const titleValue = f.title?.value || '';
    const hay = (t) => `${t.title} ${t.message}`;
    const duplicate = fresh.some((t) => /duplicate/i.test(hay(t)));
    const spinner = spinnerVisible();
    return {
      ok: true,
      session,
      toasts: all,
      freshToasts: fresh,
      success: fresh.some((t) => /Item Added|Item Updated/i.test(hay(t))),
      duplicate,
      errorToast: fresh.filter((t) => t.kind === 'error' && !/duplicate/i.test(hay(t))).map((t) => t.message).join(' | '),
      errorVisible: [...document.querySelectorAll('mat-error, .mat-mdc-form-field-error')].map(text).filter(Boolean),
      sourceValue,
      titleValue,
      fieldsPresent: !!(f.source && f.title),
      chips: chips(),
      formReset: !!expectSource && !!(f.source && f.title) && !sourceValue && !titleValue,
      spinner,
      saveClicked: !!(observer && observer.saveClickedAt),
      spinnerSeen: spinner || !!(observer && observer.spinnerSeen),
      saveDisabled: !!findButton(topBar(), SAVE_BUTTON)?.disabled,
      url: location.href
    };
  }

  // ------------------------------------------- Beobachter der Freigabe ----
  // Läuft im OSDP-Tab (Vordergrund, nicht gedrosselt) ab showOverlay und meldet Ergebnisse sofort an
  // die App-Seite (chrome.runtime.sendMessage); der Driver pollt zusätzlich. Antwortet niemand
  // ({ ack: true } bleibt aus, z. B. App-Tab geschlossen), räumt die Leiste sich nach ~10 s selbst ab.
  const REVIEW_MESSAGE = 'osdp-helper-review';
  const OBSERVE_MS = 500;
  const PING_EVERY = 4; // alle 2 s ein Lebenszeichen
  const MAX_FAILURES = 5; // ≈ 10 s ohne Empfänger
  let observer = null;

  const runtimeAvailable = () => typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;

  /** Nachricht an die App; true = ein Empfänger hat mit { ack: true } geantwortet. Fehler werden geschluckt. */
  async function notifyApp(payload) {
    if (!runtimeAvailable()) return false;
    try {
      const resp = await Promise.race([
        chrome.runtime.sendMessage({ type: REVIEW_MESSAGE, session, ...payload }),
        sleep(3000).then(() => null)
      ]);
      return !!(resp && resp.ack);
    } catch {
      return false;
    }
  }

  function startObserver({ expectSource = '' } = {}) {
    stopObserver();
    const o = {
      expectSource: expectSource || nativeFields().source?.value || '',
      ignoreToastIds: new Set(toasts().map((t) => t.id)),
      saveClickedAt: 0,
      spinnerSeen: false,
      lastChips: chips(),
      sentEvent: null,
      failures: 0,
      ticks: 0,
      busy: false,
      timer: 0,
      onClick: null
    };
    // Capture-Phase: sieht den Klick auf „Save“, bevor die Angular-App ihn verarbeitet
    o.onClick = (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('button, [role="button"]') : null;
      if (btn && new RegExp(SAVE_BUTTON, 'i').test(text(btn))) o.saveClickedAt = Date.now();
    };
    document.addEventListener('click', o.onClick, true);
    o.timer = setInterval(() => observeTick(o), OBSERVE_MS);
    observer = o;
    return o;
  }

  function stopObserver() {
    if (!observer) return;
    clearInterval(observer.timer);
    document.removeEventListener('click', observer.onClick, true);
    observer = null;
  }

  async function observeTick(o, { fromClick = false } = {}) {
    if (observer !== o || o.busy) return;
    o.busy = true;
    try {
      o.ticks++;
      if (spinnerVisible()) o.spinnerSeen = true;
      const w = measure({ expectSource: o.expectSource, ignoreToastIds: o.ignoreToastIds });
      if (w.chips.length) o.lastChips = w.chips;
      // Reihenfolge wie im Driver: ein erkannter Save/Duplikat gewinnt gegen Überspringen/Abbrechen
      let event = null;
      let reason = '';
      if (w.success) {
        event = 'saved';
        reason = 'toast';
      } else if (w.duplicate) {
        event = 'duplicate';
        reason = 'toast';
      } else if (w.formReset && (o.saveClickedAt || o.spinnerSeen) && !w.errorToast && !w.errorVisible.length && !w.spinner) {
        event = 'saved';
        reason = 'formReset';
      } else if (barAction === 'skip' || barAction === 'abort') {
        event = barAction;
        reason = 'overlay';
      }
      let acked = null;
      if (event && o.sentEvent !== event) {
        acked = await notifyApp({ event, reason, chips: o.lastChips, toasts: w.freshToasts });
        if (acked) o.sentEvent = event;
      } else if (!fromClick && o.ticks % PING_EVERY === 0) {
        acked = await notifyApp({ event: 'ping' });
      }
      if (acked === true) o.failures = 0;
      else if (acked === false && ++o.failures >= MAX_FAILURES) removeBar(); // niemand hört mehr zu
    } finally {
      o.busy = false;
    }
  }

  // ----------------------------------------------------------- Steps ----
  const steps = {
    probe() {
      const native = findGroup('native');
      const body = native ? groupBodies(native)[0] : null;
      return {
        url: location.href,
        hasEditor: !!document.querySelector('app-news-editor, app-editor'),
        hasNav: !!document.querySelector('app-nav'),
        permissionError: /permissionError/i.test(location.hash) || /keine Berechtigung/i.test(text(document.querySelector('router-outlet + *'))),
        loginForm: !!document.querySelector('input[type="password"]') || /\/login/i.test(location.hash),
        groups: tabGroups().map((g) => groupTabs(g).map(text)),
        sourceValue: body?.querySelector('input[formcontrolname="article_source"]')?.value || '',
        titleValue: body?.querySelector('input[formcontrolname="article_title"]')?.value || '',
        chips: chips(),
        spinner: spinnerVisible(),
        toasts: toasts(),
        topButtons: [...topBar().querySelectorAll(':scope > button, :scope > div > button')].map(text).filter(Boolean)
      };
    },

    /** Hash-Navigation innerhalb der App (ohne Neuladen), z. B. zum Editor. */
    navigate({ hash }) {
      location.hash = hash;
      return { ok: true, url: location.href };
    },

    async fillNative({ url, title }) {
      const group = findGroup('native');
      const body = await selectTab(group, '^\\s*native\\s*$');
      if (!body) return { ok: false, error: 'Tab „Native“ nicht gefunden' };
      const r = { ok: true };
      if (title !== undefined) r.title = await fillControl(body, 'article_title', title);
      if (url !== undefined) {
        r.source = await fillControl(body, 'article_source', url, { settleMs: 900 });
        r.sourceValue = body.querySelector('input[formcontrolname="article_source"]')?.value || '';
        if (r.sourceValue !== url) {
          // Die Duplikatprüfung (focusout) hat den alten Store-Wert zurückgeschrieben: noch einmal setzen –
          // wieder mit Wartezeit vor dem blur, sonst wiederholt sich die Race mit dem 250-ms-Debounce.
          await fillControl(body, 'article_source', url, { settleMs: 900 });
          r.sourceValue = body.querySelector('input[formcontrolname="article_source"]')?.value || '';
          r.sourceRetried = true;
          if (r.sourceValue !== url) {
            r.ok = false;
            r.error = `Quellfeld übernimmt die URL nicht (steht auf „${r.sourceValue.slice(0, 80)}“)`;
          }
        }
        r.toasts = toasts();
      }
      return r;
    },

    async fillTranslated({ lang, title }) {
      const group = findGroup('native');
      const pattern = lang === 'de' ? 'german' : 'english';
      const body = await selectTab(group, pattern);
      if (!body) return { ok: false, error: `Tab „${lang === 'de' ? 'German' : 'English'} Translated“ nicht gefunden` };
      return { ok: true, title: await fillControl(body, `article_title_translated${lang}`, title) };
    },

    async selectTab({ group, tab }) {
      const body = await selectTab(findGroup(group), tab);
      return { ok: !!body };
    },

    /** Titel und Text des Native-Tabs lesen (z. B. nach dem Site-eigenen „Extract“). */
    async readNative() {
      const group = findGroup('native');
      const body = await selectTab(group, '^\\s*native\\s*$');
      if (!body) return { ok: false };
      const editable = body.querySelector('.ck-editor__editable');
      const paragraphs = editable ? [...editable.querySelectorAll('p, h1, h2, h3, h4, li, blockquote')].map(text).filter(Boolean) : [];
      return {
        ok: true,
        title: body.querySelector('input[formcontrolname="article_title"]')?.value || '',
        text: paragraphs.join('\n\n')
      };
    },

    async clickTopButton({ pattern }) {
      const btn = findButton(topBar(), pattern);
      if (!btn) return { ok: false, error: `Button „${pattern}“ nicht gefunden` };
      if (btn.disabled) return { ok: false, error: `Button „${pattern}“ ist deaktiviert` };
      btn.click();
      return { ok: true };
    },

    /** Wartet nach „Extract“, bis Titel/Inhalt befüllt sind und der Spinner weg ist. */
    async waitForExtract({ timeoutMs = 45000 } = {}) {
      const start = Date.now();
      await sleep(800);
      while (Date.now() - start < timeoutMs) {
        const group = findGroup('native');
        const body = group ? groupBodies(group)[0] : null;
        const title = body?.querySelector('input[formcontrolname="article_title"]')?.value || '';
        const content = text(body?.querySelector('.ck-editor__editable'));
        if (!spinnerVisible() && title && content.length > 200) return { ok: true, title, contentLength: content.length };
        await sleep(500);
      }
      return { ok: false, error: 'Extract hat nicht rechtzeitig Daten geliefert' };
    },

    /**
     * Reiter „Metadata“ (aus dem Bundle bekannt):
     *   input[formcontrolname=article_created_at]  mat-datepicker, Moment-Adapter, Locale en-GB → "DD/MM/YYYY"
     *   input[formcontrolname=article_author]      + Button matTooltip "Set to Autor ungenannt"
     *   mat-select[formcontrolname=article_language] (leer → beim Speichern "en")
     */
    async fillMetadata({ author, authorUnknown, authorUnknownText, date, dateIso, dateGb }) {
      const group = findGroup('metadata');
      const body = await selectTab(group, 'metadata');
      if (!body) return { ok: false, error: 'Tab „Metadata“ nicht gefunden' };
      await sleep(300);
      const r = { ok: true, found: {}, structure: describeBody(body) };

      const authorField = body.querySelector('input[formcontrolname="article_author"]') || findLabelField(body, 'author|autor|verfasser|byline');
      r.found.author = authorField ? `${authorField.localName}[${authorField.getAttribute('formcontrolname') || authorField.id || ''}]` : null;
      if (authorUnknown) {
        const btn = findButton(body, 'ungenannt|unknown|anonym|no author|kein autor');
        if (btn) {
          btn.click();
          await sleep(200);
          r.author = 'button';
        } else if (authorField) {
          setNativeValue(authorField, authorUnknownText || 'Autor ungenannt');
          r.author = 'text';
        } else r.author = false;
        r.authorValue = authorField?.value;
      } else if (author !== undefined) {
        if (authorField) {
          setNativeValue(authorField, author);
          r.author = 'text';
        } else r.author = false;
      }

      const dateField = body.querySelector('input[formcontrolname="article_created_at"]') || findLabelField(body, 'date|datum|published|veröffentlicht|erschienen');
      r.found.date = dateField ? `${dateField.localName}[type=${dateField.type || ''} ${dateField.getAttribute('formcontrolname') || dateField.id || ''}${dateField.classList.contains('mat-datepicker-input') ? ' datepicker' : ''}]` : null;
      if (dateField && (date || dateIso || dateGb)) {
        let value = date;
        if (dateField.localName === 'input' && dateField.type === 'date') value = dateIso;
        else if (dateField.classList.contains('mat-datepicker-input') && dateGb) value = dateGb;
        setNativeValue(dateField, value);
        await sleep(200);
        r.date = !!dateField.value;
        r.dateValue = dateField.value;
        r.dateInvalid = dateField.classList.contains('ng-invalid') || !!body.querySelector('mat-error');
      } else if (date || dateIso) r.date = false;

      return r;
    },

    /** Reiter „Tags“: eine Checkbox auf oberster Ebene (z. B. „Cyber“) anhaken – Minimal-Fallback. */
    async checkTag({ label }) {
      const group = findGroup('tags');
      const body = await selectTab(group, '^\\s*tags\\s*$');
      if (!body) return { ok: false, error: 'Tab „Tags“ nicht gefunden' };
      await sleep(200);
      const nodes = treeNodes(body);
      const node = nodes.find((n) => norm(n.label) === norm(label)) || nodes.find((n) => norm(n.label).includes(norm(label)));
      if (!node?.checkbox) return { ok: false, error: `Tag „${label}“ nicht gefunden`, available: nodes.map((n) => n.label) };
      if (!node.checkbox.checked) {
        node.checkbox.click();
        await sleep(250);
      }
      return { ok: node.checkbox.checked, checked: node.checkbox.checked, chips: chips() };
    },

    /**
     * Reiter „Tags“: Liste vollständiger Pfade anklicken, z. B.
     * ["Struktur → [S]1 Cyber", "Newsinfo → Dokumententyp → News", …]
     */
    async applyTags({ paths, separator = ' → ' }) {
      const group = findGroup('tags');
      const body = await selectTab(group, '^\\s*tags\\s*$');
      if (!body) return { ok: false, error: 'Tab „Tags“ nicht gefunden', applied: [], failed: paths || [] };
      await sleep(200);
      const applied = [];
      const failed = [];
      // Eltern vor Kindern: Ist ein Kind gewählt, blockiert OSDP den Klick auf den Elternknoten (blockIfChildIsSelected).
      const ordered = [...(paths || [])].sort((a, b) => a.split(separator).length - b.split(separator).length);
      for (const path of ordered) {
        const segments = path.split(separator).map(collapse).filter(Boolean);
        const res = await findTreePath(body, segments);
        if (res.error || !res.node?.checkbox) {
          failed.push({ path, error: res.error || 'Checkbox fehlt' });
          continue;
        }
        const cb = res.node.checkbox;
        if (!cb.checked) {
          cb.click();
          for (let i = 0; i < 10 && !cb.checked; i++) await sleep(80);
        }
        if (cb.checked) applied.push(path);
        else failed.push({ path, error: 'Checkbox ließ sich nicht aktivieren' });
      }
      await sleep(200);
      return { ok: failed.length === 0, applied, failed, chips: chips() };
    },

    /** Alle Tags des Baums mit vollständigem Tooltip exportieren (klappt alles auf). */
    async exportTagTree({ maxExpansions = 1200 } = {}) {
      const group = findGroup('tags');
      const body = await selectTab(group, '^\\s*tags\\s*$');
      if (!body) return { ok: false, error: 'Tab „Tags“ nicht gefunden' };
      let expansions = 0;
      for (let round = 0; round < maxExpansions; round++) {
        const next = treeNodes(body).find((n) => !n.expanded && n.toggle && !n.el.classList.contains('checklist-leaf-node'));
        if (!next) break;
        const ok = await expandNode(next);
        expansions++;
        if (!ok) {
          // Blattknoten mit Toggle-Platzhalter: als aufgeklappt markieren, damit die Schleife endet
          next.el.setAttribute('aria-expanded', 'true');
        }
      }
      const nodes = treeNodes(body);
      const stack = [];
      const out = nodes.map((n) => {
        while (stack.length >= n.level) stack.pop();
        stack.push(n.label);
        return { path: stack.join(' → '), level: n.level, label: n.label, tooltip: tooltipOf(n), checked: !!n.checkbox?.checked };
      });
      return { ok: true, expansions, count: out.length, tags: out };
    },

    readChips() {
      return { ok: true, chips: chips() };
    },

    /**
     * Freigabe-Leiste unten im OSDP-Tab anzeigen bzw. aktualisieren (Shadow DOM, eigene Styles) und den
     * Beobachter (neu) starten; eine liegengebliebene Aktion aus einer früheren Freigabe wird verworfen.
     * hint: Text in der Leiste; beginnt er mit „⚠“, wird die Leiste als Warnung gestylt (Rahmen, Badge
     * „Bitte prüfen“, Hinweis auch auf schmalen Fenstern sichtbar). expectSource: erwartete Quell-URL im
     * Formular (Standard: aktueller Feldwert) für die Erkennung des Formular-Resets.
     */
    showOverlay({ title = '', index = 0, total = 0, structure = '', wb = '', hint, expectSource = '' } = {}) {
      const host = ensureBar();
      const el = barElements(host);
      el.count.textContent = total ? `${index}/${total}` : index ? String(index) : '';
      el.title.textContent = title || '';
      el.title.title = title || '';
      el.structure.textContent = structure || '';
      el.wb.textContent = wb || '';
      const hintText = hint === undefined ? 'Prüfen und in OSDP auf „Save“ klicken' : hint || '';
      const warn = /^\s*⚠/.test(hintText);
      el.hint.textContent = hintText;
      el.bar.classList.toggle('warn', warn);
      el.check.textContent = warn ? 'Bitte prüfen' : '';
      barAction = null;
      startObserver({ expectSource });
      return { ok: true, session, warn };
    },

    /** Vom Nutzer in der Leiste gewählte Aktion abholen (und zurücksetzen). */
    readOverlay() {
      const host = document.getElementById(BAR_ID);
      const action = barAction;
      barAction = null;
      return { ok: true, action: action === 'skip' || action === 'abort' ? action : null, visible: !!host, session };
    },

    hideOverlay() {
      removeBar();
      return { ok: true };
    },

    /**
     * Ein Messpunkt für die Freigabe-Schleife (der Driver pollt als Rückfallebene zum Beobachter):
     * Toasts, Formularzustand, Chips sowie die Save-Indizien saveClicked/spinnerSeen seit showOverlay.
     */
    watchSave({ expectSource = '', ignoreToastIds = [] } = {}) {
      return measure({ expectSource, ignoreToastIds });
    },

    /**
     * „Save“ klicken und auf Rückmeldung warten (nur noch für Tests – die App speichert nie selbst,
     * sondern wartet per watchSave auf den Klick des Nutzers). OSDP meldet per Toast:
     *   Erfolg: „Item Added!“ (und leert das Formular)
     *   Fehler: „… must not be empty“, „Set tags before saving“, „Article date is not allowed …“,
     *           „Duplicate, URL already in the database!“, „Not logged in!“
     */
    async save({ timeoutMs = 25000 } = {}) {
      const btn = findButton(topBar(), SAVE_BUTTON);
      if (!btn) return { ok: false, error: 'Button „Save“ nicht gefunden' };
      if (btn.disabled) return { ok: false, error: 'Button „Save“ ist deaktiviert (Duplikat oder laufender Vorgang?)' };
      const urlBefore = location.href;
      // Formular → Store läuft über valueChanges mit 250 ms Debounce: vor dem Klick kurz warten
      await sleep(600);
      const before = toasts().length;
      btn.click();
      const start = Date.now();
      let spinnerSeen = false;
      let seen = [];
      await sleep(300);
      while (Date.now() - start < timeoutMs) {
        if (spinnerVisible()) spinnerSeen = true;
        const now = toasts();
        if (now.length > before || now.some((t) => /Item Added|Item Updated|Duplicate|Error/i.test(`${t.title} ${t.message}`))) seen = now;
        const sb = snackbarText();
        if (sb) seen.push({ kind: 'info', title: 'snackbar', message: sb });
        const sourceNow = document.querySelector('input[formcontrolname="article_source"]')?.value || '';
        const done = seen.length > 0 || location.href !== urlBefore || (spinnerSeen && !spinnerVisible() && !sourceNow);
        if (done) break;
        await sleep(250);
      }
      await sleep(300);
      const all = seen.length ? seen : toasts();
      const success = all.some((t) => /Item Added|Item Updated/i.test(`${t.title} ${t.message}`));
      const duplicate = all.some((t) => /duplicate/i.test(t.message));
      const errors = all.filter((t) => t.kind === 'error').map((t) => t.message);
      return {
        ok: true,
        success,
        duplicate,
        errors,
        toasts: all,
        spinnerSeen,
        urlAfter: location.href,
        sourceAfter: document.querySelector('input[formcontrolname="article_source"]')?.value || '',
        errorVisible: [...document.querySelectorAll('mat-error, .mat-mdc-form-field-error')].map(text).filter(Boolean)
      };
    }
  };

  globalThis.__osdpHelper = Object.assign(globalThis.__osdpHelper || {}, {
    run: async (step, data) => {
      if (!steps[step]) throw new Error(`Unbekannter Schritt: ${step}`);
      return steps[step](data || {});
    }
  });
})();
