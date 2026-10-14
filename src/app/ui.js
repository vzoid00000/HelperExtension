// Kleine UI-Helfer für die App-Seite: DOM-Erzeugung, Badges/Chips, Toasts, Status-Zeilen,
// Dialoge (Enter-Submit abfangen), Downloads und Formatierung. Keine Abhängigkeiten zu den
// Ansichten – wird von app.js und allen views/*.js genutzt. Klassen siehe docs/DESIGN.md.

import { formatDate } from '../lib/dates.js';

export const $ = (id) => document.getElementById(id);

/** Element mit Klasse und Textinhalt anlegen. */
export function el(tag, cls = '', text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

export function clear(node) {
  if (node) node.textContent = '';
  return node;
}

/** Symbol aus dem Sprite am Seitenanfang (<symbol id="i-…">). */
export function svgIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

/** Icon-Knopf für Tabellenzeilen (data-action wird per Delegation ausgewertet). */
export function iconButton(action, title, icon, { destructive = false, cls = 'btn btn-ghost btn-xs btn-icon' } = {}) {
  const b = el('button', cls + (destructive ? ' btn-destructive' : ''));
  b.type = 'button';
  b.dataset.action = action;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.append(svgIcon(icon));
  return b;
}

// ------------------------------------------------------------- Badges ----

export const AREA_LABEL = { cyber: 'Cyber', krimisi: 'KriMiSi', both: 'Beide', none: '–' };

export function badge(text, variant = 'secondary', { sm = false, title = '' } = {}) {
  const b = el('span', `badge badge-${variant}${sm ? ' badge-sm' : ''}`, text);
  if (title) b.title = title;
  return b;
}

/** Bereichs-Badge: cyber | krimisi | both | none | unbekannt. */
export function areaBadge(area, { sm = false } = {}) {
  if (area === 'cyber') return badge('Cyber', 'cyber', { sm });
  if (area === 'krimisi') return badge('KriMiSi', 'krimisi', { sm });
  if (area === 'both') return badge('Beide', 'secondary', { sm });
  if (area === 'none') return badge('–', 'muted', { sm, title: 'nicht relevant' });
  return badge('?', 'muted', { sm, title: 'noch nicht geprüft' });
}

/** Struktur-Badge: Cyber | KriMiSi | InnoTech. */
export function structureBadge(structure, { sm = false } = {}) {
  if (structure === 'Cyber') return badge('Cyber', 'cyber', { sm });
  if (structure === 'KriMiSi') return badge('KriMiSi', 'krimisi', { sm });
  if (structure === 'InnoTech') return badge('InnoTech', 'innotech', { sm });
  return badge(structure || '–', 'muted', { sm });
}

export function wbBadge(wb, { sm = false } = {}) {
  return wb ? badge(wb, 'wb', { sm }) : null;
}

/** Tag-Chip; title = vollständiger Pfad. */
export function chip(text, { cls = '', title = '' } = {}) {
  const c = el('span', `chip${cls ? ' ' + cls : ''}`);
  c.append(el('span', '', text));
  if (title) c.title = title;
  return c;
}

export const SEP_ARROW = ' → ';
export const leafName = (path) => String(path || '').split(SEP_ARROW).slice(-1)[0];

// -------------------------------------------------------------- Toasts ----

const TOAST_TIMEOUT = { '': 5000, success: 5000, warn: 8000, error: 12000 };

/**
 * Toast unten rechts. kind: '' | 'success' | 'warn' | 'error'. Liefert das Element.
 */
export function toast({ title, desc = '', kind = '', timeoutMs } = {}) {
  const stack = $('toasts');
  if (!stack) return null;
  const t = el('div', `toast${kind ? ' toast-' + kind : ''}`);
  t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  t.append(el('div', 'toast-title', title || ''));
  if (desc) t.append(el('div', 'toast-desc', desc));
  const close = el('button', 'btn btn-ghost btn-xs btn-icon toast-close');
  close.type = 'button';
  close.title = 'Schließen';
  close.append(svgIcon('x'));
  t.append(close);
  let timer = null;
  const remove = () => {
    clearTimeout(timer);
    if (!t.isConnected) return;
    t.classList.add('toast-leaving');
    setTimeout(() => t.remove(), 160);
  };
  close.addEventListener('click', remove);
  timer = setTimeout(remove, timeoutMs ?? TOAST_TIMEOUT[kind] ?? 5000);
  stack.append(t);
  // Höchstens fünf Toasts gleichzeitig
  while (stack.children.length > 5) stack.firstElementChild.remove();
  return t;
}
export const toastOk = (title, desc = '') => toast({ title, desc, kind: 'success' });
export const toastWarn = (title, desc = '') => toast({ title, desc, kind: 'warn' });
export const toastError = (title, desc = '') => toast({ title, desc, kind: 'error' });

// -------------------------------------------------------------- Status ----

/** Status-Zeile (div.status): leer = versteckt; kind: '' | ok | warn | err | busy. */
export function setStatusEl(node, msg, kind = '') {
  if (!node) return;
  node.hidden = !msg;
  node.className = `status${kind ? ' status-' + kind : ''}`;
  node.textContent = msg || '';
}

// ------------------------------------------------------------- Dialoge ----

/**
 * Dialog verdrahten: Enter in einem Eingabefeld löst sonst das <form method="dialog"> aus und
 * schließt den Dialog ohne Speichern – hier wird submit abgefangen und onSubmit aufgerufen.
 */
export function bindDialog(dialog, { onSubmit = null, onClose = null } = {}) {
  const form = dialog.querySelector('form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (onSubmit) onSubmit();
    });
  }
  if (onClose) dialog.addEventListener('close', () => onClose());
}

