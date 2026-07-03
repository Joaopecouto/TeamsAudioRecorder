const DEFAULTS = {
  bitrate: 96, audioSource: 'system', micEnabled: false, micGain: 2, micDeviceId: '',
  subfolder: 'Reuniões', askWhereToSave: false,
  filenamePrefix: 'reuniao', dateFormat: 'AAAAMMDD-hhmm',
  showPill: true, pillCorner: 'bottom-right', domMeet: true, domTeams: true,
  autoSummary: false, summaryLang: 'auto', geminiModel: 'gemini-2.5-flash', pillSound: true
};
const $ = (id) => document.getElementById(id);
let recording = false, startedAt = 0, tick = null, settings = Object.assign({}, DEFAULTS);

function fmt() {
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function startTick() { stopTick(); $('time').textContent = fmt(); tick = setInterval(() => ($('time').textContent = fmt()), 1000); }
function stopTick() { if (tick) clearInterval(tick); tick = null; }
function setUI() {
  const st = $('status'), btn = $('big');
  if (recording) {
    st.classList.add('rec'); $('statusTxt').textContent = 'Gravando…';
    btn.classList.add('rec'); $('bigLabel').textContent = 'Parar e salvar'; startTick();
  } else {
    st.classList.remove('rec'); $('statusTxt').textContent = 'Pronto para gravar';
    $('time').textContent = ''; btn.classList.remove('rec'); $('bigLabel').textContent = 'Iniciar gravação'; stopTick();
  }
}

function reflect() {
  $('micSwitch').checked = !!settings.micEnabled;
  $('dest').textContent = settings.askWhereToSave
    ? 'Salvar em: você escolhe'
    : 'Salvar em: Downloads' + (settings.subfolder ? '/' + settings.subfolder : '');
}
function load(cb) { chrome.storage.sync.get(DEFAULTS, (s) => { settings = s; reflect(); cb && cb(); }); }

// abre a página de opções (reaproveita a aba se já estiver aberta)
function openPage(hash) {
  const url = chrome.runtime.getURL('options.html');
  chrome.tabs.query({}, (tabs) => {
    const ex = tabs.find((t) => t.url && t.url.indexOf(url) === 0);
    if (ex) {
      chrome.tabs.update(ex.id, { active: true, url: url + (hash || '') });
      if (ex.windowId != null) chrome.windows.update(ex.windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: url + (hash || '') });
    }
  });
}
$('gear').addEventListener('click', () => openPage(''));
$('openRec').addEventListener('click', () => openPage('#rec'));

// microfone (toggle rápido)
async function requestMic() {
  try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach((t) => t.stop()); return true; }
  catch (e) { return false; }
}
$('micSwitch').addEventListener('change', async () => {
  if ($('micSwitch').checked) {
    settings.micEnabled = true; chrome.storage.sync.set({ micEnabled: true });
    $('micHint').textContent = 'Pedindo permissão do microfone…';
    const ok = await requestMic();
    if (ok) $('micHint').textContent = 'Microfone autorizado ✓ — entra junto na gravação.';
    else {
      $('micSwitch').checked = false; settings.micEnabled = false; chrome.storage.sync.set({ micEnabled: false });
      $('micHint').textContent = 'Permissão negada. Ligue de novo para tentar.';
    }
  } else {
    settings.micEnabled = false; chrome.storage.sync.set({ micEnabled: false });
    $('micHint').textContent = 'Só a fonte principal será gravada.';
  }
});

// gravação
function onStartRes(res) {
  if (res && res.ok) {
    // só o "recebi" — o "gravando" de fato chega por RECORDING_STARTED
    $('hint').textContent = 'Escolha a tela/aba e marque "Compartilhar áudio"…';
  } else {
    $('hint').textContent = 'Erro: ' + ((res && res.error) || 'falha ao iniciar');
  }
}
$('big').addEventListener('click', async () => {
  if (recording) {
    $('hint').textContent = 'Convertendo para MP3…';
    chrome.runtime.sendMessage({ type: 'STOP' }, () => {});
    recording = false; setUI();
    return;
  }
  // modo único: áudio do sistema. Ao gravar, o seletor abre (tela/aba) + "Compartilhar áudio".
  $('hint').textContent = 'Escolha a tela/aba e marque "Compartilhar áudio"…';
  chrome.runtime.sendMessage({ type: 'START', source: 'system', bitrate: settings.bitrate }, onStartRes);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'RECORDING_STARTED') { recording = true; startedAt = msg.startedAt || Date.now(); setUI(); $('hint').textContent = 'Gravando… pode fechar este menu.'; }
  if (msg.type === 'SAVED') $('hint').textContent = 'MP3 salvo ✓ (' + msg.size + ') — abra "Ver gravações" para transcrever/resumir.';
  if (msg.type === 'WARN') $('hint').textContent = msg.warn;
  if (msg.type === 'ERROR') { recording = false; setUI(); $('hint').textContent = 'Erro: ' + msg.error; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.micEnabled) settings.micEnabled = changes.micEnabled.newValue;
  if (changes.audioSource) settings.audioSource = changes.audioSource.newValue;
  if (changes.subfolder) settings.subfolder = changes.subfolder.newValue;
  if (changes.askWhereToSave) settings.askWhereToSave = changes.askWhereToSave.newValue;
  reflect();
});

// pré-cria o offscreen ao abrir o popup, pra captura iniciar sem atraso (e o streamId não expirar)
chrome.runtime.sendMessage({ type: 'WARMUP' }, () => { void chrome.runtime.lastError; });

load(() => chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
  if (chrome.runtime.lastError) return;
  if (res && res.recording) { recording = true; startedAt = res.startedAt || Date.now(); }
  setUI();
}));
