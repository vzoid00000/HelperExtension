import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../lib/settings.js';
import { translateArticle } from '../lib/translate.js';
import { testLocalLlm } from '../lib/llm.js';
import { DEFAULT_SOURCES, sourcesToText, parseSourcesText } from '../lib/sources.js';

const TEXT_FIELDS = ['llmProvider', 'anthropicApiKey', 'anthropicModel', 'localLlmUrl', 'localLlmModel', 'localLlmApiKey', 'localLlmTimeoutSec', 'translator', 'deeplApiKey', 'sourcesText', 'minScore', 'maxItemsPerRun', 'autoRunTime', 'osdpDateFormat', 'authorUnknownText', 'osdpUrlPattern'];
const BOOL_FIELDS = ['autoTags', 'autoSave', 'fillEnglishTab', 'useSiteExtract'];
const $ = (id) => document.getElementById(id);

function setStatus(msg, kind = '') {
  const el = $('status');
  el.hidden = !msg;
  el.className = `status ${kind}`;
  el.textContent = msg;
}

function readForm() {
  const s = {};
  for (const f of TEXT_FIELDS) s[f] = $(f).value.trim();
  for (const f of BOOL_FIELDS) s[f] = $(f).checked;
  s.minScore = Math.max(0, Math.min(10, Number(s.minScore) || 0));
  s.maxItemsPerRun = Math.max(1, Number(s.maxItemsPerRun) || 25);
  s.localLlmTimeoutSec = Math.max(30, Number(s.localLlmTimeoutSec) || 600);
  return s;
}

async function init() {
  const settings = await loadSettings();
  // Gespeicherte Modell-ID, die nicht in der Auswahl steht (z. B. ältere/eigene ID), als Option ergänzen
  const modelSel = $('anthropicModel');
  const storedModel = settings.anthropicModel || DEFAULT_SETTINGS.anthropicModel;
  if (storedModel && ![...modelSel.options].some((o) => o.value === storedModel)) {
    modelSel.append(new Option(storedModel, storedModel));
  }
  for (const f of TEXT_FIELDS) $(f).value = settings[f] ?? DEFAULT_SETTINGS[f] ?? '';
  for (const f of BOOL_FIELDS) $(f).checked = !!(settings[f] ?? DEFAULT_SETTINGS[f]);

  $('btnDefaults').addEventListener('click', () => {
    $('sourcesText').value = sourcesToText(DEFAULT_SOURCES);
  });

  $('btnPresetCheap').addEventListener('click', () => {
    $('llmProvider').value = 'claude';
    $('translator').value = 'claude';
    $('anthropicModel').value = 'claude-haiku-5-5';
    const hasKey = !!$('anthropicApiKey').value.trim();
    setStatus(hasKey ? 'Sparmodus gesetzt – bitte „Speichern“ und „Übersetzung testen“.' : 'Sparmodus gesetzt – jetzt den API-Key von console.anthropic.com eintragen, „Speichern“ und „Übersetzung testen“.', 'ok');
    if (!hasKey) $('anthropicApiKey').focus();
  });

  $('btnPresetBridge').addEventListener('click', () => {
    $('llmProvider').value = 'local';
    $('translator').value = 'local';
    $('localLlmUrl').value = 'http://localhost:4310/v1';
    $('localLlmModel').value = 'opus';
    setStatus('Voreinstellung gesetzt – bitte „Speichern“ und dann „Verbindung testen“ (die Brücke muss laufen).', 'ok');
  });

  $('btnSave').addEventListener('click', async () => {
    const s = readForm();
    if (s.sourcesText && parseSourcesText(s.sourcesText).length === 0) {
      setStatus('Quellen-Liste: keine gültige Zeile gefunden (Format: Name | URL | Kategorie | Typ).', 'err');
      return;
    }
    if (s.autoRunTime && !/^\d{1,2}:\d{2}$/.test(s.autoRunTime)) {
      setStatus('Uhrzeit bitte als HH:MM angeben.', 'err');
      return;
    }
    await saveSettings({ ...DEFAULT_SETTINGS, ...s });
    setStatus('Gespeichert.', 'ok');
  });

  $('btnTestLocal').addEventListener('click', async () => {
    const s = { ...DEFAULT_SETTINGS, ...readForm() };
    setStatus('Teste lokales Modell …');
    $('btnTestLocal').disabled = true;
    try {
      const r = await testLocalLlm(s);
      setStatus(`Verbunden. Modelle: ${r.models.join(', ') || '(keine gemeldet)'} · Antwort: „${r.answer}“`, 'ok');
    } catch (e) {
      setStatus(e.message, 'err');
    } finally {
      $('btnTestLocal').disabled = false;
    }
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
