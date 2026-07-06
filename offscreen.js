// Offscreen document: SÓ mídia. Captura o áudio do SISTEMA (getDisplayMedia) + microfone,
// mixa, e CODIFICA MP3 EM TEMPO REAL (ScriptProcessor -> lamejs), bloco a bloco, num
// ÚNICO encoder contínuo. O resultado é UM arquivo MP3 inteiro (o original), salvo uma vez.
//
// POR QUE ao vivo: o caminho antigo (MediaRecorder -> webm inteiro -> decodeAudioData ->
// OfflineAudioContext -> encode no fim) carregava a gravação INTEIRA em PCM. A partir de
// ~10 min isso estourava a memória do renderer e o Chrome MATAVA o offscreen SEM exceção
// -> a gravação sumia em silêncio. Codificando ao vivo, a memória fica ~constante.
//
// A divisão em partes existe SÓ para a transcrição no Gemini: durante o encode eu apenas
// ANOTO os offsets de byte (limites de frame) a cada ~N min em `cutBytes`. O arquivo salvo
// NÃO é cortado — na hora de transcrever, fatia-se o blob por esses offsets. O sampleRate:44100
// no AudioContext só evita reamostrar na mão; quem mata o OOM é o streaming, não a taxa.

let ctx = null;
let captureStream = null;
let micStream = null;
let scriptNode = null;
let sinkGain = null;
let encoder = null;

let bitrate = 96;
let micUsed = false;
let srcLabel = 'Sistema';

let recTs = 0;            // id da gravação (chave no IDB)
let sampleRate = 44100;
let samplesPerChunk = 0; // tamanho da PARTE de transcrição (derivado do bitrate)
let nextCutSamples = 0;

let carry = new Float32Array(0); // sobra de PCM (<1152) entre callbacks
let mp3Bytes = [];               // Uint8Array[] — o ARQUIVO INTEIRO (um só)
let byteLen = 0;                 // bytes acumulados (sempre em limite de frame)
let cutBytes = [];               // offsets de byte onde cada parte de transcrição começa/termina
let cutSecs = [];                // tempo (s) de cada corte — p/ posicionar os timestamps das falas
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

    // 5) encoder ÚNICO + tamanho da PARTE de transcrição, derivado do bitrate p/ cada parte
    //    ficar < ~11 MB (folga sob o limite inline do Gemini). Fonte única: esta fórmula.
    const TARGET_BYTES = 11 * 1024 * 1024;
    const secPerChunk = Math.max(60, Math.floor((TARGET_BYTES * 8) / (bitrate * 1000)));
    samplesPerChunk = secPerChunk * sampleRate;
    nextCutSamples = samplesPerChunk;

    encoder = new lamejs.Mp3Encoder(1, sampleRate, bitrate);
    carry = new Float32Array(0);
    mp3Bytes = []; byteLen = 0; cutBytes = []; cutSecs = []; totalSamples = 0; blocksProcessed = 0;
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

  // junta a sobra anterior + o bloco atual e drena em fatias de 1152 (sobra fica < 1152)
  let buf;
  if (carry.length) { buf = new Float32Array(carry.length + input.length); buf.set(carry, 0); buf.set(input, carry.length); }
  else buf = input;

  let off = 0;
  while (buf.length - off >= FRAME) {
    const mp3 = encoder.encodeBuffer(floatToInt16(buf.subarray(off, off + FRAME)));
    if (mp3.length) { mp3Bytes.push(new Uint8Array(mp3)); byteLen += mp3.length; }
    off += FRAME; totalSamples += FRAME;
  }
  carry = buf.subarray(off).slice(); // guarda a sobra (<1152), copiada

  // marca os CORTES de transcrição (só offsets de byte; o encoder NÃO é cortado -> arquivo
  // continua inteiro). byteLen aqui está sempre num limite de frame (lamejs emite frames inteiros).
  while (totalSamples >= nextCutSamples) { cutBytes.push(byteLen); cutSecs.push(totalSamples / sampleRate); nextCutSamples += samplesPerChunk; }
}

async function stop() {
  if (stopping) return;
  stopping = true;
  if (watchdog) { clearInterval(watchdog); watchdog = null; }
  try {
    if (!encoder) { chrome.runtime.sendMessage({ type: 'OFFSCREEN_ERROR', error: 'nada estava gravando.' }).catch(() => {}); cleanup(true); return; }

    // encoda a sobra final (<1152) e dá flush no encoder (fecha o último frame) — sem perder o fim
    if (carry.length) {
      const mp3 = encoder.encodeBuffer(floatToInt16(carry));
      if (mp3.length) { mp3Bytes.push(new Uint8Array(mp3)); byteLen += mp3.length; }
      totalSamples += carry.length;
      carry = new Float32Array(0);
    }
    const tail = encoder.flush();
    if (tail.length) { mp3Bytes.push(new Uint8Array(tail)); byteLen += tail.length; }

    // solta o áudio
    try { if (scriptNode) scriptNode.onaudioprocess = null; } catch (e) { /* ignore */ }
    try { if (captureStream) captureStream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ }
    try { if (micStream) micStream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ }
    try { if (ctx && ctx.state !== 'closed') await ctx.close(); } catch (e) { /* ignore */ }

    if (!mp3Bytes.length || !totalSamples) {
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_ERROR', error: 'gravação vazia (nada foi capturado). Marque "Compartilhar áudio do sistema" ao escolher a tela, ou ligue o microfone.' }).catch(() => {});
      cleanup(true); return;
    }

    // UM arquivo inteiro. cutBytes são só marcadores para fatiar na transcrição.
    const full = new Blob(mp3Bytes, { type: 'audio/mpeg' });
    const durationSec = Math.round(totalSamples / sampleRate);
    const sizeMB = +(full.size / (1024 * 1024)).toFixed(1);
    await mxIdbPut(recTs, full); // salva o arquivo inteiro (aguarda entrar no IDB)
    const blobUrl = URL.createObjectURL(full); // p/ o chrome.downloads no service worker

    chrome.runtime.sendMessage({
      type: 'REC_DONE', ts: recTs, sizeMB, durationSec, source: srcLabel, micUsed,
      chunkBytes: cutBytes, chunkSecs: cutSecs, blobUrl
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
  carry = new Float32Array(0); mp3Bytes = []; cutBytes = []; cutSecs = [];
  if (!keepStopping) stopping = false;
}
