const DEFAULTS = {
  bitrate: 96, audioSource: 'system', micEnabled: false, micGain: 2, micDeviceId: '',
  subfolder: 'Reuniões', askWhereToSave: false,
  filenamePrefix: 'reuniao', dateFormat: 'AAAAMMDD-hhmm',
  showPill: true, pillCorner: 'bottom-right', domMeet: true, domTeams: true,
  autoSummary: false, summaryLang: 'auto', geminiModel: 'gemini-2.5-flash', pillSound: true, uiLang: 'auto'
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
  const el = $('saved'); el.textContent = text || mxt('saved_toast');
  el.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

// ---------- settings ----------
function updatePreview() {
  const name = mxFilename($('filenamePrefix').value, $('dateFormat').value, '.mp3');
  $('fmtPreview').textContent = (settings.subfolder ? settings.subfolder + '/' : '') + name;
}
function reflect() {
  $('uiLang').value = settings.uiLang || 'auto';
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
$('uiLang').addEventListener('change', () => {
  settings.uiLang = $('uiLang').value;
  chrome.storage.sync.set({ uiLang: settings.uiLang });
  mxSetLang(settings.uiLang); mxApplyI18n(document);
  updatePreview(); loadRecordings();
});
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
    $('micNote').textContent = mics.some((m) => m.label) ? mxt('mic_note_used') : mxt('mic_note_auth');
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
async function deleteRec(ts, name) {
  if (!confirm(mxt('confirm_delete', name || ''))) return;
  const st = await new Promise((res) => chrome.storage.local.get({ recordings: [] }, res));
  await new Promise((res) => chrome.storage.local.set({ recordings: st.recordings.filter((r) => r.ts !== ts) }, res));
  try { await mxIdbDelete(ts); } catch (e) { /* ignore */ }
  if (detailTs === ts) { detailTs = null; setWide(false); clearAudio(); }
  loadRecordings();
  toast(mxt('t_deleted'));
}

let detailTs = null; // ts da gravação aberta em detalhe; null = mostrando a lista
function setWide(on) { const w = document.querySelector('.wrap'); if (w) w.classList.toggle('wide', !!on); }
function openDetail(ts) { detailTs = ts; detailTab = 'transcript'; setWide(true); window.scrollTo(0, 0); loadRecordings(); }
function backToList() { detailTs = null; setWide(false); clearAudio(); loadRecordings(); }

function render(list) {
  updateNoKeyHint();
  const rh = document.querySelector('.rechead');
  if (detailTs != null) {
    const rec = list.find((r) => r.ts === detailTs);
    if (rec) { if (rh) rh.style.display = 'none'; renderDetail(rec); return; }
    detailTs = null; setWide(false); // a gravação sumiu -> volta pra lista
  }
  if (rh) rh.style.display = 'flex';
  renderList(list);
}

// ---- lista: cards clicáveis, nome/meta em 1 linha (nunca quebra vertical) ----
function renderList(list) {
  const c = $('recList'); c.innerHTML = '';
  if (!list.length) { c.innerHTML = '<div class="empty">' + mxt('no_recordings') + '</div>'; return; }
  list.forEach((r) => {
    const card = document.createElement('div'); card.className = 'reccard'; card.setAttribute('role', 'button'); card.tabIndex = 0;
    const info = document.createElement('div'); info.className = 'recinfo';
    info.innerHTML = '<div class="recname">' + esc(r.name) + '</div><div class="recmeta">' +
      whenStr(r.ts) + ' · ' + mmss(r.durationSec) + ' · ' + r.sizeMB + ' MB · ' + esc(r.source) + (r.mic ? ' + mic' : '') + '</div>';
    const st = document.createElement('div'); st.className = 'recstatus';
    if (busyT.has(r.ts) || busyS.has(r.ts)) { const t = document.createElement('span'); t.className = 'tag busy'; t.textContent = mxt('st_processing'); st.appendChild(t); }
    else {
      if (r.transcript) { const t = document.createElement('span'); t.className = 'tag on'; t.textContent = mxt('st_transcribed'); st.appendChild(t); }
      if (r.summary) { const t = document.createElement('span'); t.className = 'tag on'; t.textContent = mxt('st_summary'); st.appendChild(t); }
    }
    const del = document.createElement('button'); del.className = 'recdel'; del.title = mxt('del_rec_title');
    del.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteRec(r.ts, r.name); });
    st.appendChild(del);
    const ch = document.createElement('span'); ch.className = 'chev'; ch.textContent = '›'; st.appendChild(ch);
    card.appendChild(info); card.appendChild(st);
    card.addEventListener('click', () => openDetail(r.ts));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.ts); } });
    c.appendChild(card);
  });
}

