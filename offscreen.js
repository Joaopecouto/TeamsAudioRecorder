// Offscreen document: SÓ mídia. Captura o áudio do SISTEMA (getDisplayMedia) + microfone,
// mixa, e CODIFICA MP3 EM TEMPO REAL (ScriptProcessor -> lamejs), bloco a bloco.
//
// POR QUE assim: o caminho antigo (MediaRecorder -> webm inteiro -> decodeAudioData ->
// OfflineAudioContext -> lamejs no fim) carregava a gravação INTEIRA em PCM na memória.
// A partir de ~10 min isso estoura o processo (centenas de MB a GBs) e o Chrome MATA o
// offscreen SEM exceção capturável -> a gravação sumia em silêncio. Codificando ao vivo,
// a memória fica CONSTANTE (só o buffer do encoder), independente da duração.
//
// Streaming também dá de graça os SEGMENTOS: a cada ~N min o encoder rotaciona e vira um
// MP3 independente, salvo já no IndexedDB (durável) e pronto para transcrever em partes.
// O sampleRate:44100 no AudioContext só evita reamostrar na mão (o Chrome reamostra as
// fontes 48k->44.1k sozinho); quem mata o OOM é o streaming, não a taxa.

let ctx = null;
let captureStream = null;
let micStream = null;
let scriptNode = null;
let sinkGain = null;
let encoder = null;

let bitrate = 96;
let micUsed = false;
let srcLabel = 'Sistema';

let recTs = 0;            // id da gravação (chave dos segmentos no IDB)
let sampleRate = 44100;
let samplesPerSegment = 0;

let carry = new Float32Array(0); // sobra de PCM (<1152) entre callbacks
let segBytes = [];               // Uint8Array[] do segmento atual
let segmentBlobs = [];           // Blob[] de todos os segmentos (p/ montar o MP3 completo)
let segIndex = 0;
let samplesInSeg = 0;
let totalSamples = 0;
let blocksProcessed = 0;         // watchdog: precisa avançar durante a gravação
let watchdog = null;
let lastWatch = -1;
let stopping = false;

const FRAME = 1152;              // o lamejs trabalha em múltiplos de 1152 samples

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return;
  if (msg.type === 'OFFSCREEN_START') { start(msg).then((r) => sendResponse(r)); return true; }
  if (msg.type === 'OFFSCREEN_STOP') stop();
});

// O seletor de tela/aba abre AQUI no offscreen (getDisplayMedia), isolado do service worker.
// Pegamos só o áudio (largamos o vídeo).
async function getDisplay() {
  const st = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  st.getVideoTracks().forEach((t) => t.stop());
  if (!st.getAudioTracks().length) {
    st.getTracks().forEach((t) => t.stop());
    throw new Error('Sem áudio — ao escolher a tela/aba, marque "Compartilhar áudio do sistema/da guia".');
  }
  return st;
}
async function getMic(deviceId) {
  const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (deviceId) {
    try { return await navigator.mediaDevices.getUserMedia({ audio: Object.assign({}, base, { deviceId: { exact: deviceId } }) }); }
    catch (e) { /* aparelho indisponível -> tenta o padrão */ }
  }
  return navigator.mediaDevices.getUserMedia({ audio: base });
}

function floatToInt16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

