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
    ? 'Escreva as falas em português (traduza se estiverem em outro idioma).'
    : 'Escreva no idioma falado, sem traduzir.';
  return `Atue como um analista de áudio especializado em DIARIZAÇÃO de locutores. Transcreva o áudio identificando com precisão CADA pessoa diferente que fala, separando o texto por locutor. ${out}

Regras:
- Micro-falas: NUNCA ignore interrupções, falas curtas ou frases isoladas — inclusive nos segundos FINAIS. Processe o fim do áudio com a mesma atenção do início.
- Contraste acústico: quando o TIMBRE da voz mudar claramente, trate como um NOVO locutor. Na dúvida real entre uma voz e outra, prefira SEPARAR.
- Sem exagero: a MESMA pessoa mudando de tom/ritmo/emoção continua sendo o MESMO locutor. Só crie um novo locutor para uma VOZ realmente diferente.
- Nomeie sequencialmente: "Locutor 1", "Locutor 2", "Locutor 3"… e use o MESMO número para a mesma voz. NÃO invente nomes próprios.
- Transcreva tudo, sem resumir e sem comentários seus. Este áudio pode ser uma PARTE de uma reunião maior; transcreva só o que ouvir.

Em cada fala inclua também "inicio" = tempo APROXIMADO de início, em SEGUNDOS desde o começo DESTE áudio (número inteiro).
Retorne EXCLUSIVAMENTE um JSON válido: {"transcricao":[{"inicio":0,"locutor":"Locutor 1","fala":"..."},{"inicio":8,"locutor":"Locutor 2","fala":"..."}]}. Nada antes ou depois do JSON.`;
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

// Diarização: pedimos ao Gemini um JSON {transcricao:[{locutor,fala}]} e convertemos para o
// texto "Locutor N: fala" que o resto do app já entende (chat, nomeação, resumo).
const MX_DIAR_SCHEMA = {
  type: 'object',
  properties: {
    transcricao: {
      type: 'array',
      items: { type: 'object', properties: { inicio: { type: 'number' }, locutor: { type: 'string' }, fala: { type: 'string' } }, required: ['locutor', 'fala'] }
    }
  },
  required: ['transcricao']
};
function mxSecToLabel(s) {
  s = Math.max(0, Math.round(s || 0));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function mxParseSec(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  const s = String(v == null ? '' : v).trim();
  const m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
// JSON do Gemini -> "[MM:SS] Locutor N: fala" (o timestamp leva o offset de início da parte)
function mxJsonToTranscript(raw, offsetSec) {
  offsetSec = offsetSec || 0;
  let data;
  try { data = JSON.parse(raw); } catch (e) { return String(raw || '').trim(); } // veio texto -> usa cru
  const arr = (data && (data.transcricao || data.transcription || data.turns)) || (Array.isArray(data) ? data : []);
  if (!Array.isArray(arr) || !arr.length) return String(raw || '').trim();
  return arr.map((t) => {
    const sp = String((t && (t.locutor || t.speaker || t.pessoa)) || 'Locutor 1').trim();
    const fala = String((t && (t.fala || t.text || t.texto)) || '').trim();
    if (!fala) return '';
    const sec = mxParseSec(t && (t.inicio != null ? t.inicio : (t.start != null ? t.start : (t.tempo != null ? t.tempo : t.timestamp))));
    const stamp = (sec != null) ? ('[' + mxSecToLabel(sec + offsetSec) + '] ') : '';
    return stamp + sp + ': ' + fala;
  }).filter(Boolean).join('\n\n');
}

// ----- chamada base -----
async function mxGeminiCall(key, model, parts, genConfig) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model || 'gemini-2.5-flash') + ':generateContent?key=' + encodeURIComponent(key);
  const body = { contents: [{ parts }] };
  if (genConfig) body.generationConfig = genConfig;
  let r;
  try {
    r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
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
async function mxGeminiAudio(key, model, prompt, blob, genConfig) {
  if (!key) return { ok: false, error: 'Sem chave do Gemini (Ajustes → Resumo com IA).' };
  if (blob.size > MX_INLINE_MAX) return { ok: false, error: 'uma parte ficou grande demais (~14 MB) — reduza o bitrate em Ajustes.' };
  let b64;
  try { b64 = await mxBlobToBase64(blob); } catch (e) { return { ok: false, error: 'áudio: ' + e.message }; }
  return mxGeminiCall(key, model, [{ text: prompt }, { inline_data: { mime_type: 'audio/mpeg', data: b64 } }], genConfig);
}

// mesma coisa, mas com backoff em 429/5xx (rate limit por minuto)
async function mxGeminiAudioBackoff(key, model, prompt, blob, attempt, genConfig) {
  attempt = attempt || 0;
  const r = await mxGeminiAudio(key, model, prompt, blob, genConfig);
  if (r.ok) return r;
  if (r.status && (r.status === 429 || r.status >= 500) && attempt < 4) {
    await mxSleep(Math.min(2000 * Math.pow(2, attempt), 20000) + Math.floor(Math.random() * 500));
    return mxGeminiAudioBackoff(key, model, prompt, blob, attempt + 1, genConfig);
  }
  return r;
}

// transcreve TODOS os segmentos em sequência (espaçados) e junta os textos.
// onProgress(feito, total) atualiza a UI. Retorna { ok, text } ou { ok:false, error, partial }.
async function mxTranscribeSegments(key, model, lang, blobs, onProgress, startSecs) {
  if (!key) return { ok: false, error: 'Sem chave do Gemini (Ajustes → Resumo com IA).' };
  if (!blobs || !blobs.length) return { ok: false, error: 'sem áudio para transcrever.' };
  const prompt = mxTranscriptPrompt(lang);
  // temperature 0 = transcrição fiel/estável; maxOutputTokens alto o bastante p/ ~15 min por parte.
  const genConfig = { responseMimeType: 'application/json', responseSchema: MX_DIAR_SCHEMA, temperature: 0, maxOutputTokens: 8192 };
  const parts = [];
  for (let i = 0; i < blobs.length; i++) {
    if (onProgress) onProgress(i, blobs.length);
    const r = await mxGeminiAudioBackoff(key, model, prompt, blobs[i], 0, genConfig);
    if (!r.ok) return { ok: false, error: 'parte ' + (i + 1) + '/' + blobs.length + ': ' + r.error, partial: parts.join('\n\n') };
    parts.push(mxJsonToTranscript(r.text, (startSecs && startSecs[i]) || 0));
    if (i < blobs.length - 1) await mxSleep(MX_SPACING_MS);
  }
  if (onProgress) onProgress(blobs.length, blobs.length);
  return { ok: true, text: parts.filter(Boolean).join('\n\n') };
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