function dlText(r, kind, text) {
  const ext = kind === 'transcript' ? '-transcricao.txt' : '-resumo.md';
  const mt = kind === 'transcript' ? 'text/plain' : 'text/markdown';
  const u = URL.createObjectURL(new Blob([text], { type: mt }));
  chrome.downloads.download({ url: u, filename: (r.folder ? r.folder + '/' : '') + r.name.replace(/\.mp3$/, '') + ext, saveAs: false });
}

let detailTab = 'transcript'; // aba ativa no detalhe
let audioTs = null, audioEl = null, audioUrl = null;

// player de áudio reaproveitado entre re-renders (não reinicia a reprodução)
function getAudio(r) {
  if (audioTs === r.ts && audioEl) return audioEl;
  clearAudio();
  audioTs = r.ts;
  audioEl = document.createElement('audio'); audioEl.className = 'aud'; audioEl.controls = true; audioEl.preload = 'metadata';
  const forTs = r.ts;
  mxIdbGet(r.ts).then((b) => { if (b && audioTs === forTs && audioEl) { audioUrl = URL.createObjectURL(b); audioEl.src = audioUrl; } }).catch(() => {});
  return audioEl;
}
function clearAudio() { if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch (e) { /* ignore */ } } audioTs = null; audioEl = null; audioUrl = null; }

// ---- cabeçalho (largura total): nome/meta + player de áudio + ações ----
function detHeader(r) {
  const head = document.createElement('div'); head.className = 'dethead2';

  const info = document.createElement('div'); info.className = 'dinfo';
  info.innerHTML = '<div class="detname">' + esc(r.name) + '</div><div class="detmeta">' +
    whenStr(r.ts) + ' · ' + mmss(r.durationSec) + ' · ' + r.sizeMB + ' MB · ' + esc(r.source) + (r.mic ? ' + microfone' : '') + '</div>';
  head.appendChild(info);

  const row = document.createElement('div'); row.className = 'dplayer';
  if (availTs.has(r.ts)) row.appendChild(getAudio(r));
  else { const d = document.createElement('div'); d.className = 'dempty'; d.textContent = mxt('t_audio_gone'); row.appendChild(d); }

  const acts = document.createElement('div'); acts.className = 'detacts';
  const open = mkBtn(mxt('d_open')); if (r.id == null) open.disabled = true; open.addEventListener('click', () => { try { chrome.downloads.open(r.id); } catch (e) { /* ignore */ } });
  const show = mkBtn(mxt('d_folder')); if (r.id == null) show.disabled = true; show.addEventListener('click', () => { try { chrome.downloads.show(r.id); } catch (e) { /* ignore */ } });
  const dl = mkBtn(mxt('d_download_mp3')); if (!availTs.has(r.ts)) { dl.disabled = true; dl.title = mxt('audio_gone'); }
  dl.addEventListener('click', async () => {
    try {
      const b = await mxIdbGet(r.ts);
      if (!b) { toast(mxt('audio_gone')); return; }
      const u = URL.createObjectURL(b);
      chrome.downloads.download({ url: u, filename: (r.folder ? r.folder + '/' : '') + r.name, saveAs: false });
    } catch (e) { toast(mxt('t_download_err') + e.message); }
  });
  const del = mkBtn(mxt('d_delete')); del.classList.add('danger'); del.addEventListener('click', () => deleteRec(r.ts, r.name));
  acts.appendChild(open); acts.appendChild(show); acts.appendChild(dl); acts.appendChild(del);
  row.appendChild(acts);
  head.appendChild(row);
  return head;
}

