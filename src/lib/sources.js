// Standard-Quellen (englischsprachige News-Seiten mit RSS-Feed bzw. Übersichtsseite).
// Die Liste wird in der Ansicht „Quellen“ gepflegt; „Standardliste wiederherstellen“ setzt sie
// auf diesen Stand zurück.
//
// Felder:
//   name      Anzeigename
//   url       Feed-URL (type 'rss') oder Übersichtsseite (type 'html')
//   category  Schwerpunkt der Quelle: 'cyber' | 'krimisi' | 'both' (Hinweis für Relevanzprüfung und Bereichswahl)
//   type      'rss' | 'html'
//   pattern   nur type 'html': RegEx (String) für Artikel-URLs
//   enabled   true/false
//
// Aktiv sind die Quellen der Redaktion (Stand Oktober 2026). Die früheren Standardquellen bleiben
// als ausgeschaltete Einträge erhalten und lassen sich in der Quellen-Ansicht wieder einschalten.
// Seiten ohne Feed (Reuters, VOA, DHS) werden über die Übersichtsseite abgesucht; Reuters blockiert
// direkte Abrufe, dort lädt die Extension die Seite in einem Hintergrund-Tab.

export const DEFAULT_SOURCES = [
  // --- Allgemein (KriMiSi): Quellen der Redaktion
  { name: 'ABC News (Australien)', url: 'https://www.abc.net.au/news/feed/2942460/rss.xml', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'BBC News – Top Stories', url: 'https://feeds.bbci.co.uk/news/rss.xml', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'BBC News – World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'CBC News – Top Stories', url: 'https://www.cbc.ca/webfeed/rss/rss-topstories', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'CBC News – World', url: 'https://www.cbc.ca/webfeed/rss/rss-world', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'SABC News', url: 'https://www.sabcnews.com/sabcnews/feed/', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'RTÉ News', url: 'https://www.rte.ie/news/rss/news-headlines.xml', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'VOA News', url: 'https://www.voanews.com/', category: 'krimisi', type: 'html', pattern: 'voanews\\.com/a/[^/]+/\\d+\\.html', enabled: true },
  { name: 'Reuters – World', url: 'https://www.reuters.com/world/', category: 'krimisi', type: 'html', pattern: 'reuters\\.com/world/.+-\\d{4}-\\d{2}-\\d{2}', enabled: true },
  { name: 'PBS NewsHour – Headlines', url: 'https://www.pbs.org/newshour/feeds/rss/headlines', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'PBS NewsHour – World', url: 'https://www.pbs.org/newshour/feeds/rss/world', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'The Guardian – World', url: 'https://www.theguardian.com/world/rss', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'Washington Post – World', url: 'https://feeds.washingtonpost.com/rss/world', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'Arab News', url: 'https://www.arabnews.com/rss.xml', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'Daily Sabah – World', url: 'https://www.dailysabah.com/rssFeed/world', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'Daily Sabah – Politics', url: 'https://www.dailysabah.com/rssFeed/politics', category: 'krimisi', type: 'rss', enabled: true },
  { name: 'DHS – Pressemitteilungen', url: 'https://www.dhs.gov/news-releases/press-releases', category: 'both', type: 'html', pattern: 'dhs\\.gov/news/20\\d\\d/\\d\\d/\\d\\d/', enabled: true },

  // --- Cyber: Quellen der Redaktion
  { name: 'Cybernews', url: 'https://cybernews.com/feed/', category: 'cyber', type: 'rss', enabled: true },
  { name: 'Reuters – Technology', url: 'https://www.reuters.com/technology/', category: 'cyber', type: 'html', pattern: 'reuters\\.com/technology/.+-\\d{4}-\\d{2}-\\d{2}', enabled: true },
  { name: 'The Record (Recorded Future)', url: 'https://therecord.media/feed', category: 'cyber', type: 'rss', enabled: true },
  { name: 'Recorded Future – Blog', url: 'https://www.recordedfuture.com/feed', category: 'cyber', type: 'rss', enabled: true },

  // --- Frühere Standardquellen (ausgeschaltet, bei Bedarf einschalten)
  { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/', category: 'cyber', type: 'rss', enabled: false },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', category: 'cyber', type: 'rss', enabled: false },
  { name: 'SecurityWeek', url: 'https://www.securityweek.com/feed/', category: 'cyber', type: 'rss', enabled: false },
  { name: 'CyberScoop', url: 'https://cyberscoop.com/feed/', category: 'cyber', type: 'rss', enabled: false },
  { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml', category: 'cyber', type: 'rss', enabled: false },
  { name: 'Infosecurity Magazine', url: 'https://www.infosecurity-magazine.com/rss/news/', category: 'cyber', type: 'rss', enabled: false },
  { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', category: 'cyber', type: 'rss', enabled: false },
  { name: 'The Register – Security', url: 'https://www.theregister.com/security/headlines.atom', category: 'cyber', type: 'rss', enabled: false },
  { name: 'Reuters – Cybersecurity', url: 'https://www.reuters.com/technology/cybersecurity/', category: 'cyber', type: 'html', pattern: 'reuters\\.com/.+-\\d{4}-\\d{2}-\\d{2}', enabled: false },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'krimisi', type: 'rss', enabled: false },
  { name: 'Defense News', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml', category: 'krimisi', type: 'rss', enabled: false },
  { name: 'Breaking Defense', url: 'https://breakingdefense.com/feed/', category: 'krimisi', type: 'rss', enabled: false },
  { name: 'The War Zone', url: 'https://www.twz.com/feed', category: 'krimisi', type: 'rss', enabled: false },
  { name: 'Military Times', url: 'https://www.militarytimes.com/arc/outboundfeeds/rss/?outputType=xml', category: 'krimisi', type: 'rss', enabled: false },
  { name: 'Politico Europe', url: 'https://www.politico.eu/feed/', category: 'krimisi', type: 'rss', enabled: false },
  { name: 'DW English', url: 'https://rss.dw.com/rdf/rss-en-all', category: 'krimisi', type: 'rss', enabled: false },
  { name: 'Kyiv Independent', url: 'https://kyivindependent.com/feed/', category: 'krimisi', type: 'rss', enabled: false },
  { name: 'Times of Israel', url: 'https://www.timesofisrael.com/feed/', category: 'krimisi', type: 'rss', enabled: false },
  { name: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', category: 'krimisi', type: 'rss', enabled: false },
  { name: 'NATO News', url: 'https://www.nato.int/cps/rss/en/natohq/rssFeed.xsl/rssFeed.xml', category: 'krimisi', type: 'rss', enabled: false },
  { name: 'AP News – World', url: 'https://apnews.com/world-news', category: 'krimisi', type: 'html', pattern: 'apnews\\.com/article/', enabled: false }
];

/** Gültige Werte für die Quellen-Felder (für Validierung und Auswahlfelder in der UI). */
export const SOURCE_CATEGORIES = ['cyber', 'krimisi', 'both'];
export const SOURCE_KINDS = ['rss', 'html'];
export const CATEGORY_LABELS = { cyber: 'Cyber', krimisi: 'KriMiSi', both: 'Beide' };
export const KIND_LABELS = { rss: 'RSS/Atom-Feed', html: 'Übersichtsseite' };

/**
 * Quellen-Liste als Text (eine Quelle pro Zeile) für Import/Export. „|“ ist das Trennzeichen und
 * wird im Namen durch „/“ ersetzt, ein führendes „#“ (= deaktiviert) im Namen entfernt – sonst ginge
 * die Zeile beim Zurücklesen verloren bzw. würde falsch gelesen.
 */
export function sourcesToText(sources) {
  const safeName = (name) => String(name || '').replace(/\s*\|\s*/g, ' / ').replace(/^#+\s*/, '').trim() || 'Quelle';
  return sources
    .map((s) => [s.enabled === false ? '#' + safeName(s.name) : safeName(s.name), s.url, s.category || 'both', s.type || 'rss', s.pattern || ''].join(' | ').replace(/\s*\|\s*$/, ''))
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