export function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

export function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

/** Alle .active in einer Segment-/Tab-Gruppe anhand eines data-Attributs setzen. */
export function setActive(container, dataKey, value) {
  for (const b of container.querySelectorAll(`[data-${dataKey}]`)) b.classList.toggle('active', b.dataset[dataKey] === value);
}

export function setInvalid(input, invalid) {
  if (invalid) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

// ----------------------------------------------------------- Downloads ----

/** Datei herunterladen (chrome.downloads, Fallback <a download>). */
export async function download(filename, content, type = 'application/octet-stream') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  try {
    if (globalThis.chrome?.downloads?.download) {
      await chrome.downloads.download({ url, filename, saveAs: false, conflictAction: 'uniquify' });
    } else {
      const a = el('a');
      a.href = url;
      a.download = filename;
      document.body.append(a);
      a.click();
      a.remove();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error(`Datei konnte nicht gelesen werden: ${file?.name || ''}`));
    r.readAsText(file);
  });
}

export async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

// -------------------------------------------------------- Formatierung ----

const pad = (n) => String(n).padStart(2, '0');

/** "20261013-0802" für Dateinamen. */
export function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function fmtTime(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  return isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDateTime(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  return isNaN(d.getTime()) ? '' : `${formatDate(d)} ${fmtTime(d)}`;
}

/** Kurzform für Tabellen: "heute 08:02", "gestern 08:03", sonst "12.10. 09:40". */
export function fmtRelative(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d.getTime())) return '–';
  const today = new Date();
  const dayStart = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((dayStart(today) - dayStart(d)) / 86400000);
  if (diffDays === 0) return `heute ${fmtTime(d)}`;
  if (diffDays === 1) return `gestern ${fmtTime(d)}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${fmtTime(d)}`;
}

/** ISO-Datum (yyyy-MM-dd) ohne Zeitzonenverschiebung als lokales Datum. */
export function isoToDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d.getTime()) ? null : d;
}

export function shortText(s, max = 80) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).replace(/\s\S*$/, '') + '…' : t;
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
