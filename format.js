// Formatação do nome do arquivo. Tokens (PT-BR):
//   AAAA ano(4) · AA ano(2) · MM mês · DD dia · hh hora(24) · mm minuto · ss segundo
// Qualquer outro caractere é tratado como literal.
function mxStamp(fmt, d) {
  d = d || new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const map = {
    AAAA: String(d.getFullYear()),
    AA: String(d.getFullYear()).slice(-2),
    MM: p2(d.getMonth() + 1),
    DD: p2(d.getDate()),
    hh: p2(d.getHours()),
    mm: p2(d.getMinutes()),
    ss: p2(d.getSeconds())
  };
  return String(fmt || '').replace(/AAAA|AA|MM|DD|hh|mm|ss/g, (t) => map[t]);
}

function mxFilename(prefix, fmt, ext, d) {
  const date = mxStamp(fmt, d);
  const base = [prefix, date].map((x) => String(x || '').trim()).filter(Boolean).join('-');
  return (base || 'reuniao') + (ext || '.mp3');
}

if (typeof window !== 'undefined') {
  window.mxStamp = mxStamp;
  window.mxFilename = mxFilename;
}
