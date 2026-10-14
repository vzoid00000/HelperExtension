// Service Worker der Extension.
// Aufgaben: App-Seite beim Klick auf das Icon öffnen (oder den offenen Tab fokussieren),
// Defaults anlegen, optionalen Zeitplan (Mo–Fr zu fester Uhrzeit) für Scan + Relevanzprüfung.

import { DEFAULT_SETTINGS } from './lib/settings.js';

const ALARM = 'osdp-autorun';
const APP_PATH = 'src/app/app.html';

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

chrome.action.onClicked.addListener(() => openApp());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    scheduleAutoRun((changes.settings.newValue || {}).autoRunTime);
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  const stored = await chrome.storage.local.get('settings');
  await openApp('?autorun=1');
  await scheduleAutoRun((stored.settings || {}).autoRunTime);
});

/** App-Tab öffnen; existiert schon einer, diesen fokussieren (mit Query ggf. neu laden). */
export async function openApp(query = '') {
  const url = chrome.runtime.getURL(APP_PATH);
  const tabs = await chrome.tabs.query({ url: `${url}*` });
  if (tabs.length) {
    const tab = tabs[0];
    if (query) await chrome.tabs.update(tab.id, { url: url + query, active: true });
    else await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    return tab;
  }
  return chrome.tabs.create({ url: url + query, active: true });
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