// ---- conteúdo de uma aba (transcrição=texto, resumo=markdown), com 3 estados ----
function tabPane(r, kind) {
  const isT = kind === 'transcript';
  const text = isT ? r.transcript : r.summary;
  const pane = document.createElement('div'); pane.className = 'detpane';

  if ((isT ? busyT : busyS).has(r.ts)) {
    const p = document.createElement('div'); p.className = 'prog';
    const sp = document.createElement('span'); sp.className = 'spinner';
    const tx = document.createElement('span'); tx.textContent = progLabel[r.ts] || (isT ? mxt('prog_transcribing') : mxt('prog_summarizing'));
    p.appendChild(sp); p.appendChild(tx); pane.appendChild(p);
    return pane;
  }
  if (!text) {
    const d = document.createElement('div'); d.className = 'dempty';
    d.textContent = isT ? mxt('empty_transcript') : mxt('empty_summary');
    pane.appendChild(d);
    const btn = mkBtn(isT ? mxt('btn_transcribe') : mxt('btn_create_summary')); btn.classList.add('fill');
    if (!availTs.has(r.ts)) { btn.disabled = true; btn.classList.remove('fill'); btn.title = mxt('audio_gone'); }
    btn.addEventListener('click', () => doAction(r, kind));
    pane.appendChild(btn);
    return pane;
  }

  if (isT) { const t = document.createElement('div'); t.className = 'dtext'; t.textContent = text; pane.appendChild(t); }
  else { const md = document.createElement('div'); md.className = 'md'; md.innerHTML = mxMarkdown(text); pane.appendChild(md); }

  const a = document.createElement('div'); a.className = 'dacts';
  const copyText = text;
  const cp = mkBtn(mxt('d_copy')); cp.addEventListener('click', () => { navigator.clipboard.writeText(copyText); cp.textContent = mxt('d_copied'); setTimeout(() => (cp.textContent = mxt('d_copy')), 1200); });
  const bd = mkBtn(mxt('d_download')); bd.addEventListener('click', () => dlText(r, kind, copyText));
  const re = mkBtn(mxt('d_redo')); if (!availTs.has(r.ts)) { re.disabled = true; re.title = mxt('audio_gone'); } re.addEventListener('click', () => doAction(r, kind));
  a.appendChild(cp); a.appendChild(bd); a.appendChild(re);
  pane.appendChild(a);
  return pane;
}

// ---- painel direito: abas Transcrição | Resumo ----
function detRight(r) {
  const right = document.createElement('div'); right.className = 'detright';
  const tabs = document.createElement('div'); tabs.className = 'rtabs';
  const mkTab = (key, label) => {
    const b = document.createElement('button'); b.className = 'rtab' + (detailTab === key ? ' on' : ''); b.textContent = label;
    b.addEventListener('click', () => { detailTab = key; loadRecordings(); });
    return b;
  };
  tabs.appendChild(mkTab('transcript', mxt('tab_transcript')));
  tabs.appendChild(mkTab('summary', mxt('tab_summary')));
  right.appendChild(tabs);
  right.appendChild(tabPane(r, detailTab));
  return right;
}

// ---- detalhe: voltar + cabeçalho + (player+participantes | abas) ----
function renderDetail(r) {
  const c = $('recList'); c.innerHTML = '';
  const back = document.createElement('button'); back.className = 'back';
  back.textContent = mxt('back_to_recordings');
  back.addEventListener('click', backToList);
  c.appendChild(back);

  c.appendChild(detHeader(r));
  c.appendChild(detRight(r));
}
async function doAction(r, kind) {
  // Edge case principal: tentar transcrever/resumir sem chave -> leva pro campo da chave.
  if (!hasKey) {
    toast(mxt('t_no_key'));
    showTab('cap'); highlightKey();
    return;
  }
  const busy = kind === 'transcript' ? busyT : busyS;
  busy.add(r.ts); setBusyLabel(r.ts, kind === 'transcript' ? mxt('prog_transcribing') : mxt('prog_summarizing'));

  // pega o ARQUIVO INTEIRO e fatia em partes SÓ para transcrever (o arquivo salvo fica intacto)
  let blob = null;
  try { blob = await mxIdbGet(r.ts); } catch (e) { /* ignore */ }
  if (!blob) {
    busy.delete(r.ts); delete progLabel[r.ts];
    toast(mxt('t_audio_gone')); loadRecordings();
    return;
  }
  const chunks = mxChunksFromBlob(blob, r.chunkBytes);
  const lang = mxTargetLang(settings.summaryLang, settings.uiLang);
  const onProg = (d, t) => setBusyLabel(r.ts, d >= t ? mxt('prog_finishing') : mxt('prog_part', d + 1, t));

  if (kind === 'transcript') {
    const res = await mxTranscribeSegments(geminiKey, settings.geminiModel, lang, chunks, onProg);
    busy.delete(r.ts); delete progLabel[r.ts];
    if (res.ok) { updateRec(r.ts, { transcript: res.text }); toast(mxt('t_transcript_ready')); loadRecordings(); }
    else finishErr(r, 'transcript', res);
    return;
  }

  // resumo: sai do TEXTO da transcrição já juntada. Se ainda não há transcrição, transcreve antes.
  let transcript = r.transcript;
  if (!transcript) {
    const tr = await mxTranscribeSegments(geminiKey, settings.geminiModel, lang, chunks, onProg);
    if (!tr.ok) { busy.delete(r.ts); delete progLabel[r.ts]; finishErr(r, 'summary', tr); return; }
    transcript = tr.text;
    updateRec(r.ts, { transcript }); // aproveita e guarda a transcrição
  }
  setBusyLabel(r.ts, mxt('prog_summarizing'));
  const sres = await mxSummarizeTranscript(geminiKey, settings.geminiModel, lang, transcript);
  busy.delete(r.ts); delete progLabel[r.ts];
  if (sres.ok) { updateRec(r.ts, { summary: sres.text }); toast(mxt('t_summary_ready')); loadRecordings(); }
  else finishErr(r, 'summary', sres);
}

