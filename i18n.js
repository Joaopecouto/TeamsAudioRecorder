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
    save_ask: 'Salvar em: você escolhe',
    // --- opções: abas + idioma ---
    tab_settings: 'Ajustes', tab_recordings: 'Gravações',
    lang_title: 'Idioma / Language', lang_auto: 'Automático (navegador)',
    // --- opções: captura ---
    setup_welcome: '<b>Bem-vindo!</b> Para gravar a reunião com a sua voz, autorize o microfone agora. Depois, cole a chave do Gemini abaixo para transcrever e resumir.',
    grant_mic: 'Permitir microfone',
    sec_capture: 'Captura',
    cap_sub: 'Grava o áudio do SISTEMA (qualquer app). Ao iniciar, escolha a tela ou aba no seletor do Chrome e marque "Compartilhar áudio".',
    mic_mix_hint: 'Mixa sua voz junto com a reunião. Use fones para evitar eco.',
    mic_device: 'Aparelho do microfone', mic_default: 'Microfone padrão do sistema',
    mic_note_auth: 'Autorize o microfone para ver os nomes dos aparelhos.',
    mic_note_used: 'Aparelho usado quando o microfone está ligado.',
    mic_volume: 'Volume do microfone',
    mic_vol_hint: 'O microfone costuma sair mais baixo que o áudio da reunião — aumente se a sua voz ficar fraca.',
    mic_vol_normal: 'Normal (1×)', mic_vol_high: 'Alto (2×)', mic_vol_vhigh: 'Muito alto (3×)',
    // --- opções: resumo com IA ---
    sec_ai_html: 'Resumo com IA <small>(Gemini)</small>',
    ai_sub: 'Transcrição e resumo das reuniões usando a sua chave gratuita do Gemini.',
    gemini_key: 'Chave do Gemini', key_local: 'Fica só nesta máquina.',
    get_key_link: 'Pegar chave grátis no Google AI Studio',
    gemini_key_ph: 'AIza... (sua chave do Gemini)',
    model_flash25: 'gemini-2.5-flash (recomendado)',
    summ_lang_title: 'Idioma do resumo e das tarefas', summ_lang_sub: 'Muda o texto enviado ao Gemini.',
    lang_natural: 'Idioma natural da reunião', lang_browser: 'Idioma do navegador',
    auto_summ_title: 'Resumo automático ao parar',
    auto_summ_sub: 'Desligado: o resumo só sai quando você clicar em "Criar resumo" na aba Gravações.',
    // --- opções: arquivo ---
    sec_file: 'Arquivo', file_sub: 'Qualidade, nome e onde o MP3 é salvo.',
    mp3_quality: 'Qualidade do MP3',
    mp3_quality_sub: 'Mono · 44,1 kHz. Bitrate maior = som melhor e arquivo maior. (Para resumir reuniões longas no Gemini, prefira a econômica — o resumo tem limite de tamanho.)',
    bitrate_eco: 'Econômica — 48 kbps (~21 MB/h)', bitrate_good: 'Boa — 96 kbps (~43 MB/h)', bitrate_high: 'Alta — 128 kbps (~57 MB/h)',
    filename_title: 'Nome do arquivo',
    filename_sub_html: 'Prefixo + data. Tokens: <b>AAAA</b> ano · <b>MM</b> mês · <b>DD</b> dia · <b>hh</b> hora · <b>mm</b> min · <b>ss</b> seg.',
    preview_label: 'Prévia:',
    dest_folder: 'Pasta de destino',
    dest_folder_sub: 'Subpasta dentro de Downloads. Para escolher qualquer pasta, ligue "Perguntar onde salvar".',
    dest_folder_ph: 'Reuniões',
    ask_save: 'Perguntar onde salvar', ask_save_sub: 'Abre "Salvar como" a cada gravação.',
    // --- opções: lembrete ---
    sec_reminder: 'Lembrete na reunião', reminder_sub: 'O aviso flutuante que aparece no Teams/Meet.',
    show_reminder: 'Mostrar lembrete', show_reminder_sub: 'Pill no canto ao entrar numa reunião.',
    reminder_sound: 'Aviso sonoro', reminder_sound_sub: 'Toca um som curto e dá uma piscada quando o lembrete aparece.',
    reminder_corner: 'Canto do lembrete',
    corner_br: 'Inferior direito', corner_bl: 'Inferior esquerdo', corner_tr: 'Superior direito', corner_tl: 'Superior esquerdo',
    where_show: 'Onde mostrar',
    // --- gravações ---
    nokey_hint_html: 'Configure a <b>chave do Gemini</b> em Ajustes para transcrever e resumir as gravações.',
    configure: 'Configurar', your_recordings: 'Suas gravações',
    import_mp3: 'Importar MP3', clear_history: 'Limpar histórico',
    import_sub_html: 'Tem gravações antigas na pasta mas o áudio sumiu da lista? Clique em <b>Importar MP3</b> e selecione os arquivos — ele re-vincula pelo nome.',
    no_recordings: 'Nenhuma gravação ainda.', saved_toast: 'Salvo ✓',
    // --- detalhe (dinâmico) ---
    back_to_recordings: '← Voltar para gravações',
    tab_transcript: 'Transcrição', tab_summary: 'Resumo',
    st_transcribed: 'Transcrita', st_summary: 'Resumo', st_processing: 'Processando…',
    d_open: 'Abrir', d_folder: 'Pasta', d_download_mp3: 'Baixar MP3', d_delete: 'Excluir',
    d_copy: 'Copiar', d_copied: 'Copiado ✓', d_download: 'Baixar', d_redo: 'Refazer',
    btn_transcribe: 'Transcrever', btn_create_summary: 'Criar resumo',
    prog_transcribing: 'Transcrevendo…', prog_summarizing: 'Resumindo…',
    prog_part: 'Transcrevendo parte %s/%s…', prog_finishing: 'Finalizando…',
    empty_transcript: 'Ainda não transcrita. A extensão manda o áudio ao Gemini em partes e junta o texto.',
    empty_summary: 'Ainda sem resumo. Sai da transcrição: resumo executivo, decisões, itens de ação e próximos passos.',
    audio_gone: 'Áudio não está mais salvo',
    del_rec_title: 'Excluir gravação',
    // --- toasts / confirmações ---
    t_no_key: 'Cole a chave do Gemini em Ajustes (te levei pra lá).',
    t_transcript_ready: 'Transcrição pronta ✓', t_summary_ready: 'Resumo pronto ✓',
    t_transcript: 'Transcrição', t_summary: 'Resumo',
    t_quota: 'Cota do Gemini esgotada. Espere um pouco e tente de novo.', t_quota_wait: 'Cota esgotada — aguarde',
    t_audio_gone: 'Áudio não está mais salvo (guardamos as 12 gravações mais recentes).',
    t_deleted: 'Gravação excluída', t_download_err: 'Erro ao baixar: ',
    t_importing: 'Importando…', t_import_pick: 'Selecione arquivos .mp3',
    t_import_done: 'Importado ✓ — %s re-vinculada(s), %s nova(s)',
    confirm_delete: 'Excluir "%s"?\nApaga o áudio, a transcrição e o resumo. Não dá pra desfazer.',
    confirm_clear: 'Limpar TODO o histórico?\nApaga TODAS as gravações — áudio, transcrições e resumos. Não dá pra desfazer.',
    src_imported: 'Importado',
    // --- onboarding (primeiro uso) ---
    ob_welcome_title: 'Bem-vindo ao Gravador de reunião', ob_welcome_sub: 'Configure em 1 minuto. Dá pra fazer depois nos Ajustes.',
    ob_mic_title: '1. Microfone', ob_mic_sub: 'Para gravar a sua voz junto com a reunião.',
    ob_mic_ok: 'Microfone autorizado ✓', ob_mic_no: 'Permissão negada — clique de novo.',
    ob_notif_title: '2. Notificações', ob_notif_sub: 'Avisa quando a gravação termina (e abre a gravação num clique).',
    ob_notif_btn: 'Testar notificação', ob_notif_q: 'Viu a notificação aparecer?',
    ob_notif_ok: 'Notificações funcionando ✓', ob_notif_fail: 'Não consegui criar a notificação — verifique a permissão.',
    ob_notif_tip: 'Não apareceu? No Windows: Configurações → Sistema → Notificações → ligue o Brave/Chrome e desligue o "Não perturbe / Assistente de Foco". No Brave: brave://settings/content/notifications.',
    ob_test_title: 'Teste de notificação ✓', ob_test_msg: 'Se você está vendo isto, as notificações funcionam!',
    ob_key_title: '3. Chave do Gemini (opcional)', ob_key_sub: 'Para transcrever e resumir. É grátis no Google AI Studio.',
    ob_yes: 'Sim', ob_no: 'Não', ob_later: 'Fazer depois', ob_done: 'Concluir', ob_reopen: 'Refazer configuração inicial'
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
    save_ask: 'Save to: you choose',
    // --- options: tabs + language ---
    tab_settings: 'Settings', tab_recordings: 'Recordings',
    lang_title: 'Language / Idioma', lang_auto: 'Automatic (browser)',
    // --- options: capture ---
    setup_welcome: '<b>Welcome!</b> To record the meeting with your voice, allow the microphone now. Then paste your Gemini key below to transcribe and summarize.',
    grant_mic: 'Allow microphone',
    sec_capture: 'Capture',
    cap_sub: 'Records SYSTEM audio (any app). When you start, pick the screen or tab in Chrome\'s picker and check "Share audio".',
    mic_mix_hint: 'Mixes your voice with the meeting. Use headphones to avoid echo.',
    mic_device: 'Microphone device', mic_default: 'System default microphone',
    mic_note_auth: 'Allow the microphone to see device names.',
    mic_note_used: 'Device used when the microphone is on.',
    mic_volume: 'Microphone volume',
    mic_vol_hint: 'The mic is usually quieter than the meeting audio — raise it if your voice is weak.',
    mic_vol_normal: 'Normal (1×)', mic_vol_high: 'High (2×)', mic_vol_vhigh: 'Very high (3×)',
    // --- options: AI summary ---
    sec_ai_html: 'AI summary <small>(Gemini)</small>',
    ai_sub: 'Transcription and summary of meetings using your free Gemini key.',
    gemini_key: 'Gemini key', key_local: 'Stays on this machine only.',
    get_key_link: 'Get a free key at Google AI Studio',
    gemini_key_ph: 'AIza... (your Gemini key)',
    model_flash25: 'gemini-2.5-flash (recommended)',
    summ_lang_title: 'Summary and tasks language', summ_lang_sub: 'Changes the text sent to Gemini.',
    lang_natural: 'Meeting\'s natural language', lang_browser: 'Browser language',
    auto_summ_title: 'Auto-summarize on stop',
    auto_summ_sub: 'Off: the summary is only created when you click "Create summary" in the Recordings tab.',
    // --- options: file ---
    sec_file: 'File', file_sub: 'Quality, name and where the MP3 is saved.',
    mp3_quality: 'MP3 quality',
    mp3_quality_sub: 'Mono · 44.1 kHz. Higher bitrate = better sound and bigger file. (For long meetings on Gemini, prefer economy — the summary has a size limit.)',
    bitrate_eco: 'Economy — 48 kbps (~21 MB/h)', bitrate_good: 'Good — 96 kbps (~43 MB/h)', bitrate_high: 'High — 128 kbps (~57 MB/h)',
    filename_title: 'File name',
    filename_sub_html: 'Prefix + date. Tokens: <b>AAAA</b> year · <b>MM</b> month · <b>DD</b> day · <b>hh</b> hour · <b>mm</b> min · <b>ss</b> sec.',
    preview_label: 'Preview:',
    dest_folder: 'Destination folder',
    dest_folder_sub: 'Subfolder inside Downloads. To pick any folder, turn on "Ask where to save".',
    dest_folder_ph: 'Meetings',
    ask_save: 'Ask where to save', ask_save_sub: 'Opens "Save as" for each recording.',
    // --- options: reminder ---
    sec_reminder: 'In-meeting reminder', reminder_sub: 'The floating reminder shown on Teams/Meet.',
    show_reminder: 'Show reminder', show_reminder_sub: 'A pill in the corner when you join a meeting.',
    reminder_sound: 'Sound alert', reminder_sound_sub: 'Plays a short sound and blinks once when the reminder appears.',
    reminder_corner: 'Reminder corner',
    corner_br: 'Bottom right', corner_bl: 'Bottom left', corner_tr: 'Top right', corner_tl: 'Top left',
    where_show: 'Where to show',
    // --- recordings ---
    nokey_hint_html: 'Set your <b>Gemini key</b> in Settings to transcribe and summarize recordings.',
    configure: 'Set up', your_recordings: 'Your recordings',
    import_mp3: 'Import MP3', clear_history: 'Clear history',
    import_sub_html: 'Old recordings in the folder but the audio vanished from the list? Click <b>Import MP3</b> and pick the files — it re-links them by name.',
    no_recordings: 'No recordings yet.', saved_toast: 'Saved ✓',
    // --- detail (dynamic) ---
    back_to_recordings: '← Back to recordings',
    tab_transcript: 'Transcript', tab_summary: 'Summary',
    st_transcribed: 'Transcribed', st_summary: 'Summary', st_processing: 'Processing…',
    d_open: 'Open', d_folder: 'Folder', d_download_mp3: 'Download MP3', d_delete: 'Delete',
    d_copy: 'Copy', d_copied: 'Copied ✓', d_download: 'Download', d_redo: 'Redo',
    btn_transcribe: 'Transcribe', btn_create_summary: 'Create summary',
    prog_transcribing: 'Transcribing…', prog_summarizing: 'Summarizing…',
    prog_part: 'Transcribing part %s/%s…', prog_finishing: 'Finishing…',
    empty_transcript: 'Not transcribed yet. The extension sends the audio to Gemini in parts and joins the text.',
    empty_summary: 'No summary yet. Built from the transcript: executive summary, decisions, action items and next steps.',
    audio_gone: 'Audio is no longer saved',
    del_rec_title: 'Delete recording',
    // --- toasts / confirmations ---
    t_no_key: 'Paste your Gemini key in Settings (I took you there).',
    t_transcript_ready: 'Transcript ready ✓', t_summary_ready: 'Summary ready ✓',
    t_transcript: 'Transcript', t_summary: 'Summary',
    t_quota: 'Gemini quota exhausted. Wait a bit and try again.', t_quota_wait: 'Quota exhausted — wait',
    t_audio_gone: 'Audio is no longer saved (we keep the 12 most recent recordings).',
    t_deleted: 'Recording deleted', t_download_err: 'Download error: ',
    t_importing: 'Importing…', t_import_pick: 'Select .mp3 files',
    t_import_done: 'Imported ✓ — %s re-linked, %s new',
    confirm_delete: 'Delete "%s"?\nDeletes the audio, transcript and summary. Can\'t be undone.',
    confirm_clear: 'Clear ALL history?\nDeletes ALL recordings — audio, transcripts and summaries. Can\'t be undone.',
    src_imported: 'Imported',
    // --- onboarding (first run) ---
    ob_welcome_title: 'Welcome to Meeting Recorder', ob_welcome_sub: 'Set up in 1 minute. You can do it later in Settings.',
    ob_mic_title: '1. Microphone', ob_mic_sub: 'To record your voice along with the meeting.',
    ob_mic_ok: 'Microphone allowed ✓', ob_mic_no: 'Permission denied — click again.',
    ob_notif_title: '2. Notifications', ob_notif_sub: 'Alerts you when a recording finishes (and opens it in one click).',
    ob_notif_btn: 'Test notification', ob_notif_q: 'Did you see the notification appear?',
    ob_notif_ok: 'Notifications working ✓', ob_notif_fail: 'Couldn\'t create the notification — check the permission.',
    ob_notif_tip: 'Didn\'t show? On Windows: Settings → System → Notifications → enable Brave/Chrome and turn off "Do not disturb / Focus assist". On Brave: brave://settings/content/notifications.',
    ob_test_title: 'Notification test ✓', ob_test_msg: 'If you can see this, notifications work!',
    ob_key_title: '3. Gemini key (optional)', ob_key_sub: 'To transcribe and summarize. It\'s free at Google AI Studio.',
    ob_yes: 'Yes', ob_no: 'No', ob_later: 'Do later', ob_done: 'Done', ob_reopen: 'Redo initial setup'
  }
};

if (typeof window !== 'undefined') {
  window.t = t; window.mxt = t; window.mxSetLang = mxSetLang; window.mxApplyI18n = mxApplyI18n; window.mxLang = mxLang;
}
