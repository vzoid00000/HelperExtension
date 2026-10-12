// Standard-Quellen (englischsprachige News-Seiten mit RSS-Feed bzw. Übersichtsseite).
// Die Liste kann in den Einstellungen ergänzt/geändert werden.
//
// Felder:
//   name      Anzeigename
//   url       Feed-URL (type 'rss') oder Übersichtsseite (type 'html')
//   category  Schwerpunkt der Quelle: 'cyber' | 'krimisi' | 'both' (nur Hinweis für den Klassifikator)
//   type      'rss' | 'html'
//   pattern   nur type 'html': RegEx (String) für Artikel-URLs
//   enabled   true/false

export const DEFAULT_SOURCES = [
  // --- Cyber
  { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/', category: 'cyber', type: 'rss', enabled: true },
  { name: 'The Record (Recorded Future)', url: 'https://therecord.media/feed', category: 'cyber', type: 'rss', enabled: true },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', category: 'cyber', type: 'rss', enabled: true },
  { name: 'SecurityWeek', url: 'https://www.securityweek.com/feed/', category: 'cyber', type: 'rss', enabled: true },
  { name: 'CyberScoop', url: 'https://cyberscoop.com/feed/', category: 'cyber', type: 'rss', enabled: true },
  { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml', category: 'cyber', type: 'rss', enabled: true },
  { name: 'Infosecurity Magazine', url: 'https://www.infosecurity-magazine.com/rss/news/', category: 'cyber', type: 'rss', enabled: true },
  { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', category: 'cyber', type: 'rss', enabled: true },
  { name: 'The Register – Security', url: 'https://www.theregister.com/security/headlines.atom', category: 'cyber', type: 'rss', enabled: true },

  // --- KriMiSi (Krisen, Militär, Sicherheit)
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'The Guardian – World', url: 'https://www.theguardian.com/world/rss', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'Defense News', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'Breaking Defense', url: 'https://breakingdefense.com/feed/', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'The War Zone', url: 'https://www.twz.com/feed', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'Military Times', url: 'https://www.militarytimes.com/arc/outboundfeeds/rss/?outputType=xml', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'Politico Europe', url: 'https://www.politico.eu/feed/', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'DW English', url: 'https://rss.dw.com/rdf/rss-en-all', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'Kyiv Independent', url: 'https://kyivindependent.com/feed/', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'Times of Israel', url: 'https://www.timesofisrael.com/feed/', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'NATO News', url: 'https://www.nato.int/cps/rss/en/natohq/rssFeed.xsl/rssFeed.xml', category: 'krimisi', type: 'rss', enabled: true },

  // --- Seiten ohne Feed (Links werden von der Übersichtsseite gesammelt)
  { name: 'AP News – World', url: 'https://apnews.com/world-news', category: 'krimisi', type: 'html', pattern: 'apnews\\.com/article/', enabled: true },
  { name: 'Reuters – World', url: 'https://www.reuters.com/world/', category: 'krimisi', type: 'html', pattern: 'reuters\\.com/world/.+-\\d{4}-\\d{2}-\\d{2}', enabled: true },
  { name: 'Reuters – Cybersecurity', url: 'https://www.reuters.com/technology/cybersecurity/', category: 'cyber', type: 'html', pattern: 'reuters\\.com/.+-\\d{4}-\\d{2}-\\d{2}', enabled: true }
];

/** Quellen-Liste als Text (eine Quelle pro Zeile) für die Einstellungen. */
export function sourcesToText(sources) {
  return sources
    .map((s) => [s.enabled === false ? '#' + s.name : s.name, s.url, s.category || 'both', s.type || 'rss', s.pattern || ''].join(' | ').replace(/\s*\|\s*$/, ''))
    .join('\n');
}

/** Text (eine Quelle pro Zeile: Name | URL | Kategorie | Typ | Muster) → Quellen-Objekte. */
export function parseSourcesText(textValue) {
  const out = [];
  for (const rawLine of (textValue || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 2 || !/^https?:\/\//i.test(parts[1])) continue;
    const enabled = !parts[0].startsWith('#');
    out.push({
      name: parts[0].replace(/^#\s*/, ''),
      url: parts[1],
      category: /^(cyber|krimisi|both)$/i.test(parts[2] || '') ? parts[2].toLowerCase() : 'both',
      type: /^html$/i.test(parts[3] || '') ? 'html' : 'rss',
      pattern: parts[4] || '',
      enabled
    });
  }
  return out;
}
