// Service Worker der Extension.
// Aufgaben: Side Panel beim Klick auf das Icon öffnen, Defaults anlegen,
// optionalen Zeitplan (Mo–Fr zu fester Uhrzeit) für die Automatik verwalten.

import { DEFAULT_SETTINGS } from './lib/settings.js';

const ALARM = 'osdp-autorun';

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  const stored = await chrome.storage.local.get('settings');
  const merged = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  await chrome.storage.local.set({ settings: merged });
  await scheduleAutoRun(merged.autoRunTime);
});

chrome.runtime.onStartup.addListener(async () => {
  const stored = await chrome.storage.local.get('settings');
  await scheduleAutoRun((stored.settings || {}).autoRunTime);
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    scheduleAutoRun((changes.settings.newValue || {}).autoRunTime);
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  const stored = await chrome.storage.local.get('settings');
  await chrome.tabs.create({ url: chrome.runtime.getURL('src/auto/auto.html?autorun=1'), active: true });
  await scheduleAutoRun((stored.settings || {}).autoRunTime);
});

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
