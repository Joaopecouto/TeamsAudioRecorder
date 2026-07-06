// Chamadas à API oficial do Gemini + prompts. Compartilhado entre a página (options) e o
// service worker (importScripts). Fluxo novo p/ reuniões longas:
//   1) transcreve CADA segmento de áudio (< ~14 MB) separadamente (inline base64);
//   2) junta as transcrições em ordem;
//   3) o RESUMO sai desse TEXTO junto (chamada de texto puro, sem limite de áudio).
const MX_INLINE_MAX = 14 * 1024 * 1024; // teto seguro por parte enviada inline
const MX_SPACING_MS = 3500;             // espaço entre chamadas (free tier ~15 RPM no Flash)

function mxSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function mxBlobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// ----- prompts -----
function mxTranscriptPrompt(lang) {
  const out = (lang === 'pt')
    ? 'Entregue a transcrição em português (traduza se a fala estiver em outro idioma).'
    : 'Transcreva no idioma falado, sem traduzir.';
  return `Transcreva o ÁUDIO desta reunião o mais fiel possível. ${out} Não resuma — transcreva tudo o que foi dito, sem comentários seus.
FORMATO OBRIGATÓRIO: comece CADA fala com o rótulo do interlocutor seguido de dois-pontos, com uma linha em branco entre as falas. Exemplo:

Pessoa 1: ...texto...

Pessoa 2: ...texto...

Use SEMPRE "Pessoa 1", "Pessoa 2", etc. (NÃO invente nomes próprios) e mantenha o mesmo número para a mesma voz. (Este áudio pode ser uma PARTE de uma reunião maior; transcreva só o que ouvir.)`;
}
function mxSummaryPromptText(lang) {
  const out = (lang === 'pt')
    ? 'Escreva a resposta em português, mesmo que a reunião esteja em outro idioma.'
    : 'Escreva a resposta no MESMO idioma da transcrição.';
  return `Você é um assistente de atas. A entrada é a TRANSCRIÇÃO (possivelmente juntada de várias partes) de uma reunião. ${out} Gere em markdown, exatamente com estas seções:

## Resumo executivo
(3 a 5 linhas)

## Decisões

## Itens de ação
(tabela: tarefa | responsável | prazo)

## Pontos em aberto / riscos

## Próximos passos

Regras: não invente nada que não esteja na transcrição; se responsável/prazo não foi dito, escreva "—".`;
}

// ----- chamada base -----
async function mxGeminiCall(key, model, parts) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model || 'gemini-2.5-flash') + ':generateContent?key=' + encodeURIComponent(key);
  let r;
  try {
    r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });
  } catch (e) { return { ok: false, error: 'rede: ' + e.message }; }
  if (!r.ok) {
    let t = ''; try { t = await r.text(); } catch (e) { /* ignore */ }
    return { ok: false, error: 'Gemini ' + r.status + ': ' + t.slice(0, 180), status: r.status };
  }
  let data;
  try { data = await r.json(); } catch (e) { return { ok: false, error: 'resposta inválida do Gemini' }; }
  const parts2 = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  const text = (parts2 || []).map((p) => p.text).filter(Boolean).join('\n').trim();
  if (!text) return { ok: false, error: 'O Gemini não retornou texto (pode ter sido bloqueado por segurança).' };
  return { ok: true, text };
}

// transcreve UM segmento (áudio inline)
async function mxGeminiAudio(key, model, prompt, blob) {
  if (!key) return { ok: false, error: 'Sem chave do Gemini (Ajustes → Resumo com IA).' };
  if (blob.size > MX_INLINE_MAX) return { ok: false, error: 'uma parte ficou grande demais (~14 MB) — reduza o bitrate em Ajustes.' };
  let b64;
  try { b64 = await mxBlobToBase64(blob); } catch (e) { return { ok: false, error: 'áudio: ' + e.message }; }
  return mxGeminiCall(key, model, [{ text: prompt }, { inline_data: { mime_type: 'audio/mpeg', data: b64 } }]);
}

// mesma coisa, mas com backoff em 429/5xx (rate limit por minuto)
async function mxGeminiAudioBackoff(key, model, prompt, blob, attempt) {
  attempt = attempt || 0;
  const r = await mxGeminiAudio(key, model, prompt, blob);
  if (r.ok) return r;
  if (r.status && (r.status === 429 || r.status >= 500) && attempt < 4) {
    await mxSleep(Math.min(2000 * Math.pow(2, attempt), 20000) + Math.floor(Math.random() * 500));
    return mxGeminiAudioBackoff(key, model, prompt, blob, attempt + 1);
  }
  return r;
}

// transcreve TODOS os segmentos em sequência (espaçados) e junta os textos.
// onProgress(feito, total) atualiza a UI. Retorna { ok, text } ou { ok:false, error, partial }.
async function mxTranscribeSegments(key, model, lang, blobs, onProgress) {
  if (!key) return { ok: false, error: 'Sem chave do Gemini (Ajustes → Resumo com IA).' };
  if (!blobs || !blobs.length) return { ok: false, error: 'sem áudio para transcrever.' };
  const prompt = mxTranscriptPrompt(lang);
  const parts = [];
  for (let i = 0; i < blobs.length; i++) {
    if (onProgress) onProgress(i, blobs.length);
    const r = await mxGeminiAudioBackoff(key, model, prompt, blobs[i]);
    if (!r.ok) return { ok: false, error: 'parte ' + (i + 1) + '/' + blobs.length + ': ' + r.error, partial: parts.join('\n\n') };
    parts.push(r.text);
    if (i < blobs.length - 1) await mxSleep(MX_SPACING_MS);
  }
  if (onProgress) onProgress(blobs.length, blobs.length);
  return { ok: true, text: parts.join('\n\n') };
}

// resumo a partir do TEXTO da transcrição já juntada (sem áudio, sem limite de tamanho)
async function mxSummarizeTranscript(key, model, lang, transcript) {
  if (!key) return { ok: false, error: 'Sem chave do Gemini (Ajustes → Resumo com IA).' };
  if (!transcript || !transcript.trim()) return { ok: false, error: 'transcrição vazia.' };
  const prompt = mxSummaryPromptText(lang) + '\n\n--- TRANSCRIÇÃO ---\n\n' + transcript;
  return mxGeminiCall(key, model, [{ text: prompt }]);
}

// fatia o arquivo ÚNICO em partes p/ transcrição, usando os offsets de byte (limites de
// frame anotados na gravação). O arquivo salvo continua inteiro — isto só existe na hora de
// mandar cada pedaço pro Gemini. Sem cortes (gravação curta) -> uma parte só (o arquivo todo).
function mxChunksFromBlob(blob, cutBytes) {
  const cuts = Array.isArray(cutBytes) ? cutBytes : [];
  const chunks = [];
  let prev = 0;
  for (const c of cuts) {
    if (c > prev && c < blob.size) { chunks.push(blob.slice(prev, c, 'audio/mpeg')); prev = c; }
  }
  chunks.push(blob.slice(prev, blob.size, 'audio/mpeg'));
  return chunks;
}

if (typeof window !== 'undefined') {
  window.mxTranscribeSegments = mxTranscribeSegments;
  window.mxSummarizeTranscript = mxSummarizeTranscript;
  window.mxChunksFromBlob = mxChunksFromBlob;
}
