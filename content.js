// Content script: injeta o "pill" flutuante no Meet/Teams para lembrar o usuário
// e permitir iniciar/parar a gravação direto da página. Usa Shadow DOM.
(() => {
  if (window.self !== window.top) return; // só no frame principal (evita pills duplicados em iframes)
  if (window.__mappexRecPill) return;
  window.__mappexRecPill = true;

  const DEFAULTS = {
    bitrate: 96, audioSource: 'system', micEnabled: false, micGain: 2, micDeviceId: '',
    subfolder: 'Reuniões', askWhereToSave: false,
    filenamePrefix: 'reuniao', dateFormat: 'AAAAMMDD-hhmm',
    showPill: true, pillCorner: 'bottom-right', domMeet: true, domTeams: true,
    autoSummary: false, summaryLang: 'auto', geminiModel: 'gemini-2.5-flash', pillSound: true
  };
  const HOST_ID = 'mappex-rec-pill-host';

  let recording = false, startedAt = 0, tick = null, host = null, el = {}, pillSound = true;

  // true só enquanto o contexto da extensão é válido. Após recarregar a extensão, o
  // content script de abas já abertas fica "órfão" e qualquer chamada chrome.* quebra.
  function alive() { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } }

  try {
    chrome.storage.sync.get(DEFAULTS, (s) => {
      if (chrome.runtime.lastError || !s) return;
      const isMeet = location.hostname.includes('meet.google.com');
      const isTeams = location.hostname.includes('teams.');
      if (!s.showPill) return;
      if (isMeet && !s.domMeet) return;
      if (isTeams && !s.domTeams) return;
      pillSound = !!s.pillSound;
      build(s.pillCorner || 'bottom-right');
      if (!alive()) { nudge(); return; }
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
        if (chrome.runtime.lastError || !res || typeof res.recording !== 'boolean') { nudge(); return; }
        if (res.recording) setRecording(true, res.startedAt);
        else nudge();
      });
    });
  } catch (e) { /* contexto da extensão inválido — recarregue a aba */ }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!el.pill) return;
    if (msg.type === 'STATE') setRecording(msg.recording, msg.startedAt);
    if (msg.type === 'SAVED') flash('MP3 salvo ✓');
    if (msg.type === 'PILL_ERROR') setError(msg.error);
  });

  const TEMPLATE = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
      .wrap { --teal: hsl(188 62% 38%); --teal-strong: hsl(190 64% 28%); --ink: hsl(190 24% 14%);
              --muted: hsl(190 12% 42%); --surface: hsl(188 32% 99%); --surface-2: hsl(188 26% 95%);
              --border: hsl(188 22% 86%); --rec: hsl(8 74% 52%); position: relative; }
      .pill { display: inline-flex; align-items: center; gap: 8px; background: var(--surface);
              border: 1px solid var(--border); border-radius: 24px; padding: 8px 8px 8px 16px;
              box-shadow: 0 413px 116px 0 rgba(10,39,41,0), 0 264px 106px 0 rgba(10,39,41,0.01),
                          0 149px 89px 0 rgba(10,39,41,0.02), 0 66px 66px 0 rgba(10,39,41,0.03),
                          0 17px 36px 0 rgba(10,39,41,0.04); }
      .pill.blink { animation: mxflash .5s ease-out 1; }
      @keyframes mxflash { 0% { transform: scale(1); } 30% { transform: scale(1.07); } 100% { transform: scale(1); } }
      .main { display: inline-flex; align-items: center; gap: 8px; border: 0; background: transparent;
              cursor: pointer; padding: 6px 8px; border-radius: 24px; }
      .main:hover { background: var(--surface-2); }
      .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--muted); flex: none; }
      .label { font-size: 14px; font-weight: 400; color: var(--ink); white-space: nowrap; }
      .time { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
      .close { border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 13px;
               width: 24px; height: 24px; border-radius: 8px; line-height: 1; }
      .close:hover { background: var(--surface-2); color: var(--ink); }
      .pill[data-state="rec"] { border-color: hsl(8 60% 82%); background: hsl(8 80% 98%); }
      .pill[data-state="rec"] .dot { background: var(--rec); animation: pulse 1.4s ease-in-out infinite; }
      .pill[data-state="rec"] .label { color: hsl(8 58% 38%); }
      @keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.82); } }
      .nudge { position: absolute; bottom: calc(100% + 12px); right: 0; width: 232px; background: var(--teal);
               color: hsl(188 40% 97%); border-radius: 24px; padding: 16px; font-size: 13px; line-height: 1.5;
               opacity: 0; transform: translateY(8px); pointer-events: none; transition: .25s ease;
               box-shadow: 0 17px 36px 0 rgba(10,39,41,0.18); }
      .nudge.show { opacity: 1; transform: translateY(0); pointer-events: auto; }
      .wrap.np-top .nudge { bottom: auto; top: calc(100% + 12px); }
      .wrap.np-left .nudge { right: auto; left: 0; }
      .nudge .t { font-weight: 700; margin: 0 0 8px; font-size: 14px; }
      .nudge .acts { display: flex; gap: 8px; margin-top: 16px; }
      .nudge button { border: 0; border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer; font-weight: 400; }
      .nudge .yes { background: hsl(188 40% 97%); color: var(--teal-strong); }
      .nudge .no { background: transparent; color: hsl(188 40% 88%); }
    </style>
    <div class="wrap">
      <div class="nudge">
        <p class="t">Reunião detectada</p>
        <div>Quer gravar o áudio para resumir depois no Gemini?</div>
        <div class="acts">
          <button class="yes">Gravar</button>
          <button class="no">Agora não</button>
        </div>
      </div>
      <div class="pill" data-state="idle">
        <button class="main">
          <span class="dot"></span>
          <span class="label">Gravar reunião</span>
          <span class="time"></span>
        </button>
        <button class="close" title="Ocultar">&#10005;</button>
      </div>
    </div>`;

  function build(corner) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial; position:fixed; z-index:2147483647;';
    const m = '20px';
    if (corner.includes('top')) host.style.top = m; else host.style.bottom = m;
    if (corner.includes('left')) host.style.left = m; else host.style.right = m;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = TEMPLATE;
    document.documentElement.appendChild(host);

    // o balão abre para o lado que cabe na tela, conforme o canto escolhido
    const wrap = root.querySelector('.wrap');
    if (corner.includes('top')) wrap.classList.add('np-top');
    if (corner.includes('left')) wrap.classList.add('np-left');

    el.pill = root.querySelector('.pill');
    el.label = root.querySelector('.label');
    el.time = root.querySelector('.time');
    el.nudge = root.querySelector('.nudge');
    root.querySelector('.main').addEventListener('click', toggle);
    root.querySelector('.close').addEventListener('click', () => { stopTick(); recording = false; host.remove(); });
    root.querySelector('.yes').addEventListener('click', () => { hideNudge(); toggle(); });
    root.querySelector('.no').addEventListener('click', hideNudge);
  }

  // aviso sonoro curto (dois tons). Pode ser bloqueado por autoplay até o usuário interagir.
  function beep() {
    try {
      // Sem interação prévia na página, o Chrome bloqueia o AudioContext e loga aviso.
      // Só criamos o contexto se a página já teve gesto do usuário (sticky activation).
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type = 'sine';
      const t = ac.currentTime;
      o.frequency.setValueAtTime(660, t);
      o.frequency.setValueAtTime(990, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.start(t); o.stop(t + 0.32);
      o.onended = () => { try { ac.close(); } catch (e) { /* ignore */ } };
    } catch (e) { /* autoplay bloqueado */ }
  }

  function toggle() {
    if (!alive()) { setError('A extensão foi recarregada. Atualize esta aba (F5) para gravar.'); return; }
    try {
      if (recording) {
        el.label.textContent = 'Convertendo…';
        chrome.runtime.sendMessage({ type: 'STOP' }, () => { void chrome.runtime.lastError; });
      } else {
        chrome.runtime.sendMessage({ type: 'PILL_START' }, (res) => {
          if (chrome.runtime.lastError) { setError('Falha de comunicação com a extensão: ' + chrome.runtime.lastError.message + '. Recarregue a aba (F5).'); return; }
          if (!res || !res.ok) { setError((res && res.error) || 'Não consegui iniciar.'); return; }
          el.label.textContent = 'Iniciando…'; // aguarda STATE (gravando) ou PILL_ERROR
        });
      }
    } catch (e) {
      setError('A extensão foi recarregada. Atualize esta aba (F5) para gravar.');
    }
  }

  function setRecording(on, started) {
    recording = on;
    if (on) {
      startedAt = started || Date.now();
      el.pill.dataset.state = 'rec';
      el.label.textContent = 'Parar';
      startTick();
    } else {
      el.pill.dataset.state = 'idle';
      el.label.textContent = 'Gravar reunião';
      el.time.textContent = '';
      stopTick();
    }
  }

  function startTick() { stopTick(); render(); tick = setInterval(render, 1000); }
  function stopTick() { if (tick) clearInterval(tick); tick = null; }
  function render() {
    const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    el.time.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  // ao aparecer: balão + UMA piscada + aviso sonoro (se ligado)
  function nudge() {
    el.nudge.classList.add('show');
    el.pill.classList.add('blink');
    setTimeout(() => el.pill.classList.remove('blink'), 600);
    if (pillSound) beep();
    setTimeout(hideNudge, 9000);
  }
  function hideNudge() { el.nudge && el.nudge.classList.remove('show'); }
  function flash(t) {
    if (recording) return;
    el.label.textContent = t;
    setTimeout(() => { if (!recording) el.label.textContent = 'Gravar reunião'; }, 2500);
  }
  function setError(t) {
    el.nudge.querySelector('.t').textContent = 'Não consegui iniciar';
    el.nudge.querySelector('div').textContent = t;
    el.nudge.classList.add('show');
    setTimeout(hideNudge, 6000);
  }
})();
