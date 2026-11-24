// Service Worker der Extension.
// Aufgaben: Klick auf das Icon → Helper-Dock im OSDP-Tab ein-/ausklappen (ohne OSDP-Tab: OSDP
// öffnen), Defaults anlegen, optionaler Zeitplan (Mo–Fr zu fester Uhrzeit) für Scan + Relevanzprüfung.
//
// Die App läuft nur noch im Dock (iframe in der OSDP-Seite, src/content/osdp-dock.js); es gibt keinen
// eigenen App-Tab mehr. Zeitplan: Ein offener OSDP-Tab bekommt per chrome.tabs.sendMessage die
// Aktion 'autorun' (das Dock reicht sie an die App weiter, kein Neuladen). Ohne OSDP-Tab wird OSDP
// geöffnet und die Aktion so lange erneut geschickt, bis das Dock sie annimmt (es hebt sie auf, bis
// die App bereit ist). Ein laufender Durchlauf wird vom Autorun nicht unterbrochen (prüft die App).

import { DEFAULT_SETTINGS } from './lib/settings.js';

const ALARM = 'osdp-autorun';
export const AUTORUN_MESSAGE = 'osdp-helper-autorun';
const DOCK_MESSAGE = 'osdp-helper-panel';

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
export function patternToRegex(pattern) {
  const p = String(pattern || '').trim() || DEFAULT_SETTINGS.osdpUrlPattern;
  return new RegExp('^' + p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'));
}

/** Basis-Adresse aus dem URL-Muster (Teil vor dem ersten '*'), z. B. https://osdp.zentdok.at/ */
export function osdpBaseUrl(pattern) {
  const p = String(pattern || '').trim() || DEFAULT_SETTINGS.osdpUrlPattern;
  const base = p.split('*')[0];
  return /^https?:\/\/[^/]+/.test(base) ? base : DEFAULT_SETTINGS.osdpUrlPattern.split('*')[0];
}

async function osdpPattern() {
  const stored = await chrome.storage.local.get('settings');
  return stored.settings?.osdpUrlPattern || DEFAULT_SETTINGS.osdpUrlPattern;
}

async function findOsdpTabs(pattern) {
  const re = patternToRegex(pattern);
  const tabs = await chrome.tabs.query({});
  return tabs.filter((t) => t.url && re.test(t.url));
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
  if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
}

// Klick auf das Extension-Symbol: im OSDP-Tab das Dock umschalten; sonst einen OSDP-Tab fokussieren
// (und das Dock öffnen) oder OSDP neu öffnen.
chrome.action.onClicked.addListener(async (tab) => {
  const pattern = await osdpPattern();
  const re = patternToRegex(pattern);
  if (tab?.id && tab.url && re.test(tab.url)) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: DOCK_MESSAGE, action: 'toggle' });
      return;
    } catch {
      /* Seite lädt noch – unten neu laden */
    }
    await chrome.tabs.reload(tab.id).catch(() => {});
    return;
  }
  const [existing] = await findOsdpTabs(pattern);
  if (existing) {
    await focusTab(existing);
    await chrome.tabs.sendMessage(existing.id, { type: DOCK_MESSAGE, action: 'open' }).catch(() => {});
    return;
  }
  await chrome.tabs.create({ url: osdpBaseUrl(pattern) + '#/news', active: true });
});

// Nachrichten aus dem Dock/der App: eigenen Tab erfragen (eingebetteter Modus)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'osdp-helper-whoami') {
    sendResponse({ tabId: sender.tab?.id ?? null, frameId: sender.frameId ?? null, url: sender.tab?.url || '' });
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

/** 'autorun' an das Dock im Tab schicken; solange die Seite noch lädt (kein Empfänger), bis zu 90 s wiederholen. */
async function deliverAutorun(tabId, { attempts = 90, intervalMs = 1000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, { type: DOCK_MESSAGE, action: 'autorun' });
      if (r?.ok) return true;
    } catch {
      /* Content-Script noch nicht da */
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  console.warn('Zeitplan: OSDP-Tab hat die Autorun-Nachricht nicht angenommen');
  return false;
}

/**
 * Zeitplan-Start: offenen OSDP-Tab benachrichtigen (das Dock reicht 'autorun' an die App weiter, kein
 * Neuladen); ohne OSDP-Tab OSDP öffnen (ein aus dem Speicher entladener Tab wird neu geladen) und die
 * Nachricht zustellen, sobald das Dock antwortet.
 * @returns {{ tab: chrome.tabs.Tab, via: 'message'|'open'|'reload', delivered: boolean }}
 */
export async function triggerAutorun() {
  const pattern = await osdpPattern();
  const [tab] = await findOsdpTabs(pattern);
  if (!tab) {
    const created = await chrome.tabs.create({ url: osdpBaseUrl(pattern) + '#/news', active: true });
    return { tab: created, via: 'open', delivered: await deliverAutorun(created.id) };
  }
  if (tab.discarded) {
    await chrome.tabs.update(tab.id, { url: osdpBaseUrl(pattern) + '#/news', active: true });
    return { tab, via: 'reload', delivered: await deliverAutorun(tab.id) };
  }
  await focusTab(tab);
  return { tab, via: 'message', delivered: await deliverAutorun(tab.id, { attempts: 30 }) };
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
