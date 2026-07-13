const DEFAULTS = {
  bitrate: 96, audioSource: 'system', micEnabled: false, micGain: 2, micDeviceId: '',
  subfolder: 'Reuniões', askWhereToSave: false,
  filenamePrefix: 'reuniao', dateFormat: 'AAAAMMDD-hhmm',
  showPill: true, pillCorner: 'bottom-right', domMeet: true, domTeams: true,
  autoSummary: false, summaryLang: 'auto', geminiModel: 'auto', pillSound: true, uiLang: 'auto'
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
    st.classList.add('rec'); $('statusTxt').textContent = t('status_rec');
    btn.classList.add('rec'); $('bigLabel').textContent = t('btn_stop'); startTick();
  } else {
    st.classList.remove('rec'); $('statusTxt').textContent = t('status_ready');
    $('time').textContent = ''; btn.classList.remove('rec'); $('bigLabel').textContent = t('btn_start'); stopTick();
  }
}

function reflect() {
  $('micSwitch').checked = !!settings.micEnabled;
  $('dest').textContent = settings.askWhereToSave
    ? t('save_ask')
    : t('save_downloads') + (settings.subfolder ? '/' + settings.subfolder : '');
}
function load(cb) { chrome.storage.sync.get(DEFAULTS, (s) => { settings = s; mxSetLang(settings.uiLang); mxApplyI18n(document); reflect(); cb && cb(); }); }

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
    $('micHint').textContent = t('mic_asking');
    const ok = await requestMic();
    if (ok) $('micHint').textContent = t('mic_ok');
    else {
      $('micSwitch').checked = false; settings.micEnabled = false; chrome.storage.sync.set({ micEnabled: false });
      $('micHint').textContent = t('mic_denied');
    }
  } else {
    settings.micEnabled = false; chrome.storage.sync.set({ micEnabled: false });
    $('micHint').textContent = t('mic_hint_off');
  }
});

// gravação
function onStartRes(res) {
  if (res && res.ok) {
    // só o "recebi" — o "gravando" de fato chega por RECORDING_STARTED
    $('hint').textContent = t('hint_choose');
  } else {
    $('hint').textContent = t('err_prefix') + ((res && res.error) || t('start_err'));
  }
}
$('big').addEventListener('click', async () => {
  if (recording) {
    $('hint').textContent = t('hint_converting');
    chrome.runtime.sendMessage({ type: 'STOP' }, () => {});
    recording = false; setUI();
    return;
  }
  // modo único: áudio do sistema. Ao gravar, o seletor abre (tela/aba) + "Compartilhar áudio".
  $('hint').textContent = t('hint_choose');
  chrome.runtime.sendMessage({ type: 'START', source: 'system', bitrate: settings.bitrate }, onStartRes);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'RECORDING_STARTED') { recording = true; startedAt = msg.startedAt || Date.now(); setUI(); $('hint').textContent = t('hint_recording'); }
  if (msg.type === 'SAVED') $('hint').textContent = t('saved_ok', msg.size);
  if (msg.type === 'WARN') $('hint').textContent = msg.warn;
  if (msg.type === 'ERROR') { recording = false; setUI(); $('hint').textContent = t('err_prefix') + msg.error; }
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
