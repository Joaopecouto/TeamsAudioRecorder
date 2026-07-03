const DEFAULTS = {
  bitrate: 96, audioSource: 'system', micEnabled: false, micGain: 2, micDeviceId: '',
  subfolder: 'Reuniões', askWhereToSave: false,
  filenamePrefix: 'reuniao', dateFormat: 'AAAAMMDD-hhmm',
  showPill: true, pillCorner: 'bottom-right', domMeet: true, domTeams: true,
  autoSummary: false, summaryLang: 'auto', geminiModel: 'gemini-2.5-flash', pillSound: true
};
const $ = (id) => document.getElementById(id);
let settings = Object.assign({}, DEFAULTS);
let geminiKey = '';
let hasKey = false;

let availTs = new Set();
const busyT = new Set(), busyS = new Set();
const openT = new Set(), openS = new Set();
const progLabel = {}; // rótulo de progresso por ts (ex.: "Transcrevendo parte 2/4…")
function setBusyLabel(ts, text) { progLabel[ts] = text; loadRecordings(); }

// ---------- toast ----------
let toastTimer = null;
function toast(text) {
  const t = $('saved'); t.textContent = text || 'Salvo ✓';
  t.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

// ---------- settings ----------
function updatePreview() {
  const name = mxFilename($('filenamePrefix').value, $('dateFormat').value, '.mp3');
  $('fmtPreview').textContent = (settings.subfolder ? settings.subfolder + '/' : '') + name;
}
function reflect() {
  $('micSwitch').checked = !!settings.micEnabled;
  $('micGain').value = String(settings.micGain || 2);
  $('bitrate').value = String(settings.bitrate);
  $('geminiModel').value = settings.geminiModel;
  $('summaryLang').value = settings.summaryLang;
  $('autoSummary').checked = !!settings.autoSummary;
  $('subfolder').value = settings.subfolder;
  $('askWhereToSave').checked = !!settings.askWhereToSave;
  $('filenamePrefix').value = settings.filenamePrefix;
  $('dateFormat').value = settings.dateFormat;
  $('showPill').checked = !!settings.showPill;
  $('pillSound').checked = !!settings.pillSound;
  $('pillCorner').value = settings.pillCorner;
  $('domTeams').checked = !!settings.domTeams;
  $('domMeet').checked = !!settings.domMeet;
  updatePreview();
}
function saveAll() {
  settings = Object.assign({}, settings, {
    bitrate: parseInt($('bitrate').value, 10),
    geminiModel: $('geminiModel').value,
    summaryLang: $('summaryLang').value,
    autoSummary: $('autoSummary').checked,
    subfolder: $('subfolder').value,
    askWhereToSave: $('askWhereToSave').checked,
    filenamePrefix: $('filenamePrefix').value,
    dateFormat: $('dateFormat').value,
    showPill: $('showPill').checked,
    pillSound: $('pillSound').checked,
    pillCorner: $('pillCorner').value,
    domTeams: $('domTeams').checked,
    domMeet: $('domMeet').checked
  });
  chrome.storage.sync.set(settings, () => toast());
  updatePreview();
}

['bitrate', 'geminiModel', 'summaryLang', 'autoSummary', 'subfolder', 'askWhereToSave', 'filenamePrefix', 'dateFormat', 'showPill', 'pillSound', 'pillCorner', 'domTeams', 'domMeet']
  .forEach((id) => { const el = $(id); el.addEventListener('change', saveAll); el.addEventListener('input', saveAll); });
document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { $('dateFormat').value = c.dataset.fmt; saveAll(); }));

// ---------- chave do Gemini (local) ----------
function updateNoKeyHint() { $('noKeyHint').classList.toggle('hidden', hasKey); }
function highlightKey() {
  const k = $('geminiKey');
  k.scrollIntoView({ behavior: 'smooth', block: 'center' });
  k.focus();
  k.classList.add('highlight');
  setTimeout(() => k.classList.remove('highlight'), 1600);
}
$('getkey').addEventListener('click', () => chrome.tabs.create({ url: 'https://aistudio.google.com/apikey' }));
$('goToKey').addEventListener('click', () => { showTab('cap'); highlightKey(); });
$('geminiKey').addEventListener('input', () => {
  geminiKey = $('geminiKey').value.trim(); hasKey = !!geminiKey;
  chrome.storage.local.set({ geminiKey });
  updateNoKeyHint();
});
$('geminiKey').addEventListener('change', () => { toast(); loadRecordings(); });

