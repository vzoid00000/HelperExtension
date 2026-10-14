// Einstieg der App-Seite „OSDP News Helper“ (v0.6): eine Seite mit linker Navigation und den
// Ansichten Lauf, Quellen, Verlauf, Regeln, Einstellungen (src/app/views/*.js).
//
// app.js hält den gemeinsamen Zustand (ctx) und reicht ihn an die Ansichten weiter; die Ansichten
// sprechen sich über ctx.views.<name> an (z. B. öffnet der Verlauf den Regel-Dialog). Der Hash
// spiegelt die Ansicht (#lauf, #quellen, #verlauf, #regeln, #einstellungen). Gespeichert wird in
// OSDP nie automatisch – siehe views/run.js.
//
// Zeitplan: Der Hintergrund-Alarm schickt einem offenen App-Tab die Nachricht
// { type: 'osdp-helper-autorun' } (kein Neuladen); nur ohne App-Tab wird app.html?autorun=1 geöffnet.
// Der Query-Parameter wird nach dem Start sofort entfernt, damit ein Neuladen (F5) keinen neuen
// Scan auslöst. Ein laufender Durchlauf wird vom Autorun nicht unterbrochen.

import { loadSettings, llmMissing, DEFAULT_SETTINGS } from '../lib/settings.js';
import { migrateSources, getSources } from '../lib/sources-store.js';
import { loadHistory } from '../lib/history.js';
import { loadRules } from '../lib/rules.js';
import { TagCatalog } from '../lib/tag-catalog.js';
import { $, toast, toastError, toastOk, setActive } from './ui.js';
import * as runView from './views/run.js';
import * as sourcesView from './views/sources.js';
import * as historyView from './views/history.js';
import * as rulesView from './views/rules.js';
import * as settingsView from './views/settings.js';

const VIEW_HASH = { run: 'lauf', sources: 'quellen', history: 'verlauf', rules: 'regeln', settings: 'einstellungen' };
const VIEWS = Object.keys(VIEW_HASH);
// Nachricht des Hintergrund-Alarms an einen offenen App-Tab (siehe src/background.js)
export const AUTORUN_MESSAGE = 'osdp-helper-autorun';

/** Gemeinsamer Zustand aller Ansichten. */
export const ctx = {
  version: '',
  settings: null,
  sources: [],
  history: [],
  rules: [],
  catalog: null,
  state: { items: {}, order: [], sources: {}, lastScan: null },
  processed: {},
  views: {},
  currentView: 'run',

  async getCatalog() {
    if (!ctx.catalog) ctx.catalog = await TagCatalog.load();
    return ctx.catalog;
  },

  /** Einzelne Einstellungen ändern, ohne den Rest zu überschreiben. */
  async patchSettings(patch) {
    const stored = (await chrome.storage.local.get('settings')).settings || {};
    const next = { ...stored, ...patch };
    await chrome.storage.local.set({ settings: next });
    ctx.settings = { ...DEFAULT_SETTINGS, ...next };
    return ctx.settings;
  },

  async reloadSources() {
    ctx.settings = await loadSettings();
    ctx.sources = getSources(ctx.settings);
    return ctx.sources;
  },
  async reloadHistory() {
    ctx.history = await loadHistory();
    return ctx.history;
  },
  async reloadRules() {
    ctx.rules = await loadRules();
    return ctx.rules;
  },
  /** Alles neu laden (nach Import) und jede Ansicht neu zeichnen. */
  async reloadAll() {
    ctx.settings = await loadSettings();
    ctx.sources = getSources(ctx.settings);
    ctx.history = await loadHistory();
    ctx.rules = await loadRules();
    const stored = await chrome.storage.local.get(['autoState', 'processed']);
    if (stored.autoState) ctx.state = { ...ctx.state, ...stored.autoState };
    ctx.processed = stored.processed || {};
    // Unterbrochene Läufe zurücksetzen, Altes entfernen, Verlaufs-Abgleich auffrischen
    ctx.views.run?.onStateLoaded?.();
    renderAll();
  },

  /** Statuszeile unten in der Navigation. kind: '' (ok) | busy | warn | off */
  setAppStatus(text, kind = '') {
    $('appStatus').textContent = text || 'Bereit';
    $('appStatusDot').className = `status-dot${kind ? ' status-dot-' + kind : ''}`;
  },

  showView,
  log: (msg, kind = '') => ctx.views.run?.log(msg, kind),
  llmMissing: () => llmMissing(ctx.settings || {})
};

function renderAll() {
  for (const v of Object.values(ctx.views)) if (typeof v.render === 'function') v.render();
}

// ---------------------------------------------------------- Navigation ----

