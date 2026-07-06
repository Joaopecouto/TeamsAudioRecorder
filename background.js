// Service worker (MV3). Tem acesso a chrome.storage/downloads/fetch/indexedDB.
// O offscreen só faz mídia e devolve o blob; aqui baixamos e salvamos os metadados.
importScripts('format.js', 'gemini.js', 'idb.js');

const DEFAULTS = {
  bitrate: 96, audioSource: 'system', micEnabled: false, micGain: 2, micDeviceId: '',
  subfolder: 'Reuniões', askWhereToSave: false,
  filenamePrefix: 'reuniao', dateFormat: 'AAAAMMDD-hhmm',
  showPill: true, pillCorner: 'bottom-right', domMeet: true, domTeams: true,
  autoSummary: false, summaryLang: 'auto', geminiModel: 'gemini-2.5-flash', pillSound: true
};

let recording = false;
let recordingTabId = null;
let startedAt = 0;

// O service worker do MV3 dorme após ~30s e perde as variáveis acima. Persistimos o
// estado no storage.session para sobreviver ao sleep (senão a extensão "para de
// funcionar": esquece a gravação em andamento e passa a mostrar/agir com estado errado).
function saveState() {
  try { chrome.storage.session.set({ rec: { recording, recordingTabId, startedAt } }); } catch (e) { /* ignore */ }
}
// log que sobrevive ao crash do SW (DevTools desconecta). Ler com:
//   chrome.storage.local.get('mxlog', r => console.log(r.mxlog))
function mxlog(s) {
  try { chrome.storage.local.get({ mxlog: [] }, (r) => { const a = r.mxlog || []; a.push(s); chrome.storage.local.set({ mxlog: a.slice(-40) }); }); } catch (e) { /* ignore */ }
}
try {
  chrome.storage.session.get({ rec: null }, (r) => {
    if (r && r.rec) { recording = !!r.rec.recording; recordingTabId = r.rec.recordingTabId; startedAt = r.rec.startedAt || 0; }
  });
} catch (e) { /* storage.session indisponível */ }

// Primeira instalação: abre a página de ajustes já no fluxo de permissão do microfone.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html#setup') });
  }
});

