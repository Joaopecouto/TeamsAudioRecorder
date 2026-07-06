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
  if (!list.length) { c.innerHTML = '<div class="empty">Nenhuma gravação ainda.</div>'; return; }
  list.forEach((r) => {
    const card = document.createElement('button'); card.className = 'reccard';
    const info = document.createElement('div'); info.className = 'recinfo';
    info.innerHTML = '<div class="recname">' + esc(r.name) + '</div><div class="recmeta">' +
      whenStr(r.ts) + ' · ' + mmss(r.durationSec) + ' · ' + r.sizeMB + ' MB · ' + esc(r.source) + (r.mic ? ' + mic' : '') + '</div>';
    const st = document.createElement('div'); st.className = 'recstatus';
    if (busyT.has(r.ts) || busyS.has(r.ts)) { const t = document.createElement('span'); t.className = 'tag busy'; t.textContent = 'Processando…'; st.appendChild(t); }
    else {
      if (r.transcript) { const t = document.createElement('span'); t.className = 'tag on'; t.textContent = 'Transcrita'; st.appendChild(t); }
      if (r.summary) { const t = document.createElement('span'); t.className = 'tag on'; t.textContent = 'Resumo'; st.appendChild(t); }
    }
    const ch = document.createElement('span'); ch.className = 'chev'; ch.textContent = '›'; st.appendChild(ch);
    card.appendChild(info); card.appendChild(st);
    card.addEventListener('click', () => openDetail(r.ts));
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

// ---- falantes: parse da transcrição em turnos + nomes ----
const SP_COLORS = ['hsl(200 70% 42%)', 'hsl(280 52% 52%)', 'hsl(150 52% 36%)', 'hsl(28 78% 46%)', 'hsl(340 62% 52%)', 'hsl(190 64% 32%)'];
function spColor(i) { return SP_COLORS[((i % SP_COLORS.length) + SP_COLORS.length) % SP_COLORS.length]; }
function isSpeakerLabel(s) {
  s = s.trim();
  if (/^(pessoa|speaker|interlocutor|locutor|participante)\s*\d+$/i.test(s)) return true;
  return s.length <= 32 && /^[A-ZÀ-Ú][\wÀ-ú'’.\-]*(\s+[A-ZÀ-Ú0-9][\wÀ-ú'’.\-]*){0,3}$/.test(s);
}
function parseTurns(text) {
  const lines = String(text || '').split('\n');
  const turns = [];
  const re = /^\s*(?:\*\*|__)?\s*([^:\n]{1,38}?)\s*(?:\*\*|__)?\s*:\s*(.*)$/;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const m = line.match(re);
    if (m && isSpeakerLabel(m[1])) turns.push({ sp: m[1].trim(), text: m[2] });
    else if (turns.length) turns[turns.length - 1].text += '\n' + line;
    else if (line.trim()) turns.push({ sp: '', text: line });
  }
  turns.forEach((t) => { t.text = t.text.replace(/\n{3,}/g, '\n\n').trim(); });
  return turns.filter((t) => t.sp || t.text);
}
function applySpeakers(text, map) {
  if (!map) return text;
  let out = String(text || '');
  for (const label of Object.keys(map)) {
    const name = map[label];
    if (!name || name === label) continue;
    out = out.replace(new RegExp('\\b' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), name);
  }
  return out;
}
function plainTranscript(r) { return applySpeakers(r.transcript || '', r.speakers); }

