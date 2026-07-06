// Markdown -> HTML mínimo e seguro (sem libs; roda offline). Cobre o que o resumo do
// Gemini usa: headings (##/###), negrito **x**, itálico *x*, `code`, listas (- / 1.),
// tabelas (| a | b |), regras (---) e parágrafos. Escapa HTML antes de tudo.
function mxEscapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function mxInline(s) {
  return mxEscapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
function mxMarkdown(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const isSep = (s) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(s);
  const cells = (s) => s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  const isBlock = (s) => /^#{1,6}\s/.test(s) || /^\s*[-*]\s+/.test(s) || /^\s*\d+\.\s+/.test(s) || s.indexOf('|') !== -1 || /^\s*([-*_])\1{2,}\s*$/.test(s);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    let m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) { const l = Math.min(6, m[1].length); out.push('<h' + l + '>' + mxInline(m[2].trim()) + '</h' + l + '>'); i++; continue; }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    // tabela: linha com | seguida de linha separadora
    if (line.indexOf('|') !== -1 && i + 1 < lines.length && isSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].indexOf('|') !== -1 && lines[i].trim()) { rows.push(cells(lines[i])); i++; }
      let t = '<table><thead><tr>' + head.map((h) => '<th>' + mxInline(h) + '</th>').join('') + '</tr></thead><tbody>';
      for (const r of rows) t += '<tr>' + r.map((c) => '<td>' + mxInline(c) + '</td>').join('') + '</tr>';
      out.push(t + '</tbody></table>');
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push('<li>' + mxInline(lines[i].replace(/^\s*[-*]\s+/, '')) + '</li>'); i++; }
      out.push('<ul>' + items.join('') + '</ul>');
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push('<li>' + mxInline(lines[i].replace(/^\s*\d+\.\s+/, '')) + '</li>'); i++; }
      out.push('<ol>' + items.join('') + '</ol>');
      continue;
    }

    // parágrafo: junta linhas até um bloco ou linha em branco
    const para = [];
    while (i < lines.length && lines[i].trim() && !isBlock(lines[i])) { para.push(lines[i].trim()); i++; }
    if (para.length) out.push('<p>' + mxInline(para.join(' ')) + '</p>');
    else i++;
  }
  return out.join('\n');
}

if (typeof window !== 'undefined') {
  window.mxMarkdown = mxMarkdown;
  window.mxEscapeHtml = mxEscapeHtml;
}