// ---------- microfone ----------
async function requestMic() {
  try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach((t) => t.stop()); return true; }
  catch (e) { return false; }
}
async function listMics() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === 'audioinput');
    const sel = $('micDevice'); sel.innerHTML = '';
    const opt0 = document.createElement('option'); opt0.value = ''; opt0.textContent = 'Microfone padrão do sistema'; sel.appendChild(opt0);
    mics.forEach((m, i) => { const o = document.createElement('option'); o.value = m.deviceId; o.textContent = m.label || ('Microfone ' + (i + 1)); sel.appendChild(o); });
    sel.value = settings.micDeviceId || '';
    $('micNote').textContent = mics.some((m) => m.label) ? 'Aparelho usado quando o microfone está ligado.' : 'Autorize o microfone para ver os nomes dos aparelhos.';
  } catch (e) { /* ignore */ }
}
async function setMic(on) {
  settings.micEnabled = on; $('micSwitch').checked = on; chrome.storage.sync.set({ micEnabled: on });
  if (on) {
    $('micNote').textContent = 'Pedindo permissão do microfone…';
    const ok = await requestMic();
    if (ok) { await listMics(); $('setupBanner').classList.add('hidden'); }
    else { settings.micEnabled = false; $('micSwitch').checked = false; chrome.storage.sync.set({ micEnabled: false }); $('micNote').textContent = 'Permissão negada. Ligue de novo para tentar.'; }
  } else { $('micNote').textContent = 'O microfone não será gravado.'; }
}
$('micSwitch').addEventListener('change', () => setMic($('micSwitch').checked));
$('micDevice').addEventListener('change', () => { settings.micDeviceId = $('micDevice').value; chrome.storage.sync.set({ micDeviceId: settings.micDeviceId }); });
$('micGain').addEventListener('change', () => { settings.micGain = parseFloat($('micGain').value); chrome.storage.sync.set({ micGain: settings.micGain }); });
$('grantMic').addEventListener('click', () => setMic(true));