// ---- painel esquerdo: player de áudio + participantes nomeáveis + ações ----
function detLeft(r) {
  const left = document.createElement('div'); left.className = 'detleft';

  if (availTs.has(r.ts)) left.appendChild(getAudio(r));
  else { const d = document.createElement('div'); d.className = 'dempty'; d.textContent = 'Áudio não está mais salvo (guardamos as 12 gravações mais recentes).'; left.appendChild(d); }

  const speakers = [...new Set(parseTurns(r.transcript || '').map((t) => t.sp).filter(Boolean))];
  const box = document.createElement('div'); box.className = 'parts';
  const h = document.createElement('h5'); h.textContent = 'Participantes'; box.appendChild(h);
  const hint = document.createElement('p'); hint.className = 'phint';
  if (!r.transcript) hint.textContent = 'Transcreva para identificar as pessoas e dar nomes a elas.';
  else if (!speakers.length) hint.textContent = 'Não deu para separar os falantes nesta gravação.';
  else hint.textContent = 'Dê um nome a cada voz — aparece na transcrição e no resumo.';
  box.appendChild(hint);
  speakers.forEach((sp, i) => {
    const row = document.createElement('div'); row.className = 'part';
    const dot = document.createElement('span'); dot.className = 'pdot'; dot.style.background = spColor(i);
    const inp = document.createElement('input'); inp.type = 'text'; inp.value = (r.speakers || {})[sp] || ''; inp.placeholder = sp;
    inp.addEventListener('change', () => {
      const nm = Object.assign({}, r.speakers || {});
      const v = inp.value.trim();
      if (v) nm[sp] = v; else delete nm[sp];
      updateRec(r.ts, { speakers: nm });
    });
    row.appendChild(dot); row.appendChild(inp); box.appendChild(row);
  });
  left.appendChild(box);

  const acts = document.createElement('div'); acts.className = 'detacts';
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
  acts.appendChild(open); acts.appendChild(show); acts.appendChild(dl);
  left.appendChild(acts);
  return left;
}

// ---- transcrição em estilo chat (falante colorido) + busca ----
function renderTranscript(pane, r) {
  const turns = parseTurns(r.transcript);
  const map = r.speakers || {};
  const distinct = [...new Set(turns.map((t) => t.sp).filter(Boolean))];

  const search = document.createElement('input'); search.className = 'tsearch'; search.type = 'text'; search.placeholder = 'Buscar na transcrição…';
  pane.appendChild(search);
  const chat = document.createElement('div'); chat.className = 'chat';
  turns.forEach((t) => {
    const row = document.createElement('div'); row.className = 'turn';
    if (t.sp) { const nm = document.createElement('div'); nm.className = 'turnsp'; nm.textContent = map[t.sp] || t.sp; nm.style.color = spColor(distinct.indexOf(t.sp)); row.appendChild(nm); }
    const tx = document.createElement('div'); tx.className = 'turntext'; tx.textContent = t.text; row.appendChild(tx);
    chat.appendChild(row);
  });
  pane.appendChild(chat);
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    chat.querySelectorAll('.turn').forEach((row) => row.classList.toggle('hide', !!q && row.textContent.toLowerCase().indexOf(q) === -1));
  });
}

// ---- conteúdo de uma aba (transcrição=chat, resumo=markdown), com 3 estados ----
function tabPane(r, kind) {
  const isT = kind === 'transcript';
  const text = isT ? r.transcript : r.summary;
  const pane = document.createElement('div'); pane.className = 'detpane';

  if ((isT ? busyT : busyS).has(r.ts)) {
    const p = document.createElement('div'); p.className = 'prog';
    const sp = document.createElement('span'); sp.className = 'spinner';
    const tx = document.createElement('span'); tx.textContent = progLabel[r.ts] || (isT ? 'Transcrevendo…' : 'Resumindo…');
    p.appendChild(sp); p.appendChild(tx); pane.appendChild(p);
    return pane;
  }
  if (!text) {
    const d = document.createElement('div'); d.className = 'dempty';
    d.textContent = isT ? 'Ainda não transcrita. A extensão manda o áudio ao Gemini em partes e junta o texto.' : 'Ainda sem resumo. Sai da transcrição: resumo executivo, decisões, itens de ação e próximos passos.';
    pane.appendChild(d);
    const btn = mkBtn(isT ? 'Transcrever' : 'Criar resumo'); btn.classList.add('fill');
    if (!availTs.has(r.ts)) { btn.disabled = true; btn.classList.remove('fill'); btn.title = 'Áudio não está mais salvo'; }
    btn.addEventListener('click', () => doAction(r, kind));
    pane.appendChild(btn);
    return pane;
  }

  if (isT) renderTranscript(pane, r);
  else { const md = document.createElement('div'); md.className = 'md'; md.innerHTML = mxMarkdown(applySpeakers(text, r.speakers)); pane.appendChild(md); }

  const a = document.createElement('div'); a.className = 'dacts';
  const copyText = isT ? plainTranscript(r) : text;
  const cp = mkBtn('Copiar'); cp.addEventListener('click', () => { navigator.clipboard.writeText(copyText); cp.textContent = 'Copiado ✓'; setTimeout(() => (cp.textContent = 'Copiar'), 1200); });
  const bd = mkBtn('Baixar'); bd.addEventListener('click', () => dlText(r, kind, copyText));
  const re = mkBtn('Refazer'); if (!availTs.has(r.ts)) { re.disabled = true; re.title = 'Áudio não está mais salvo'; } re.addEventListener('click', () => doAction(r, kind));
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
  tabs.appendChild(mkTab('transcript', 'Transcrição'));
  tabs.appendChild(mkTab('summary', 'Resumo'));
  right.appendChild(tabs);
  right.appendChild(tabPane(r, detailTab));
  return right;
}