function viewFromHash(hash) {
  const key = String(hash || '').replace(/^#\/?/, '').toLowerCase();
  if (!key) return null;
  for (const [view, de] of Object.entries(VIEW_HASH)) if (key === de || key === view) return view;
  return null;
}

function showView(name) {
  const view = VIEWS.includes(name) ? name : 'run';
  ctx.currentView = view;
  for (const s of document.querySelectorAll('section.view')) s.hidden = s.id !== `view-${view}`;
  setActive(document.querySelector('.nav'), 'view', view);
  const wanted = `#${VIEW_HASH[view]}`;
  if (location.hash !== wanted) history.replaceState(null, '', wanted);
  window.scrollTo(0, 0);
  const api = ctx.views[view];
  if (api && typeof api.onShow === 'function') api.onShow();
}

function bindNavigation() {
  for (const a of document.querySelectorAll('.nav-link[data-view]')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showView(a.dataset.view);
    });
  }
  window.addEventListener('hashchange', () => {
    const v = viewFromHash(location.hash);
    if (v && v !== ctx.currentView) showView(v);
  });
}

// ------------------------------------------------------------- Storage ----

function bindStorage() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) {
      ctx.settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
      ctx.sources = getSources(ctx.settings);
      ctx.views.run?.onSettingsChanged();
      ctx.views.sources?.render();
      ctx.views.settings?.onSettingsChanged();
    }
    if (changes.history) {
      ctx.history = changes.history.newValue || [];
      ctx.views.history?.render();
      // Meldungen „bereits eingetragen“ neu bestimmen (Verlauf gelöscht/ergänzt)
      ctx.views.run?.onHistoryChanged?.();
    }
    if (changes.rules) {
      ctx.rules = changes.rules.newValue || [];
      ctx.views.rules?.render();
    }
  });
}

// ------------------------------------------------------------- Autorun ----

/** Zeitplan-Start (Scan + Relevanzprüfung) – nur, wenn gerade kein Lauf aktiv ist. */
function startAutorunIfIdle() {
  const run = ctx.views.run;
  if (!run) return;
  if (run.isRunning()) {
    run.log('Zeitplan: Es läuft bereits ein Durchlauf – der automatische Start wurde übersprungen.', 'warn');
    return;
  }
  run.startAutorun();
}

function bindMessages() {
  if (!chrome.runtime?.onMessage) return;
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== AUTORUN_MESSAGE) return;
    startAutorunIfIdle();
  });
}

// ---------------------------------------------------------------- Init ----

async function init() {
  if (!globalThis.chrome?.storage?.local) {
    // Seite wurde außerhalb der Extension geöffnet (z. B. file://): nur Gerüst anzeigen
    console.warn('OSDP News Helper: chrome.storage nicht verfügbar – die Seite läuft nur als Extension.');
    toast({ title: 'Nur als Extension lauffähig', desc: 'Diese Seite braucht die Chrome-Erweiterung (chrome://extensions → Entpackte Erweiterung laden).', kind: 'warn', timeoutMs: 60000 });
    return;
  }
  try {
    ctx.version = chrome.runtime.getManifest?.().version || '';
  } catch {
    ctx.version = '';
  }
  if (ctx.version) $('appVersion').textContent = `v${ctx.version}`;

  // Dialoge aus den (versteckten) Ansichten herauslösen, damit sie aus jeder Ansicht geöffnet
  // werden können (ein <dialog> unter einem hidden-Element wird nicht dargestellt).
  for (const d of document.querySelectorAll('dialog.dialog')) document.body.append(d);

  ctx.settings = await loadSettings();
  let migrated = false;
  let migrationDropped = 0;
  try {
    const m = await migrateSources(ctx.settings);
    migrated = m.migrated;
    migrationDropped = Number(m.dropped) || 0;
    ctx.sources = m.sources;
  } catch (e) {
    console.error(e);
    ctx.sources = getSources(ctx.settings);
  }
  const stored = await chrome.storage.local.get(['autoState', 'processed']);
  if (stored.autoState) ctx.state = { ...ctx.state, ...stored.autoState };
  ctx.processed = stored.processed || {};
  ctx.history = await loadHistory();
  ctx.rules = await loadRules();

  ctx.views.run = await runView.init(ctx);
  ctx.views.sources = await sourcesView.init(ctx);
  ctx.views.history = await historyView.init(ctx);
  ctx.views.rules = await rulesView.init(ctx);
  ctx.views.settings = await settingsView.init(ctx);

  bindNavigation();
  bindStorage();
  bindMessages();
  showView(viewFromHash(location.hash) || 'run');
  ctx.setAppStatus('Bereit', 'off');
  if (migrated) toastOk('Quellen übernommen', `${ctx.sources.length} Quellen aus der alten Textliste in die Quellen-Verwaltung übernommen.${migrationDropped ? ` ${migrationDropped} ungültige Zeile(n) wurden verworfen – bitte in der Quellen-Ansicht prüfen.` : ''}`);

  // Für Tests und Fehlersuche in der Konsole erreichbar
  globalThis.__app = { ctx };

  // ?autorun=1 (Zeitplan ohne offenen App-Tab): Parameter sofort aus der URL entfernen, damit ein
  // Neuladen (F5, Sitzungswiederherstellung) keinen weiteren Scan samt Relevanzprüfung auslöst
  const autorun = new URLSearchParams(location.search).get('autorun') === '1';
  if (location.search) window.history.replaceState(null, '', location.pathname + location.hash);
  if (autorun) startAutorunIfIdle();
}

init().catch((e) => {
  console.error(e);
  toastError('Start fehlgeschlagen', e?.message || String(e));
});
