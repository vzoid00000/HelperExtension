// Service Worker der Extension.
// Aufgaben: App-Seite beim Klick auf das Icon öffnen (oder den offenen Tab fokussieren),
// Defaults anlegen, optionalen Zeitplan (Mo–Fr zu fester Uhrzeit) für Scan + Relevanzprüfung.
//
// Zeitplan: Ein offener App-Tab wird NICHT neu geladen (ein laufender Durchlauf bliebe sonst
// mitsamt Freigabe-Leiste im OSDP-Tab liegen), sondern bekommt per chrome.tabs.sendMessage die
// Nachricht { type: 'osdp-helper-autorun' }; die App startet dann Scan + Relevanzprüfung, sofern
// kein Lauf aktiv ist. Nur ohne App-Tab wird src/app/app.html?autorun=1 geöffnet.

import { DEFAULT_SETTINGS } from './lib/settings.js';

const ALARM = 'osdp-autorun';
const APP_PATH = 'src/app/app.html';
export const AUTORUN_MESSAGE = 'osdp-helper-autorun';
const AUTORUN_QUERY = '?autorun=1';

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get('settings');
  const merged = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  await chrome.storage.local.set({ settings: merged });
  await scheduleAutoRun(merged.autoRunTime);
});

chrome.runtime.onStartup.addListener(async () => {
  const stored = await chrome.storage.local.get('settings');
  await scheduleAutoRun((stored.settings || {}).autoRunTime);
});

/** URL-Muster (z. B. https://osdp.zentdok.at/*) → RegExp. */
function patternToRegex(pattern) {
  const p = String(pattern || '').trim() || 'https://osdp.zentdok.at/*';
  return new RegExp('^' + p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'));
}

// Klick auf das Extension-Symbol: im OSDP-Tab das Panel umschalten, sonst die App als Tab öffnen.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    const stored = await chrome.storage.local.get('settings');
    const pattern = stored.settings?.osdpUrlPattern || DEFAULT_SETTINGS.osdpUrlPattern;
    if (tab?.id && tab.url && patternToRegex(pattern).test(tab.url)) {
      await chrome.tabs.sendMessage(tab.id, { type: 'osdp-helper-panel', action: 'toggle' });
      return;
    }
  } catch {
    /* kein Panel in diesem Tab (Seite noch nicht geladen) → App als Tab */
  }
  openApp();
});

// Nachrichten aus Panel/App: eigenen Tab erfragen (eingebetteter Modus), App als Tab öffnen
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'osdp-helper-whoami') {
    sendResponse({ tabId: sender.tab?.id ?? null, frameId: sender.frameId ?? null, url: sender.tab?.url || '' });
    return;
  }
  if (msg.type === 'osdp-helper-open-app') {
    openApp().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    scheduleAutoRun((changes.settings.newValue || {}).autoRunTime);
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  const stored = await chrome.storage.local.get('settings');
  try {
    await triggerAutorun();
  } catch (e) {
    console.error('Zeitplan: Autorun konnte nicht gestartet werden', e);
  }
  await scheduleAutoRun((stored.settings || {}).autoRunTime);
});

function appUrl() {
  return chrome.runtime.getURL(APP_PATH);
}

async function findAppTab() {
  const tabs = await chrome.tabs.query({ url: `${appUrl()}*` });
  return tabs[0] || null;
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
  if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
}

/** App-Tab öffnen; existiert schon einer, diesen fokussieren (ohne Neuladen). */
export async function openApp() {
  const tab = await findAppTab();
  if (tab) {
    await focusTab(tab);
    return tab;
  }
  return chrome.tabs.create({ url: appUrl(), active: true });
}

/**
 * Zeitplan-Start: offenen App-Tab benachrichtigen (kein Neuladen); ohne App-Tab die Seite mit
 * ?autorun=1 öffnen. Ein aus dem Speicher entladener Tab (discarded) hat keinen Empfänger und wird
 * mit der Query neu geladen – dort läuft nichts, das verloren gehen könnte.
 * @returns {{ tab: chrome.tabs.Tab, via: 'message'|'open'|'reload' }}
 */
export async function triggerAutorun() {
  const tab = await findAppTab();
  if (!tab) {
    const created = await chrome.tabs.create({ url: appUrl() + AUTORUN_QUERY, active: true });
    return { tab: created, via: 'open' };
  }
  if (tab.discarded) {
    await chrome.tabs.update(tab.id, { url: appUrl() + AUTORUN_QUERY, active: true });
    return { tab, via: 'reload' };
  }
  await focusTab(tab);
  try {
    await chrome.tabs.sendMessage(tab.id, { type: AUTORUN_MESSAGE });
  } catch (e) {
    // Kein Empfänger (Seite lädt gerade oder ist nicht die App): nicht neu laden, nur melden
    console.warn('Zeitplan: App-Tab hat die Autorun-Nachricht nicht angenommen', e?.message || e);
  }
  return { tab, via: 'message' };
}

/** Nächster Werktag (Mo–Fr) zur angegebenen Uhrzeit "HH:MM", lokale Zeit. */
export function nextWeekdayRun(timeStr, now = new Date()) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((timeStr || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

async function scheduleAutoRun(timeStr) {
  await chrome.alarms.clear(ALARM);
  const when = nextWeekdayRun(timeStr);
  if (!when) return;
  await chrome.alarms.create(ALARM, { when: when.getTime() });
}