// erro pós-ação: 429 (cota) vira cooldown de 30s no botão; senão só avisa.
function finishErr(r, kind, res) {
  const busy = kind === 'transcript' ? busyT : busyS;
  if (/\b429\b/.test(res.error || '')) {
    busy.add(r.ts); progLabel[r.ts] = mxt('t_quota_wait');
    toast(mxt('t_quota'));
    setTimeout(() => { busy.delete(r.ts); delete progLabel[r.ts]; loadRecordings(); }, 30000);
  } else {
    toast(mxt(kind === 'transcript' ? 't_transcript' : 't_summary') + ': ' + res.error);
  }
  loadRecordings();
}
$('clearRecs').addEventListener('click', async () => {
  if (!confirm(mxt('confirm_clear'))) return;
  chrome.storage.local.set({ recordings: [] });
  try { await mxIdbClear(); } catch (e) { /* ignore */ }
  openT.clear(); openS.clear();
  detailTs = null; setWide(false); clearAudio();
  loadRecordings();
});

// ---------- importar MP3 do disco (sincroniza com os arquivos da pasta) ----------
// A extensão NÃO lê a pasta sozinha (segurança do Chrome); o usuário seleciona os arquivos.
// Re-vincula pelo NOME às gravações antigas cujo áudio sumiu do banco; o resto vira nova entrada.
function audioDuration(blob) {
  return new Promise((resolve) => {
    const a = document.createElement('audio'); a.preload = 'metadata';
    const url = URL.createObjectURL(blob);
    a.onloadedmetadata = () => { const d = a.duration; try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } resolve(isFinite(d) ? Math.round(d) : 0); };
    a.onerror = () => { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } resolve(0); };
    a.src = url;
  });
}
async function importFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => /\.mp3$/i.test(f.name) || f.type === 'audio/mpeg');
  if (!files.length) { toast(mxt('t_import_pick')); return; }
  toast(mxt('t_importing'));
  const st = await new Promise((res) => chrome.storage.local.get({ recordings: [] }, res));
  const recs = st.recordings.slice();
  let novas = 0, revinc = 0;
  for (const file of files) {
    let entry = recs.find((r) => r.name === file.name);
    let ts;
    if (entry) { ts = entry.ts; revinc++; }
    else {
      ts = file.lastModified || Date.now();
      while (recs.some((r) => r.ts === ts)) ts++;
      const durationSec = await audioDuration(file);
      entry = { id: null, name: file.name, folder: '', sizeMB: +(file.size / (1024 * 1024)).toFixed(1), ts, durationSec, source: mxt('src_imported'), mic: false, chunkBytes: [], summary: '', transcript: '' };
      recs.unshift(entry); novas++;
    }
    try { await mxIdbPut(ts, file); } catch (e) { toast('Erro ao guardar ' + file.name + ': ' + e.message); }
  }
  recs.sort((a, b) => b.ts - a.ts);
  await new Promise((res) => chrome.storage.local.set({ recordings: recs.slice(0, 50) }, res));
  loadRecordings();
  toast(mxt('t_import_done', revinc, novas));
}
$('importRecs').addEventListener('click', () => $('importInput').click());
$('importInput').addEventListener('change', (e) => { importFiles(e.target.files); e.target.value = ''; });

