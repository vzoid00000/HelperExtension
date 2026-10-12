// Datumslogik: "letzter Freitag"-Regel, Parsen und Formatieren.
//
// Regel laut Arbeitsanweisung: Es dürfen nur News verwendet werden, die frühestens
// vom letzten Freitag stammen. "Letzter Freitag" = der jüngste Freitag VOR heute.
//   Mo → Fr vor 3 Tagen, Di → vor 4, Mi → vor 5, Do → vor 6, Fr → vor 7 Tagen (Vorwoche),
//   Sa → gestern, So → vorgestern.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Datum auf lokale Mitternacht kürzen. */
export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Jüngster Freitag strikt vor `today` (lokale Zeit). */
export function lastFriday(today = new Date()) {
  const d = startOfDay(today);
  let back = (d.getDay() - 5 + 7) % 7; // Tage seit dem letzten Freitag
  if (back === 0) back = 7;            // heute ist Freitag → Vorwoche
  return new Date(d.getTime() - back * DAY_MS);
}

/**
 * Prüft, ob ein Artikeldatum erlaubt ist.
 * @returns {{status: 'ok'|'too_old'|'future'|'unknown', earliest: Date}}
 */
export function checkArticleDate(articleDate, today = new Date()) {
  const earliest = lastFriday(today);
  if (!(articleDate instanceof Date) || isNaN(articleDate.getTime())) {
    return { status: 'unknown', earliest };
  }
  const day = startOfDay(articleDate);
  const todayDay = startOfDay(today);
  if (day.getTime() < earliest.getTime()) return { status: 'too_old', earliest };
  if (day.getTime() > todayDay.getTime() + DAY_MS) return { status: 'future', earliest };
  return { status: 'ok', earliest };
}

const MONTHS_EN = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
};
const MONTHS_DE = {
  jan: 0, jänner: 0, januar: 0, feb: 1, februar: 1, mär: 2, märz: 2, apr: 3, april: 3, mai: 4,
  jun: 5, juni: 5, jul: 6, juli: 6, aug: 7, august: 7, sep: 8, september: 8,
  okt: 9, oktober: 9, nov: 10, november: 10, dez: 11, dezember: 11
};

/**
 * Versucht, aus einem beliebigen String ein Datum zu lesen.
 * Unterstützt ISO 8601, "October 10, 2026", "10 Oct 2026", "10.10.2026", "2026/10/10",
 * sowie relative Angaben wie "3 hours ago" / "vor 2 Stunden".
 * @returns {Date|null}
 */
export function parseDate(input, now = new Date()) {
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;

  // ISO 8601 (mit oder ohne Zeit/Zone) – den nativen Parser nehmen.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }

  // Relative Angaben.
  const rel = s.match(/(\d+)\s*(minute|minutes|min|hour|hours|hr|hrs|day|days|minuten|stunde|stunden|tag|tagen)\b/i);
  if (rel && /ago|vor/i.test(s)) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2].toLowerCase();
    let ms = 0;
    if (unit.startsWith('min')) ms = n * 60 * 1000;
    else if (unit.startsWith('h') || unit.startsWith('stunde')) ms = n * 60 * 60 * 1000;
    else ms = n * DAY_MS;
    return new Date(now.getTime() - ms);
  }
  if (/^(today|heute)\b/i.test(s)) return startOfDay(now);
  if (/^(yesterday|gestern)\b/i.test(s)) return new Date(startOfDay(now).getTime() - DAY_MS);

  // dd.MM.yyyy oder dd/MM/yyyy
  let m = s.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    if (!isNaN(d.getTime())) return d;
  }

  // yyyy/MM/dd
  m = s.match(/\b(\d{4})\/(\d{1,2})\/(\d{1,2})\b/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (!isNaN(d.getTime())) return d;
  }

  // "October 10, 2026" / "Oct. 10 2026"
  m = s.match(/\b([A-Za-zäöü]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m) {
    const month = MONTHS_EN[m[1].toLowerCase()] ?? MONTHS_DE[m[1].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(+m[3], month, +m[2]);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // "10 October 2026" / "10. Oktober 2026"
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\.?\s+([A-Za-zäöü]{3,9})\.?,?\s+(\d{4})\b/);
  if (m) {
    const month = MONTHS_EN[m[2].toLowerCase()] ?? MONTHS_DE[m[2].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(+m[3], month, +m[1]);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Letzter Versuch: nativer Parser.
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Formatiert ein Datum nach Muster, z. B. 'dd.MM.yyyy' oder 'yyyy-MM-dd'. */
export function formatDate(date, pattern = 'dd.MM.yyyy') {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  return pattern
    .replace(/yyyy/g, String(date.getFullYear()))
    .replace(/yy/g, String(date.getFullYear()).slice(-2))
    .replace(/MM/g, pad(date.getMonth() + 1))
    .replace(/dd/g, pad(date.getDate()));
}

/** ISO-Datum (yyyy-MM-dd) in lokaler Zeit. */
export function toIsoDate(date) {
  return formatDate(date, 'yyyy-MM-dd');
}

/** Anzeige im Panel: "Fr, 10.10.2026" */
export function formatDisplay(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '–';
  const weekday = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][date.getDay()];
  return `${weekday}, ${formatDate(date, 'dd.MM.yyyy')}`;
}