async function start(opts) {
  try {
    bitrate = opts.bitrate || 96;

    // 1) captura ANTES de criar o contexto -> a "active capture session" libera o autoplay
    captureStream = await getDisplay();
    micUsed = false;
    if (opts.micEnabled) {
      try { micStream = await getMic(opts.micDeviceId); micUsed = true; }
      catch (err) {
        const n = err && err.name;
        const w = (n === 'NotAllowedError' || n === 'PermissionDeniedError') ? 'Permissão do microfone negada — gravando só o áudio do sistema.'
          : (n === 'NotFoundError') ? 'Microfone não encontrado — gravando só o áudio do sistema.'
            : 'Microfone indisponível — gravando só o áudio do sistema.';
        chrome.runtime.sendMessage({ type: 'OFFSCREEN_WARN', warn: w }).catch(() => {});
      }
    }

    // 2) contexto a 44100 + resume (offscreen pode nascer suspenso)
    ctx = new AudioContext({ sampleRate: 44100 });
    await ctx.resume();
    if (ctx.state !== 'running') {
      cleanup();
      return { ok: false, error: 'o áudio não iniciou (contexto suspenso). Recarregue a extensão e tente de novo.' };
    }
    sampleRate = ctx.sampleRate; // normalmente 44100; se o hardware forçar outra, respeitamos

    // 3) mix: sistema + microfone(ganho)
    const mix = ctx.createGain();
    ctx.createMediaStreamSource(captureStream).connect(mix);
    if (micStream) {
      const mg = ctx.createGain();
      mg.gain.value = opts.micGain || 2; // mic costuma sair mais baixo que a página
      ctx.createMediaStreamSource(micStream).connect(mg);
      mg.connect(mix);
    }

    // 4) ScriptProcessor mono lê o PCM; sink em gain 0 (offscreen não emite som).
    //    A conexão até ctx.destination é OBRIGATÓRIA para o onaudioprocess disparar.
    scriptNode = ctx.createScriptProcessor(16384, 1, 1);
    sinkGain = ctx.createGain(); sinkGain.gain.value = 0;
    mix.connect(scriptNode);
    scriptNode.connect(sinkGain);
    sinkGain.connect(ctx.destination);

    // 5) encoder + tamanho do segmento derivado do bitrate p/ cada parte ficar < ~11 MB
    //    (folga sob o limite inline do Gemini). Fonte única de verdade: esta fórmula.
    const TARGET_BYTES = 11 * 1024 * 1024;
    const secPerSeg = Math.max(60, Math.floor((TARGET_BYTES * 8) / (bitrate * 1000)));
    samplesPerSegment = secPerSeg * sampleRate;

    encoder = new lamejs.Mp3Encoder(1, sampleRate, bitrate);
    carry = new Float32Array(0);
    segBytes = []; segmentBlobs = []; segIndex = 0; samplesInSeg = 0; totalSamples = 0; blocksProcessed = 0;
    recTs = Date.now(); stopping = false;

    scriptNode.onaudioprocess = onAudio;

    // se o usuário fechar a aba/janela compartilhada, o track encerra -> finalizamos limpo
    const at = captureStream.getAudioTracks()[0];
    if (at) at.onended = () => { if (!stopping) stop(); };

    // watchdog: os blocos TÊM que avançar; se travarem (áudio parou de fluir), aborta
    lastWatch = -1;
    watchdog = setInterval(() => {
      if (stopping) return;
      if (blocksProcessed === lastWatch) {
        chrome.runtime.sendMessage({ type: 'OFFSCREEN_ERROR', error: 'o áudio parou de fluir (captura interrompida).' }).catch(() => {});
        stop();
        return;
      }
      lastWatch = blocksProcessed;
    }, 5000);

    srcLabel = 'Sistema';
    return { ok: true };
  } catch (e) {
    cleanup();
    return { ok: false, error: 'captura: ' + ((e && e.message) || e) };
  }
}

function onAudio(e) {
  if (stopping || !encoder) return;
  const input = e.inputBuffer.getChannelData(0); // Float32 mono, já em sampleRate
  blocksProcessed++;

  // junta a sobra anterior + o bloco atual e drena em fatias de 1152 (bounded: sobra < 1152)
  let buf;
  if (carry.length) { buf = new Float32Array(carry.length + input.length); buf.set(carry, 0); buf.set(input, carry.length); }
  else buf = input;

  let off = 0;
  while (buf.length - off >= FRAME) {
    const mp3 = encoder.encodeBuffer(floatToInt16(buf.subarray(off, off + FRAME)));
    if (mp3.length) segBytes.push(new Uint8Array(mp3));
    off += FRAME; samplesInSeg += FRAME; totalSamples += FRAME;
  }
  carry = buf.subarray(off).slice(); // guarda a sobra (<1152), copiada

  if (samplesInSeg >= samplesPerSegment) rotateSegment(false);
}