// ---- detalhe: voltar + cabeçalho + (player+participantes | abas) ----
function renderDetail(r) {
  const c = $('recList'); c.innerHTML = '';
  const back = document.createElement('button'); back.className = 'back';
  back.textContent = '← Voltar para gravações';
  back.addEventListener('click', backToList);
  c.appendChild(back);

  const head = document.createElement('div'); head.className = 'dethead';
  head.innerHTML = '<div class="detname">' + esc(r.name) + '</div><div class="detmeta">' +
    whenStr(r.ts) + ' · ' + mmss(r.durationSec) + ' · ' + r.sizeMB + ' MB · ' + esc(r.source) + (r.mic ? ' + microfone' : '') + '</div>';
  c.appendChild(head);

  const main = document.createElement('div'); main.className = 'detmain';
  main.appendChild(detLeft(r));
  main.appendChild(detRight(r));
  c.appendChild(main);
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

  // pega o ARQUIVO INTEIRO e fatia em partes SÓ para transcrever (o arquivo salvo fica intacto)
  let blob = null;
  try { blob = await mxIdbGet(r.ts); } catch (e) { /* ignore */ }
  if (!blob) {
    busy.delete(r.ts); delete progLabel[r.ts];
    toast('Áudio não está mais salvo (guardamos as 12 gravações mais recentes).'); loadRecordings();
    return;
  }
  const chunks = mxChunksFromBlob(blob, r.chunkBytes);
  const onProg = (d, t) => setBusyLabel(r.ts, d >= t ? 'Finalizando…' : ('Transcrevendo parte ' + (d + 1) + '/' + t + '…'));

  if (kind === 'transcript') {
    const res = await mxTranscribeSegments(geminiKey, settings.geminiModel, settings.summaryLang, chunks, onProg);
    busy.delete(r.ts); delete progLabel[r.ts];
    if (res.ok) { updateRec(r.ts, { transcript: res.text }); toast('Transcrição pronta ✓'); loadRecordings(); }
    else finishErr(r, 'transcript', res);
    return;
  }

  // resumo: sai do TEXTO da transcrição já juntada. Se ainda não há transcrição, transcreve antes.
  let transcript = r.transcript;
  if (!transcript) {
    const tr = await mxTranscribeSegments(geminiKey, settings.geminiModel, settings.summaryLang, chunks, onProg);
    if (!tr.ok) { busy.delete(r.ts); delete progLabel[r.ts]; finishErr(r, 'summary', tr); return; }
    transcript = tr.text;
    updateRec(r.ts, { transcript }); // aproveita e guarda a transcrição
  }
  setBusyLabel(r.ts, 'Resumindo…');
  const sres = await mxSummarizeTranscript(geminiKey, settings.geminiModel, settings.summaryLang, transcript);
  busy.delete(r.ts); delete progLabel[r.ts];
  if (sres.ok) { updateRec(r.ts, { summary: sres.text }); toast('Resumo pronto ✓'); loadRecordings(); }
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
  if (which === 'rec') { detailTs = null; setWide(false); loadRecordings(); }
  else setWide(false);
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
