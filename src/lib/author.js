// Autor-Normalisierung: Nur natürliche Personen zählen als Autor.
// Redaktionen, Agenturen, "Staff" usw. werden verworfen → "Autor ungenannt".

const NON_PERSON_PATTERNS = [
  /\bstaff\b/i, /\bnewsroom\b/i, /\beditor(ial)?s?\b/i, /\beditorial team\b/i, /\bteam\b/i,
  /\bdesk\b/i, /\bnews\b/i, /\bagenc(y|ies)\b/i, /\breuters\b/i, /\bassociated press\b/i,
  /\bafp\b/i, /\bdpa\b/i, /\bapa\b/i, /\bbbc\b/i, /\bcnn\b/i, /\bal jazeera\b/i, /\bbloomberg\b/i,
  /\bwire\b/i, /\bservice\b/i, /\bcontributor(s)?\b/i, /\bguest\b/i, /\badmin(istrator)?\b/i,
  /\bredaktion\b/i, /\bred\.\b/i, /\bpress\b/i, /\bmedia\b/i, /\bnetwork\b/i, /\bgroup\b/i,
  /\binc\.?\b/i, /\bltd\.?\b/i, /\bgmbh\b/i, /\bllc\b/i, /\bcorp\.?\b/i, /\bcompany\b/i,
  /\bresearch\b/i, /\blabs?\b/i, /\bsecurity\b/i, /\bintelligence\b/i, /\bunit\b/i, /\bteam\b/i,
  /\bthe\s+\w+\s+(times|post|journal|herald|tribune|record|register)\b/i,
  /^(by|von)\s*$/i, /^\s*$/, /^(ap|afp|dpa|apa|reuters)$/i
];

/**
 * Zerlegt einen Autor-String in einzelne Namen und filtert Nicht-Personen heraus.
 * @returns {{names: string[], isPerson: boolean, display: string}}
 */
export function normalizeAuthor(raw, siteName = '') {
  if (!raw || typeof raw !== 'string') return { names: [], isPerson: false, display: '' };

  let s = raw.replace(/\s+/g, ' ').trim();
  s = s.replace(/^(by|von|from)\s+/i, '');
  s = s.replace(/\s*[|•·–—]\s*(reporter|correspondent|writer|journalist).*$/i, '');
  // Ortsangaben wie "Jane Doe in London" / "John Smith, Washington" entfernen
  s = s.replace(/\s+in\s+[A-ZÄÖÜ][\p{L}\s.-]*$/u, '');

  // Mehrere Autoren trennen.
  const parts = s
    .split(/\s*(?:,|;|&| and | und |\/|\|)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const names = parts.filter((p) => looksLikePerson(p, siteName));
  return {
    names,
    isPerson: names.length > 0,
    display: names.join(', ')
  };
}

function looksLikePerson(name, siteName) {
  if (!name) return false;
  if (name.length > 60) return false;
  if (siteName && name.toLowerCase() === siteName.toLowerCase()) return false;
  if (/https?:\/\//i.test(name) || /@/.test(name)) return false;
  for (const re of NON_PERSON_PATTERNS) {
    if (re.test(name)) return false;
  }
  // Ein Personenname besteht meist aus 2–4 Wörtern, die mit Großbuchstaben beginnen.
  const words = name.split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  const capitalized = words.filter((w) => /^[A-ZÄÖÜ][\p{L}'’.-]*$/u.test(w) || /^(van|von|de|der|den|da|di|le|la|bin|al|el)$/i.test(w));
  return capitalized.length >= Math.ceil(words.length * 0.6);
}
