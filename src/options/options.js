import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../lib/settings.js';
import { translateArticle } from '../lib/translate.js';

const FIELDS = ['translator', 'anthropicApiKey', 'anthropicModel', 'deeplApiKey', 'osdpDateFormat', 'authorUnknownText', 'osdpTitleLanguage', 'osdpUrlPattern', 'osdpSelectorOverrides'];
const $ = (id) => document.getElementById(id);

function setStatus(msg, kind = '') {
  const el = $('status');
  el.hidden = !msg;
  el.className = `status ${kind}`;
  el.textContent = msg;
}

function readForm() {
  const s = {};
  for (const f of FIELDS) s[f] = $(f).value.trim();
  return s;
}

async function init() {
  const settings = await loadSettings();
  for (const f of FIELDS) $(f).value = settings[f] ?? DEFAULT_SETTINGS[f] ?? '';

  $('btnSave').addEventListener('click', async () => {
    const s = readForm();
    if (s.osdpSelectorOverrides) {
      try {
        JSON.parse(s.osdpSelectorOverrides);
      } catch (e) {
        setStatus(`Selektor-Overrides sind kein gültiges JSON: ${e.message}`, 'err');
        return;
      }
    }
    await saveSettings({ ...DEFAULT_SETTINGS, ...s });
    setStatus('Gespeichert.', 'ok');
  });

  $('btnTest').addEventListener('click', async () => {
    const s = { ...DEFAULT_SETTINGS, ...readForm() };
    setStatus('Teste Übersetzung …');
    $('btnTest').disabled = true;
    try {
      const r = await translateArticle(
        { title: 'Hackers breach defence contractor', text: 'The attackers gained access to internal systems on Friday, the company said.' },
        s,
        (m) => setStatus(m)
      );
      setStatus(`OK (${r.provider}): „${r.title}“ – ${r.text}`, 'ok');
    } catch (e) {
      setStatus(e.message, 'err');
    } finally {
      $('btnTest').disabled = false;
    }
  });
}

init();