// fecha o segmento atual: flush do encoder, salva o blob no IDB, e (se não for o último)
// cria um encoder novo. flush() garante que o segmento termina num limite de frame limpo.
function rotateSegment(isFinal) {
  const tail = encoder.flush();
  if (tail.length) segBytes.push(new Uint8Array(tail));
  const blob = new Blob(segBytes, { type: 'audio/mpeg' });
  segmentBlobs.push(blob);
  const idx = segIndex;
  const p = mxIdbPutSeg(recTs, idx, blob).catch((err) => {
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_WARN', warn: 'não consegui guardar uma parte do áudio: ' + err.message }).catch(() => {});
  });

  segIndex++; segBytes = []; samplesInSeg = 0;
  if (!isFinal) encoder = new lamejs.Mp3Encoder(1, sampleRate, bitrate);
  return p; // p/ o stop() esperar o último segmento entrar no IDB antes do REC_DONE
}

async function stop() {
  if (stopping) return;
  stopping = true;
  if (watchdog) { clearInterval(watchdog); watchdog = null; }
  try {
    if (!encoder) { chrome.runtime.sendMessage({ type: 'OFFSCREEN_ERROR', error: 'nada estava gravando.' }).catch(() => {}); cleanup(true); return; }

    // encoda a sobra final (<1152) ANTES do flush p/ não perder os últimos ~26 ms
    if (carry.length) {
      const mp3 = encoder.encodeBuffer(floatToInt16(carry));
      if (mp3.length) segBytes.push(new Uint8Array(mp3));
      totalSamples += carry.length;
      carry = new Float32Array(0);
    }
    await rotateSegment(true); // fecha o último segmento e garante que ele entrou no IDB

    // solta o áudio
    try { if (scriptNode) scriptNode.onaudioprocess = null; } catch (e) { /* ignore */ }
    try { if (captureStream) captureStream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ }
    try { if (micStream) micStream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ }
    try { if (ctx && ctx.state !== 'closed') await ctx.close(); } catch (e) { /* ignore */ }

    if (!segmentBlobs.length || !totalSamples) {
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_ERROR', error: 'gravação vazia (nada foi capturado). Marque "Compartilhar áudio do sistema" ao escolher a tela, ou ligue o microfone.' }).catch(() => {});
      cleanup(true); return;
    }

    const durationSec = Math.round(totalSamples / sampleRate);
    const full = new Blob(segmentBlobs, { type: 'audio/mpeg' });
    const sizeMB = +(full.size / (1024 * 1024)).toFixed(1);
    const blobUrl = URL.createObjectURL(full); // válida p/ o chrome.downloads no service worker

    chrome.runtime.sendMessage({
      type: 'REC_DONE', ts: recTs, sizeMB, durationSec, source: srcLabel, micUsed,
      segCount: segmentBlobs.length, blobUrl
    }).catch(() => {});
    setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch (e) { /* ignore */ } }, 120000);
  } catch (e) {
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_ERROR', error: 'finalização: ' + ((e && e.message) || e) }).catch(() => {});
  } finally {
    cleanup(true);
  }
}

function cleanup(keepStopping) {
  try { if (scriptNode) { scriptNode.onaudioprocess = null; scriptNode.disconnect(); } } catch (e) { /* ignore */ }
  try { if (captureStream) captureStream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ }
  try { if (micStream) micStream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ }
  try { if (ctx && ctx.state !== 'closed') ctx.close(); } catch (e) { /* ignore */ }
  if (watchdog) { clearInterval(watchdog); watchdog = null; }
  scriptNode = null; sinkGain = null; captureStream = null; micStream = null; ctx = null; encoder = null;
  carry = new Float32Array(0); segBytes = []; segmentBlobs = [];
  if (!keepStopping) stopping = false;
}
