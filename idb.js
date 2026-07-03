// Armazena o MP3 de cada gravação em IndexedDB — UM arquivo inteiro por gravação
// (keyPath 'ts'). A divisão em partes é feita SÓ na hora de transcrever (fatiando o blob
// por offsets de byte), sem tocar no arquivo salvo. Mantém as MX_KEEP gravações mais recentes.
const MX_DB = 'mappex-rec';
const MX_STORE = 'audios';
const MX_KEEP = 12;

function mxIdbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MX_DB, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      // migra de qualquer versão anterior (v1 'audios' antigo, v2 'segments'): recomeça limpo
      // com 1 blob por gravação (o arquivo inteiro).
      for (const s of Array.from(db.objectStoreNames)) db.deleteObjectStore(s);
      db.createObjectStore(MX_STORE, { keyPath: 'ts' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function mxIdbPut(ts, blob) {
  const db = await mxIdbOpen();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(MX_STORE, 'readwrite');
    tx.objectStore(MX_STORE).put({ ts, blob });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function mxIdbGet(ts) {
  const db = await mxIdbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MX_STORE, 'readonly');
    const rq = tx.objectStore(MX_STORE).get(ts);
    rq.onsuccess = () => resolve(rq.result ? rq.result.blob : null);
    rq.onerror = () => reject(rq.error);
  });
}
async function mxIdbKeys() {
  const db = await mxIdbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MX_STORE, 'readonly');
    const rq = tx.objectStore(MX_STORE).getAllKeys();
    rq.onsuccess = () => resolve(rq.result || []);
    rq.onerror = () => reject(rq.error);
  });
}
async function mxIdbDelete(ts) {
  const db = await mxIdbOpen();
  await new Promise((resolve) => {
    const tx = db.transaction(MX_STORE, 'readwrite');
    tx.objectStore(MX_STORE).delete(ts);
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
  const keys = await mxIdbKeys();
  if (keys.length <= MX_KEEP) return;
  const sorted = keys.slice().sort((a, b) => a - b);
  const remove = sorted.slice(0, keys.length - MX_KEEP).filter((t) => t !== keepTs);
  for (const t of remove) await mxIdbDelete(t);
}