// ---------- onboarding (primeiro uso) ----------
function openOnboarding() {
  const ov = $('obOverlay');
  $('obMicSt').textContent = ''; $('obNotifSt').textContent = '';
  $('obNotifYN').classList.add('hidden'); $('obNotifTip').classList.add('hidden');
  $('obKey').value = geminiKey || '';
  mxApplyI18n(ov);
  ov.classList.remove('hidden');
}
function closeOnboarding() { $('obOverlay').classList.add('hidden'); }
$('obClose').addEventListener('click', closeOnboarding);
$('obLater').addEventListener('click', closeOnboarding);
$('obDone').addEventListener('click', closeOnboarding);
$('obReopen').addEventListener('click', openOnboarding);
$('obMic').addEventListener('click', async () => {
  $('obMicSt').textContent = '…';
  const ok = await requestMic();
  if (ok) { settings.micEnabled = true; chrome.storage.sync.set({ micEnabled: true }); $('micSwitch').checked = true; await listMics(); $('obMicSt').textContent = mxt('ob_mic_ok'); }
  else $('obMicSt').textContent = mxt('ob_mic_no');
});
$('obNotif').addEventListener('click', () => {
  $('obNotifSt').textContent = '…'; $('obNotifTip').classList.add('hidden'); $('obNotifYN').classList.add('hidden');
  chrome.runtime.sendMessage({ type: 'TEST_NOTIF', title: mxt('ob_test_title'), message: mxt('ob_test_msg') }, (res) => {
    if (chrome.runtime.lastError || !res || !res.ok) { $('obNotifSt').textContent = mxt('ob_notif_fail'); $('obNotifTip').classList.remove('hidden'); return; }
    $('obNotifSt').textContent = ''; $('obNotifYN').classList.remove('hidden');
  });
});
$('obNotifYes').addEventListener('click', () => { $('obNotifYN').classList.add('hidden'); $('obNotifSt').textContent = mxt('ob_notif_ok'); });
$('obNotifNo').addEventListener('click', () => { $('obNotifYN').classList.add('hidden'); $('obNotifTip').classList.remove('hidden'); });
$('obKey').addEventListener('input', () => { geminiKey = $('obKey').value.trim(); hasKey = !!geminiKey; chrome.storage.local.set({ geminiKey }); $('geminiKey').value = geminiKey; updateNoKeyHint(); });
$('obGetKey').addEventListener('click', () => chrome.tabs.create({ url: 'https://aistudio.google.com/apikey' }));

// ---------- abas ----------
function showTab(which) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === which));
  $('pane-cap').classList.toggle('hidden', which !== 'cap');
  $('pane-rec').classList.toggle('hidden', which !== 'rec');
  if (which === 'rec') { detailTs = null; setWide(false); loadRecordings(); }
  else setWide(false);
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

// se a página já estiver aberta e a notificação mudar o hash (#rec=<ts>), reage sem recarregar
window.addEventListener('hashchange', () => {
  const m = (location.hash || '').match(/#rec=(\d+)/);
  if (m) { showTab('rec'); openDetail(Number(m[1])); }
  else if ((location.hash || '').indexOf('#rec') === 0) showTab('rec');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.recordings) render(changes.recordings.newValue || []);
});

// ---------- init ----------
chrome.storage.sync.get(DEFAULTS, (s) => {
  settings = s; mxSetLang(settings.uiLang); mxApplyI18n(document); reflect();
  chrome.storage.local.get({ geminiKey: '' }, ({ geminiKey: k }) => {
    geminiKey = k; hasKey = !!k; $('geminiKey').value = k;
    updateNoKeyHint(); loadRecordings();
  });
  const hash = location.hash || '';
  if (hash.indexOf('#rec') === 0) {
    showTab('rec');
    const m = hash.match(/#rec=(\d+)/);
    if (m) openDetail(Number(m[1]));
  }
  if (hash === '#setup') openOnboarding();
});
