// i18n próprio (PT-BR + EN) com troca em RUNTIME (o chrome.i18n usa só o idioma do navegador
// e não é trocável; por isso um dicionário aqui + seletor nos Ajustes). O _locales cuida só do
// nome/descrição da extensão na loja. Uso:
//   mxSetLang(settings.uiLang);           // 'auto' | 'pt' | 'en'
//   mxApplyI18n(document);                // preenche [data-i18n], [data-i18n-ph], [data-i18n-title]
//   t('chave', arg1, ...)                 // string dinâmica (substitui %s na ordem)
let _lang = 'pt';
function mxResolveLang(pref) {
  if (pref === 'en' || pref === 'pt') return pref;
  const nav = (typeof navigator !== 'undefined' && navigator.language || 'pt').toLowerCase();
  return nav.indexOf('en') === 0 ? 'en' : 'pt';
}
function mxSetLang(pref) { _lang = mxResolveLang(pref); }
function mxLang() { return _lang; }
function t(key) {
  const d = MX_I18N[_lang] || MX_I18N.pt;
  let s = (d && d[key] != null) ? d[key] : (MX_I18N.pt[key] != null ? MX_I18N.pt[key] : key);
  for (let i = 1; i < arguments.length; i++) s = s.replace('%s', arguments[i]);
  return s;
}
function mxApplyI18n(root) {
  root = root || document;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
}

const MX_I18N = {
  pt: {
    // --- comum ---
    app_name: 'Gravador de reunião',
    see_recordings: 'Ver gravações',
    // --- popup ---
    popup_gear_title: 'Ajustes e gravações',
    incl_mic: 'Incluir meu microfone',
    status_ready: 'Pronto para gravar',
    status_rec: 'Gravando…',
    btn_start: 'Iniciar gravação',
    btn_stop: 'Parar e salvar',
    mic_hint_off: 'Só a fonte principal será gravada.',
    mic_asking: 'Pedindo permissão do microfone…',
    mic_ok: 'Microfone autorizado ✓ — entra junto na gravação.',
    mic_denied: 'Permissão negada. Ligue de novo para tentar.',
    hint_default: 'Abra o Teams ou o Meet nesta aba e clique em iniciar.',
    hint_choose: 'Escolha a tela/aba e marque "Compartilhar áudio"…',
    hint_recording: 'Gravando… pode fechar este menu.',
    hint_converting: 'Convertendo para MP3…',
    saved_ok: 'MP3 salvo ✓ (%s) — abra "Ver gravações" para transcrever/resumir.',
    err_prefix: 'Erro: ',
    start_err: 'falha ao iniciar',
    save_downloads: 'Salvar em: Downloads',
    save_ask: 'Salvar em: você escolhe'
  },
  en: {
    // --- common ---
    app_name: 'Meeting recorder',
    see_recordings: 'View recordings',
    // --- popup ---
    popup_gear_title: 'Settings and recordings',
    incl_mic: 'Include my microphone',
    status_ready: 'Ready to record',
    status_rec: 'Recording…',
    btn_start: 'Start recording',
    btn_stop: 'Stop and save',
    mic_hint_off: 'Only the main source will be recorded.',
    mic_asking: 'Requesting microphone permission…',
    mic_ok: 'Microphone allowed ✓ — it goes into the recording.',
    mic_denied: 'Permission denied. Turn it on again to retry.',
    hint_default: 'Open Teams or Meet in this tab and click start.',
    hint_choose: 'Pick the screen/tab and check "Share audio"…',
    hint_recording: 'Recording… you can close this menu.',
    hint_converting: 'Converting to MP3…',
    saved_ok: 'MP3 saved ✓ (%s) — open "View recordings" to transcribe/summarize.',
    err_prefix: 'Error: ',
    start_err: 'failed to start',
    save_downloads: 'Save to: Downloads',
    save_ask: 'Save to: you choose'
  }
};

if (typeof window !== 'undefined') {
  window.t = t; window.mxSetLang = mxSetLang; window.mxApplyI18n = mxApplyI18n; window.mxLang = mxLang;
}