// ---------- gravações ----------
function mmss(s) { s = s || 0; return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function whenStr(ts) { const d = new Date(ts); const p = (n) => String(n).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function mkBtn(label) { const b = document.createElement('button'); b.className = 'b'; b.textContent = label; return b; }
function updateRec(ts, patch) {
  chrome.storage.local.get({ recordings: [] }, (st) => {
    const arr = st.recordings.map((r) => (r.ts === ts ? Object.assign({}, r, patch) : r));
    chrome.storage.local.set({ recordings: arr });
  });
}
async function refreshAvail() { try { availTs = new Set(await mxIdbKeys()); } catch (e) { availTs = new Set(); } }
function loadRecordings() { refreshAvail().then(() => chrome.storage.local.get({ recordings: [] }, ({ recordings }) => render(recordings))); }

function buildPanel(r, kind) {
  const text = kind === 'transcript' ? r.transcript : r.summary;
  const p = document.createElement('div'); p.className = 'panel';
  const t = document.createElement('div'); t.className = 'txt'; t.textContent = text;
  const acts = document.createElement('div'); acts.className = 'acts';
  const cp = mkBtn('Copiar'); cp.addEventListener('click', () => { navigator.clipboard.writeText(text); cp.textContent = 'Copiado ✓'; setTimeout(() => (cp.textContent = 'Copiar'), 1200); });
  const ext = kind === 'transcript' ? '-transcricao.txt' : '-resumo.md';
  const mt = kind === 'transcript' ? 'text/plain' : 'text/markdown';
  const dl = mkBtn('Baixar'); dl.addEventListener('click', () => {
    const u = URL.createObjectURL(new Blob([text], { type: mt }));
    chrome.downloads.download({ url: u, filename: (r.folder ? r.folder + '/' : '') + r.name.replace(/\.mp3$/, '') + ext, saveAs: false });
  });
  acts.appendChild(cp); acts.appendChild(dl);
  p.appendChild(t); p.appendChild(acts);
  return p;
}
function render(list) {
  updateNoKeyHint();
  const c = $('recList'); c.innerHTML = '';
  if (!list.length) { c.innerHTML = '<div class="empty">Nenhuma gravação ainda.</div>'; return; }
  list.forEach((r) => {
    const item = document.createElement('div'); item.className = 'recitem';
    const line = document.createElement('div'); line.className = 'recline';
    const info = document.createElement('div'); info.style.flex = '1'; info.style.minWidth = '0';
    info.innerHTML = '<div class="recname">' + esc(r.name) + '</div><div class="recmeta">' +
      whenStr(r.ts) + ' · ' + mmss(r.durationSec) + ' · ' + r.sizeMB + ' MB · ' + esc(r.source) + (r.mic ? ' + mic' : '') + '</div>';
    const btns = document.createElement('div'); btns.className = 'recbtns';
    const open = mkBtn('Abrir'); if (r.id == null) open.disabled = true; open.addEventListener('click', () => { try { chrome.downloads.open(r.id); } catch (e) { /* ignore */ } });
    const show = mkBtn('Pasta'); if (r.id == null) show.disabled = true; show.addEventListener('click', () => { try { chrome.downloads.show(r.id); } catch (e) { /* ignore */ } });
    const dl = mkBtn('Baixar MP3'); if (!availTs.has(r.ts)) { dl.disabled = true; dl.title = 'Áudio não está mais salvo'; }
    dl.addEventListener('click', async () => {
      try {
        const b = await mxIdbGet(r.ts);
        if (!b) { toast('Áudio não está mais salvo.'); return; }
        const u = URL.createObjectURL(b);
        chrome.downloads.download({ url: u, filename: (r.folder ? r.folder + '/' : '') + r.name, saveAs: false });
      } catch (e) { toast('Erro ao baixar: ' + e.message); }
    });
    btns.appendChild(open); btns.appendChild(show); btns.appendChild(dl);

    // transcrição (desabilita só quando o áudio não está mais salvo; sem chave é tratado no clique)
    if (busyT.has(r.ts)) { const b = mkBtn(progLabel[r.ts] || 'Transcrevendo…'); b.disabled = true; btns.appendChild(b); }
    else if (r.transcript) { const b = mkBtn('Transcrição'); b.addEventListener('click', () => { openT.has(r.ts) ? openT.delete(r.ts) : openT.add(r.ts); render(list); }); btns.appendChild(b); }
    else { const b = mkBtn('Transcrever'); if (!availTs.has(r.ts)) { b.disabled = true; b.title = 'Áudio não está mais salvo'; } b.addEventListener('click', () => doAction(r, 'transcript')); btns.appendChild(b); }

    // resumo
    if (busyS.has(r.ts)) { const b = mkBtn(progLabel[r.ts] || 'Resumindo…'); b.disabled = true; btns.appendChild(b); }
    else if (r.summary) { const b = mkBtn('Resumo'); b.addEventListener('click', () => { openS.has(r.ts) ? openS.delete(r.ts) : openS.add(r.ts); render(list); }); btns.appendChild(b); }
    else { const b = mkBtn('Criar resumo'); b.classList.add('fill'); if (!availTs.has(r.ts)) { b.disabled = true; b.classList.remove('fill'); b.title = 'Áudio não está mais salvo'; } b.addEventListener('click', () => doAction(r, 'summary')); btns.appendChild(b); }

    line.appendChild(info); line.appendChild(btns);
    item.appendChild(line);
    if (openT.has(r.ts) && r.transcript) item.appendChild(buildPanel(r, 'transcript'));
    if (openS.has(r.ts) && r.summary) item.appendChild(buildPanel(r, 'summary'));
    c.appendChild(item);
  });
}
async function doAction(r, kind) {
  // Edge case principal: tentar transcrever/resumir sem chave -> leva pro campo da chave.
  if (!hasKey) {
    toast('Cole a chave do Gemini em Ajustes (te levei pra lá).');
    showTab('cap'); highlightKey();
    return;
  }
  const busy = kind === 'transcript' ? busyT : busyS;
  busy.add(r.ts); setBusyLabel(r.ts, kind === 'transcript' ? 'Transcrevendo…' : 'Resumindo…');

  // precisa dos SEGMENTOS de áudio (uma reunião longa tem várias partes)
  let segs = [];
  try { segs = await mxIdbGetSegs(r.ts); } catch (e) { /* ignore */ }
  if (!segs.length) {
    busy.delete(r.ts); delete progLabel[r.ts];
    toast('Áudio não está mais salvo (guardamos as 12 gravações mais recentes).'); loadRecordings();
    return;
  }
  const onProg = (d, t) => setBusyLabel(r.ts, d >= t ? 'Finalizando…' : ('Transcrevendo parte ' + (d + 1) + '/' + t + '…'));

  if (kind === 'transcript') {
    const res = await mxTranscribeSegments(geminiKey, settings.geminiModel, settings.summaryLang, segs, onProg);
    busy.delete(r.ts); delete progLabel[r.ts];
    if (res.ok) { openT.add(r.ts); updateRec(r.ts, { transcript: res.text }); toast('Transcrição pronta ✓'); loadRecordings(); }
    else finishErr(r, 'transcript', res);
    return;
  }

  // resumo: sai do TEXTO da transcrição já juntada. Se ainda não há transcrição, transcreve antes.
  let transcript = r.transcript;
  if (!transcript) {
    const tr = await mxTranscribeSegments(geminiKey, settings.geminiModel, settings.summaryLang, segs, onProg);
    if (!tr.ok) { busy.delete(r.ts); delete progLabel[r.ts]; finishErr(r, 'summary', tr); return; }
    transcript = tr.text;
    updateRec(r.ts, { transcript }); // aproveita e guarda a transcrição
  }
  setBusyLabel(r.ts, 'Resumindo…');
  const sres = await mxSummarizeTranscript(geminiKey, settings.geminiModel, settings.summaryLang, transcript);
  busy.delete(r.ts); delete progLabel[r.ts];
  if (sres.ok) { openS.add(r.ts); updateRec(r.ts, { summary: sres.text }); toast('Resumo pronto ✓'); loadRecordings(); }
  else finishErr(r, 'summary', sres);
}

// erro pós-ação: 429 (cota) vira cooldown de 30s no botão; senão só avisa.
function finishErr(r, kind, res) {
  const busy = kind === 'transcript' ? busyT : busyS;
  if (/\b429\b/.test(res.error || '')) {
    busy.add(r.ts); progLabel[r.ts] = 'Cota esgotada — aguarde';
    toast('Cota do Gemini esgotada. Espere um pouco e tente de novo.');
    setTimeout(() => { busy.delete(r.ts); delete progLabel[r.ts]; loadRecordings(); }, 30000);
  } else {
    toast((kind === 'transcript' ? 'Transcrição' : 'Resumo') + ': ' + res.error);
  }
  loadRecordings();
}
$('clearRecs').addEventListener('click', async () => {
  chrome.storage.local.set({ recordings: [] });
  try { await mxIdbClear(); } catch (e) { /* ignore */ }
  openT.clear(); openS.clear();
  loadRecordings();
});

// ---------- abas ----------
function showTab(which) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === which));
  $('pane-cap').classList.toggle('hidden', which !== 'cap');
  $('pane-rec').classList.toggle('hidden', which !== 'rec');
  if (which === 'rec') loadRecordings();
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.recordings) render(changes.recordings.newValue || []);
});

// ---------- init ----------
chrome.storage.sync.get(DEFAULTS, (s) => {
  settings = s; reflect();
  chrome.storage.local.get({ geminiKey: '' }, ({ geminiKey: k }) => {
    geminiKey = k; hasKey = !!k; $('geminiKey').value = k;
    updateNoKeyHint(); loadRecordings();
  });
  if (location.hash === '#rec') showTab('rec');
  if (location.hash === '#setup') { $('setupBanner').classList.remove('hidden'); setMic(true); }
});
