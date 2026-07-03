// Armazena o áudio das gravações em IndexedDB, EM SEGMENTOS (partes de ~N min).
// Cada segmento é um MP3 auto-contido -> serve tanto para montar o arquivo completo
// (Baixar MP3) quanto para transcrever parte a parte no Gemini (cada parte < ~14 MB).
// Chave composta [ts, i]: ts identifica a gravação, i é o índice do segmento.
// Mantém só as MX_KEEP gravações mais recentes (contadas por gravação, não por segmento).
const MX_DB = 'mappex-rec';
const MX_STORE = 'segments';
const MX_KEEP = 12;

function mxIdbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MX_DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      // v1 guardava 1 blob inteiro por gravação (store 'audios') — o caminho que estourava
      // a memória em gravações longas. v2 guarda segmentos independentes.
      if (db.objectStoreNames.contains('audios')) db.deleteObjectStore('audios');
      if (!db.objectStoreNames.contains(MX_STORE)) db.createObjectStore(MX_STORE, { keyPath: ['ts', 'i'] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function mxSegRange(ts) { return IDBKeyRange.bound([ts, 0], [ts, Number.MAX_SAFE_INTEGER]); }

// salva um segmento assim que ele fecha (durabilidade: perder a aba não apaga o que já veio)
async function mxIdbPutSeg(ts, i, blob) {
  const db = await mxIdbOpen();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(MX_STORE, 'readwrite');
    tx.objectStore(MX_STORE).put({ ts, i, blob });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// todos os segmentos de uma gravação, em ordem -> Blob[]
async function mxIdbGetSegs(ts) {
  const db = await mxIdbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MX_STORE, 'readonly');
    const rq = tx.objectStore(MX_STORE).getAll(mxSegRange(ts));
    rq.onsuccess = () => resolve((rq.result || []).sort((a, b) => a.i - b.i).map((r) => r.blob));
    rq.onerror = () => reject(rq.error);
  });
}

// o MP3 completo (segmentos concatenados) — MP3 é um fluxo de frames, então concatenar toca.
async function mxIdbGet(ts) {
  const segs = await mxIdbGetSegs(ts);
  if (!segs.length) return null;
  return new Blob(segs, { type: 'audio/mpeg' });
}

// lista de gravações (ts distintos) que têm áudio salvo
async function mxIdbKeys() {
  const db = await mxIdbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MX_STORE, 'readonly');
    const rq = tx.objectStore(MX_STORE).getAllKeys();
    rq.onsuccess = () => resolve([...new Set((rq.result || []).map((k) => k[0]))]);
    rq.onerror = () => reject(rq.error);
  });
}

// apaga todos os segmentos de uma gravação
async function mxIdbDelete(ts) {
  const db = await mxIdbOpen();
  await new Promise((resolve) => {
    const tx = db.transaction(MX_STORE, 'readwrite');
    tx.objectStore(MX_STORE).delete(mxSegRange(ts));
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
}

async function mxIdbClear() {
  const db = await mxIdbOpen();
  await new Promise((resolve) => {
    const tx = db.transaction(MX_STORE, 'readwrite');
    tx.objectStore(MX_STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
}

// mantém só as MX_KEEP gravações mais recentes; NUNCA apaga `keepTs` (a recém-terminada,
// que ainda pode estar sendo transcrita) — evita corrida com a transcrição.
async function mxIdbPrune(keepTs) {
  const tsList = await mxIdbKeys();
  if (tsList.length <= MX_KEEP) return;
  const sorted = tsList.slice().sort((a, b) => a - b);
  const remove = sorted.slice(0, tsList.length - MX_KEEP).filter((t) => t !== keepTs);
  for (const t of remove) await mxIdbDelete(t);
}
