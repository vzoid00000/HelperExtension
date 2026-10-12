// Service Worker der Extension.
// Aufgaben: Side Panel beim Klick auf das Extension-Icon öffnen, Defaults anlegen.

import { DEFAULT_SETTINGS } from './lib/settings.js';

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Fehlende Einstellungen mit Defaults auffüllen (bestehende Werte bleiben erhalten).
  const stored = await chrome.storage.local.get('settings');
  const merged = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  await chrome.storage.local.set({ settings: merged });
});

// Beim Start des Service Workers ebenfalls sicherstellen (z. B. nach Chrome-Neustart).
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
