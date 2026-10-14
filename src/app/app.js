// Einstieg der App-Seite „OSDP News Helper“ (v0.6): eine Seite mit linker Navigation und den
// Ansichten Lauf, Quellen, Verlauf, Regeln, Einstellungen (src/app/views/*.js).
//
// app.js hält den gemeinsamen Zustand (ctx) und reicht ihn an die Ansichten weiter; die Ansichten
// sprechen sich über ctx.views.<name> an (z. B. öffnet der Verlauf den Regel-Dialog). Der Hash
// spiegelt die Ansicht (#lauf, #quellen, #verlauf, #regeln, #einstellungen). Gespeichert wird in
// OSDP nie automatisch – siehe views/run.js.

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
    }
    if (changes.rules) {
      ctx.rules = changes.rules.newValue || [];
      ctx.views.rules?.render();
    }
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
  try {
    const m = await migrateSources(ctx.settings);
    migrated = m.migrated;
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
  showView(viewFromHash(location.hash) || 'run');
  ctx.setAppStatus('Bereit', 'off');
  if (migrated) toastOk('Quellen übernommen', `${ctx.sources.length} Quellen aus der alten Textliste in die Quellen-Verwaltung übernommen.`);

  // Für Tests und Fehlersuche in der Konsole erreichbar
  globalThis.__app = { ctx };

  const params = new URLSearchParams(location.search);
  if (params.get('autorun') === '1') ctx.views.run.startAutorun();
}

init().catch((e) => {
  console.error(e);
  toastError('Start fehlgeschlagen', e?.message || String(e));
});