async function hasOffscreen() {
  if (chrome.offscreen && chrome.offscreen.hasDocument) return await chrome.offscreen.hasDocument();
  const c = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return c.length > 0;
}
async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA', 'DISPLAY_MEDIA'],
    justification: 'Gravar o áudio da aba/sistema e do microfone e converter para MP3 localmente.'
  });
}
function getMediaStreamId(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      const e = chrome.runtime.lastError;
      e ? reject(new Error(e.message)) : resolve(id);
    });
  });
}
async function chooseDesktop() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return new Promise((resolve) => {
    const cb = (streamId) => resolve(streamId || null);
    try {
      if (tab) chrome.desktopCapture.chooseDesktopMedia(['screen', 'window', 'tab', 'audio'], tab, cb);
      else chrome.desktopCapture.chooseDesktopMedia(['screen', 'window', 'tab', 'audio'], cb);
    } catch (e) { resolve(null); }
  });
}
function notifyTab() {
  if (recordingTabId != null) {
    chrome.tabs.sendMessage(recordingTabId, { type: 'STATE', recording, startedAt }).catch(() => {});
  }
}
function setBadge(on) {
  chrome.action.setBadgeText({ text: on ? 'REC' : '' });
  if (on) {
    chrome.action.setBadgeBackgroundColor({ color: '#D9462E' });
    chrome.action.setTitle({ title: 'Gravando reunião…' });
  } else {
    chrome.action.setTitle({ title: 'Gravar reunião' });
  }
}
function sanitize(name) { return String(name || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim(); }
function updateRec(ts, patch) {
  chrome.storage.local.get({ recordings: [] }, (st) => {
    const arr = st.recordings.map((r) => (r.ts === ts ? Object.assign({}, r, patch) : r));
    chrome.storage.local.set({ recordings: arr });
  });
}

// Recebe o resultado do offscreen: baixa o MP3 + grava metadados + (opcional) resumo automático.
async function handleRecDone(m) {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  const sub = sanitize(cfg.subfolder);
  const base = sanitize(mxFilename(cfg.filenamePrefix, cfg.dateFormat, '.mp3'));
  const filename = (sub ? sub + '/' : '') + base;

  // salva metadados primeiro (mesmo se o download falhar, fica re-baixável na aba Gravações)
  const entry = {
    id: null, name: base, folder: sub, sizeMB: m.sizeMB, ts: m.ts,
    durationSec: m.durationSec, source: m.source, mic: m.micUsed, chunkBytes: m.chunkBytes || [], chunkSecs: m.chunkSecs || [], summary: '', transcript: ''
  };
  await new Promise((res) => chrome.storage.local.get({ recordings: [] }, (st) => {
    chrome.storage.local.set({ recordings: [entry, ...st.recordings].slice(0, 50) }, res);
  }));

  // baixa o MP3 com a blob: URL criada NO OFFSCREEN (válida para o chrome.downloads,
  // sem o limite de tamanho do data: URL). O áudio também fica no IndexedDB (re-baixar).
  if (m.blobUrl) {
    chrome.downloads.download({ url: m.blobUrl, filename, saveAs: !!cfg.askWhereToSave }, (downloadId) => {
      if (chrome.runtime.lastError) {
        chrome.runtime.sendMessage({ type: 'WARN', warn: 'Salvo, mas o download automático falhou — use "Baixar MP3" na aba Gravações.' }).catch(() => {});
      } else if (downloadId != null) {
        updateRec(m.ts, { id: downloadId });
      }
    });
  }
  chrome.runtime.sendMessage({ type: 'SAVED', size: m.sizeMB + ' MB' }).catch(() => {});

  // resumo automático (só se ligado e com chave): transcreve as partes -> junta -> resume do
  // TEXTO. Roda no service worker com keepalive; para reuniões MUITO longas pode não terminar
  // aqui (limite de vida do SW) — aí é só usar "Criar resumo" na aba Gravações (mesmo fluxo,
  // na página, sem hibernação).
  if (cfg.autoSummary) {
    const local = await chrome.storage.local.get({ geminiKey: '' });
    if (local.geminiKey) {
      const keep = setInterval(() => { try { chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError); } catch (e) { /* ignore */ } }, 20000);
      try {
        const blob = await mxIdbGet(m.ts);
        if (blob) {
          const chunks = mxChunksFromBlob(blob, m.chunkBytes);
          const starts = [0].concat(m.chunkSecs || []);
          const tr = await mxTranscribeSegments(local.geminiKey, cfg.geminiModel, cfg.summaryLang, chunks, null, starts);
          if (tr.ok) {
            updateRec(m.ts, { transcript: tr.text });
            const sm = await mxSummarizeTranscript(local.geminiKey, cfg.geminiModel, cfg.summaryLang, tr.text);
            if (sm.ok) updateRec(m.ts, { summary: sm.text });
            else chrome.runtime.sendMessage({ type: 'WARN', warn: 'Resumo automático: ' + sm.error }).catch(() => {});
          } else {
            chrome.runtime.sendMessage({ type: 'WARN', warn: 'Transcrição automática: ' + tr.error }).catch(() => {});
          }
        }
      } catch (e) { /* ignore */ } finally { clearInterval(keep); }
    }
  }

  try { await mxIdbPrune(m.ts); } catch (e) { /* ignore */ } // poda protegendo a gravação atual
}

function notifyError(tabId, error) {
  recording = false;
  recordingTabId = null;
  setBadge(false);
  saveState();
  chrome.runtime.sendMessage({ type: 'ERROR', error }).catch(() => {});            // popup
  if (tabId != null) chrome.tabs.sendMessage(tabId, { type: 'PILL_ERROR', error }).catch(() => {}); // balão
}

// Parte longa (seletor + offscreen) roda SOLTA — não segura o canal da mensagem.
// Resultado vai por STATE (sucesso) ou ERROR/PILL_ERROR (falha).
async function startCapture(msg, sender) {
  let tabId = (msg.tabId != null) ? msg.tabId : (sender && sender.tab ? sender.tab.id : null);
  // mantém o service worker vivo durante TODO o início (seletor + offscreen). Era a
  // causa raiz do "para de funcionar": o SW hibernava aos 30s e o início ficava órfão.
  const keep = setInterval(() => { try { chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError); } catch (e) { /* ignore */ } }, 20000);
  try {
    mxlog('start:1 cfg');
    const cfg = await chrome.storage.sync.get(DEFAULTS);

    if (tabId == null) {
      const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = t ? t.id : null;
    }

    // O SELETOR de tela/áudio abre DENTRO do offscreen (getDisplayMedia), não aqui.
    // Tira o chrome.desktopCapture do service worker — era o que o derrubava.
    mxlog('start:2 ensureOffscreen');
    await ensureOffscreen();
    mxlog('start:3 offscreen_start');
    const res = await Promise.race([
      chrome.runtime.sendMessage({
        type: 'OFFSCREEN_START', target: 'offscreen', source: 'display',
        bitrate: cfg.bitrate, micEnabled: !!cfg.micEnabled, micGain: cfg.micGain || 2, micDeviceId: cfg.micDeviceId || ''
      }),
      new Promise((r) => setTimeout(() => r({ ok: false, error: 'a captura não respondeu a tempo (offscreen).' }), 120000))
    ]);
    mxlog('start:4 resp ' + JSON.stringify(res));
    if (!res || !res.ok) {
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP', target: 'offscreen' }).catch(() => {}); // não deixa gravando órfão
      notifyError(tabId, (res && res.error) || 'A captura não iniciou.');
      return;
    }

    recording = true;
    recordingTabId = tabId;
    startedAt = Date.now();
    saveState();
    setBadge(true);
    notifyTab(); // STATE recording=true -> balão mostra "Parar"
    chrome.runtime.sendMessage({ type: 'RECORDING_STARTED', startedAt }).catch(() => {}); // popup
    mxlog('start:5 gravando');
  } catch (e) {
    mxlog('start:ERR ' + (e && e.message));
    notifyError(tabId, e.message);
  } finally {
    clearInterval(keep);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return false;

  // Tudo respondido na hora (síncrono). Nada de "return true" -> sem "message channel closed".
  if (msg.type === 'REC_DONE') { recording = false; setBadge(false); recordingTabId = null; saveState(); handleRecDone(msg); return false; }
  if (msg.type === 'OFFSCREEN_WARN') {
    chrome.runtime.sendMessage({ type: 'WARN', warn: msg.warn }).catch(() => {});
    if (recordingTabId != null) chrome.tabs.sendMessage(recordingTabId, { type: 'WARN', warn: msg.warn }).catch(() => {});
    return false;
  }
  if (msg.type === 'OFFSCREEN_ERROR') {
    recording = false; setBadge(false);
    chrome.runtime.sendMessage({ type: 'ERROR', error: msg.error }).catch(() => {});
    if (recordingTabId != null) chrome.tabs.sendMessage(recordingTabId, { type: 'PILL_ERROR', error: msg.error }).catch(() => {});
    return false;
  }
  if (msg.type === 'WARMUP') { ensureOffscreen().catch(() => {}); return false; }
  if (msg.type === 'GET_STATE') { sendResponse({ recording, startedAt }); return false; }

  if (msg.type === 'START' || msg.type === 'PILL_START') {
    if (recording) { sendResponse({ ok: false, error: 'Já existe uma gravação em andamento.' }); return false; }
    sendResponse({ ok: true });   // ack imediato; o resultado real vem por STATE / ERROR
    startCapture(msg, sender);
    return false;
  }

  if (msg.type === 'STOP') {
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP', target: 'offscreen' }).catch(() => {});
    recording = false;
    setBadge(false);
    notifyTab();
    recordingTabId = null;
    saveState();
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
