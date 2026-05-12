// ─── STATE ───────────────────────────────────────────────────────────────────
const S = {
  inputs: [],
  preview: null,
  output: null,
  transition: 'cut',
  duration: 500,
  bufSec: 0,
  markIn: null,
  markOut: null,
  speed: 1,
  replayActive: false,
  looping: false,
  logCount: 0,
  overlayData: null,      // { title, subtitle, position, bg }
  pgmOverlay: null,
};

// ─── BOOT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  setupDurSlider();
  setupVolSlider();
  setupAudioMeters();
  startBuffer();
  startStreamTimer();
  setupKeyboard();
  buildStreamDeckMap();
});

// ─── DURATION SLIDER ─────────────────────────────────────────────────────────
function setupDurSlider() {
  const sl = document.getElementById('dur-slider');
  sl.addEventListener('input', () => {
    S.duration = parseInt(sl.value);
    document.getElementById('dur-val').textContent = (S.duration / 1000).toFixed(1) + 's';
  });
}

// ─── VOL SLIDER ──────────────────────────────────────────────────────────────
function setupVolSlider() {
  const sl = document.getElementById('vol-slider');
  sl.addEventListener('input', () => {
    document.getElementById('vol-val').textContent = sl.value + '%';
  });
}

// ─── AUDIO METERS (simulated) ─────────────────────────────────────────────────
function setupAudioMeters() {
  setInterval(() => {
    const base = S.output !== null ? 0.6 : 0.05;
    const l = Math.min(1, base + (Math.random() * 0.3));
    const r = Math.min(1, base + (Math.random() * 0.3));
    document.getElementById('meter-l').style.height = Math.round(l * 100) + '%';
    document.getElementById('meter-r').style.height = Math.round(r * 100) + '%';
  }, 80);
}

// ─── STREAM TIMER ─────────────────────────────────────────────────────────────
function startStreamTimer() {
  const start = Date.now();
  setInterval(() => {
    const e = Math.floor((Date.now() - start) / 1000);
    const h = String(Math.floor(e / 3600)).padStart(2, '0');
    const m = String(Math.floor((e % 3600) / 60)).padStart(2, '0');
    const s = String(e % 60).padStart(2, '0');
    document.getElementById('stream-timer').textContent = `${h}:${m}:${s}`;
  }, 1000);
}

// ─── BUFFER ───────────────────────────────────────────────────────────────────
function startBuffer() {
  setInterval(() => {
    S.bufSec++;
    document.getElementById('buf-disp').textContent = fmt(S.bufSec);
  }, 1000);
}
function fmt(s) {
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// ─── ON AIR ───────────────────────────────────────────────────────────────────
function setOnAir(live) {
  document.getElementById('onair-btn').classList.toggle('live', live);
  const sv = document.getElementById('status-val');
  sv.textContent = live ? 'ON AIR' : 'STANDBY';
  sv.classList.toggle('live', live);
}

// ─── ADD INPUTS ───────────────────────────────────────────────────────────────
function addYtInput() {
  const raw = document.getElementById('yt-url').value.trim();
  const name = document.getElementById('yt-name').value.trim() || 'YouTube';
  if (!raw) return warn('Enter a YouTube URL');
  const embed = ytEmbed(raw);
  if (!embed) return warn('Could not parse YouTube URL. Use a standard watch link.');
  pushInput({ name, type: 'youtube', src: embed });
  document.getElementById('yt-url').value = '';
  document.getElementById('yt-name').value = '';
  log('Input added: ' + name, 'go');
}

function ytEmbed(url) {
  let vid = null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) vid = u.pathname.slice(1).split('?')[0];
    else if (u.hostname.includes('youtube.com')) {
      vid = u.searchParams.get('v');
      if (!vid && u.pathname.includes('/embed/')) vid = u.pathname.split('/embed/')[1]?.split('?')[0];
    }
  } catch(e) {}
  if (!vid) return null;
  // autoplay=1, mute=1 gets around the click requirement in most cases
  // enablejsapi lets us control via postMessage if needed
  return `https://www.youtube.com/embed/${vid}?autoplay=1&mute=1&controls=0&loop=1&playlist=${vid}&rel=0&modestbranding=1&enablejsapi=1`;
}

function addFileInput() {
  const f = document.getElementById('file-pick').files[0];
  const name = document.getElementById('file-name').value.trim() || 'Video File';
  if (!f) return warn('Select a video file');
  const src = URL.createObjectURL(f);
  pushInput({ name, type: 'video', src });
  document.getElementById('file-pick').value = '';
  document.getElementById('file-name').value = '';
  log('Input added: ' + name, 'go');
}

function addStillInput() {
  const f = document.getElementById('still-pick').files[0];
  const name = document.getElementById('still-name').value.trim() || 'Still';
  if (!f) return warn('Select an image file');
  const src = URL.createObjectURL(f);
  pushInput({ name, type: 'still', src });
  document.getElementById('still-pick').value = '';
  document.getElementById('still-name').value = '';
  log('Input added: ' + name, 'go');
}

function addLowerThird() {
  const title = document.getElementById('lt-title').value.trim();
  const sub   = document.getElementById('lt-sub').value.trim();
  const pos   = document.getElementById('lt-pos').value;
  const bg    = document.getElementById('lt-bg').value;
  const name  = document.getElementById('lt-name').value.trim() || 'Lower Third';
  if (!title) return warn('Enter a title');
  pushInput({ name, type: 'lowerthird', lt: { title, sub, pos, bg } });
  document.getElementById('lt-title').value = '';
  document.getElementById('lt-sub').value = '';
  document.getElementById('lt-name').value = '';
  log('Input added: ' + name, 'go');
}

function addColourInput() {
  const t = document.getElementById('col-type').value;
  const customColor = document.getElementById('col-pick').value;
  const name = document.getElementById('col-name').value.trim() || t;
  pushInput({ name, type: 'colour', colType: t, customColor });
  document.getElementById('col-name').value = '';
  log('Input added: ' + name, 'go');
}

function pushInput(inp) {
  inp.id = Date.now() + Math.random();
  S.inputs.push(inp);
  renderAll();
  renderModalList();
}

function removeInput(id) {
  S.inputs = S.inputs.filter(i => i.id !== id);
  if (S.preview === id) { S.preview = null; clearMon('prv'); }
  if (S.output  === id) { S.output  = null; clearMon('pgm'); setOnAir(false); }
  renderAll();
  renderModalList();
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderAll() {
  renderInputsRow();
  renderSwitcherRow();
  document.getElementById('no-inputs-msg').style.display = S.inputs.length ? 'none' : '';
}

function renderInputsRow() {
  const row = document.getElementById('inputs-row');
  const existing = row.querySelectorAll('.inp-tile');
  existing.forEach(e => e.remove());

  S.inputs.forEach((inp, i) => {
    const isPrv = inp.id === S.preview;
    const isPgm = inp.id === S.output;
    const cls = isPrv ? 'is-prv' : isPgm ? 'is-pgm' : '';
    const badge = isPrv
      ? '<span class="inp-tile-badge badge-prv">PRV</span>'
      : isPgm
      ? '<span class="inp-tile-badge badge-pgm">PGM</span>'
      : '';

    const div = document.createElement('div');
    div.className = 'inp-tile ' + cls;
    div.dataset.id = inp.id;
    div.innerHTML = `
      <div class="inp-tile-thumb">${tileThumb(inp)}${badge}</div>
      <div class="inp-tile-bar">
        <span class="inp-tile-name" title="${inp.name}">${inp.name}</span>
        <span class="inp-tile-num">${i + 1}</span>
      </div>
      <button class="inp-tile-del" onclick="event.stopPropagation();removeInput(${inp.id})">✕</button>
    `;
    div.addEventListener('click', () => selectPreview(inp.id));
    row.appendChild(div);
  });
}

function tileThumb(inp) {
  if (inp.type === 'youtube') return `<iframe src="${inp.src}" allow="autoplay" loading="lazy"></iframe>`;
  if (inp.type === 'video')   return `<video src="${inp.src}" autoplay muted loop playsinline></video>`;
  if (inp.type === 'still')   return `<img src="${inp.src}" alt="${inp.name}">`;
  if (inp.type === 'lowerthird') {
    return `<div class="lt-thumb"><div class="lt-bar" style="background:${inp.lt.bg};">
      <div class="lt-t">${inp.lt.title}</div>
      ${inp.lt.sub ? `<div class="lt-s">${inp.lt.sub}</div>` : ''}
    </div></div>`;
  }
  if (inp.type === 'colour') {
    if (inp.colType === 'bars')   return `<div class="col-bars"></div>`;
    if (inp.colType === 'black')  return `<div class="col-black"></div>`;
    if (inp.colType === 'white')  return `<div class="col-white"></div>`;
    if (inp.colType === 'custom') return `<div class="col-custom" style="background:${inp.customColor};"></div>`;
  }
  return '';
}

function renderSwitcherRow() {
  const row = document.getElementById('switcher-row');
  if (!S.inputs.length) { row.innerHTML = '<div class="sw-empty">Add inputs to see switcher buttons</div>'; return; }
  row.innerHTML = S.inputs.map((inp, i) => {
    const cls = inp.id === S.preview ? 'sw-prv' : inp.id === S.output ? 'sw-pgm' : '';
    return `<button class="sw-btn ${cls}" onclick="selectPreview(${inp.id})">
      <span>${inp.name}</span>
      <span class="sw-num">${i + 1}</span>
    </button>`;
  }).join('');
}

function renderModalList() {
  const list = document.getElementById('modal-inp-list');
  document.getElementById('modal-inp-count').textContent = S.inputs.length;
  list.innerHTML = S.inputs.map((inp, i) => `
    <div class="mil-item">
      <span class="mil-num">${i + 1}</span>
      <span class="mil-name">${inp.name}</span>
      <span class="mil-type">${inp.type}</span>
      <button class="mil-del" onclick="removeInput(${inp.id})">✕</button>
    </div>
  `).join('') || '<span style="font-size:10px;color:#555;">No inputs yet.</span>';
}

// ─── MONITOR LOADING ──────────────────────────────────────────────────────────
function loadMon(which, inp) {
  const screen = document.getElementById(which + '-screen');
  const nameEl = document.getElementById(which + '-source');
  nameEl.textContent = inp ? inp.name : '—';
  if (!inp) { clearMon(which); return; }

  if (inp.type === 'youtube') {
    // Re-create iframe with autoplay — browser may still require interaction
    // but mute=1 satisfies autoplay policy in most cases
    screen.innerHTML = `<iframe src="${inp.src}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    tryUnmuteYt(screen.querySelector('iframe'));
  } else if (inp.type === 'video') {
    screen.innerHTML = `<video src="${inp.src}" autoplay muted loop playsinline></video>`;
  } else if (inp.type === 'still') {
    screen.innerHTML = `<img src="${inp.src}" alt="${inp.name}">`;
  } else if (inp.type === 'lowerthird') {
    screen.innerHTML = `<div style="width:100%;height:100%;background:#111;position:relative;">
      <div class="lt-overlay ${inp.lt.pos}">
        <div class="lt-overlay-title" style="background:${inp.lt.bg};">${inp.lt.title}</div>
        ${inp.lt.sub ? `<div class="lt-overlay-sub">${inp.lt.sub}</div>` : ''}
      </div>
    </div>`;
  } else if (inp.type === 'colour') {
    const bg = inp.colType === 'bars'
      ? 'linear-gradient(90deg,#c00,#cc0,#0c0,#0cc,#00c,#c0c,#ccc)'
      : inp.colType === 'black' ? '#000'
      : inp.colType === 'white' ? '#fff'
      : inp.customColor;
    screen.innerHTML = `<div style="width:100%;height:100%;background:${bg};display:flex;align-items:center;justify-content:center;">
      <span style="font-size:11px;color:rgba(255,255,255,0.3);letter-spacing:0.15em;">${inp.name.toUpperCase()}</span>
    </div>`;
  }

  // restore overlay if pgm
  if (which === 'pgm' && S.pgmOverlay) applyOverlayToMon('pgm', S.pgmOverlay);
}

function tryUnmuteYt(iframe) {
  // After user interaction, try to unmute via postMessage
  setTimeout(() => {
    try { iframe.contentWindow.postMessage('{"event":"command","func":"unMute","args":""}', '*'); } catch(e) {}
  }, 2000);
}

function clearMon(which) {
  document.getElementById(which + '-screen').innerHTML = `<div class="monitor-empty">${which === 'prv' ? 'PREVIEW' : 'OUTPUT'}</div>`;
  document.getElementById(which + '-source').textContent = '—';
}

// ─── SWITCHING ────────────────────────────────────────────────────────────────
function selectPreview(id) {
  if (id === S.output) return;
  S.preview = id;
  loadMon('prv', S.inputs.find(i => i.id === id));
  renderAll();
  log('PRV → ' + S.inputs.find(i => i.id === id).name);
}

function selectDirect(id) {
  const inp = S.inputs.find(i => i.id === id);
  if (!inp) return;
  S.output = id;
  if (S.preview === id) S.preview = null;
  loadMon('pgm', inp);
  if (!S.preview) clearMon('prv');
  renderAll();
  setOnAir(true);
  log('DIRECT CUT → PGM: ' + inp.name, 'cut');
}

function doTransition() {
  if (S.preview === null) { log('No input in preview', 'cut'); return; }
  const prevOut = S.output;
  const prevIn  = S.preview;
  S.output  = prevIn;
  S.preview = prevOut || null;

  const inp = S.inputs.find(i => i.id === S.output);
  const backInp = prevOut ? S.inputs.find(i => i.id === prevOut) : null;

  loadMon('pgm', inp);
  if (backInp) loadMon('prv', backInp);
  else clearMon('prv');

  renderAll();
  setOnAir(true);

  const durStr = S.transition !== 'cut' ? ` (${(S.duration / 1000).toFixed(1)}s)` : '';
  log(`${S.transition.toUpperCase()}${durStr} → PGM: ${inp.name}`, 'cut');
}

function doAuto() {
  const was = S.transition;
  if (S.transition === 'cut') {
    // temporarily use fade for auto
    S.transition = 'fade';
  }
  doTransition();
  S.transition = was;
}

function doFadeToBlack() {
  S.output = null;
  clearMon('pgm');
  renderAll();
  setOnAir(false);
  log('FADE TO BLACK', 'cut');
}

function doSnapshot() {
  log('--- SNAPSHOT @ ' + new Date().toTimeString().slice(0,8) + ' ---');
}

function selTrans(btn) {
  S.transition = btn.dataset.t;
  document.querySelectorAll('.trans-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ─── OVERLAYS ─────────────────────────────────────────────────────────────────
function applyOverlay() {
  const data = {
    title: document.getElementById('oe-title').value,
    sub: document.getElementById('oe-subtitle').value,
    pos: document.getElementById('oe-position').value,
    bg: document.getElementById('oe-bg').value,
  };
  applyOverlayToMon('prv', data);
  S.overlayData = data;
}

function applyOverlayToMon(which, data) {
  const screen = document.getElementById(which + '-screen');
  let ov = screen.querySelector('.lt-overlay');
  if (ov) ov.remove();
  const d = document.createElement('div');
  d.className = 'lt-overlay ' + data.pos;
  d.innerHTML = `<div class="lt-overlay-title" style="background:${data.bg};">${data.title}</div>
    ${data.sub ? `<div class="lt-overlay-sub">${data.sub}</div>` : ''}`;
  screen.appendChild(d);
  if (which === 'pgm') S.pgmOverlay = data;
}

function clearOverlay() {
  ['prv', 'pgm'].forEach(w => {
    const ov = document.getElementById(w + '-screen').querySelector('.lt-overlay');
    if (ov) ov.remove();
  });
  S.overlayData = null; S.pgmOverlay = null;
}

function closeOverlayEditor() { document.getElementById('overlay-editor').style.display = 'none'; }

// ─── REPLAY ───────────────────────────────────────────────────────────────────
function doMark(which) {
  if (which === 'in') {
    S.markIn = S.bufSec;
    document.getElementById('in-disp').textContent = fmt(S.markIn);
    log('MARK IN @ ' + fmt(S.markIn), 'mark');
  } else {
    S.markOut = S.bufSec;
    document.getElementById('out-disp').textContent = fmt(S.markOut);
    log('MARK OUT @ ' + fmt(S.markOut), 'mark');
  }
}

function doReplayPlay() {
  if (S.markIn === null || S.markOut === null) { log('Set mark in and out first', 'cut'); return; }
  S.replayActive = true;
  log(`PLAY replay ${fmt(S.markIn)}→${fmt(S.markOut)} @ ${S.speed}x`, 'replay');
  const dur = (Math.abs(S.markOut - S.markIn) / S.speed) * 1000;
  setTimeout(() => { if (S.replayActive && !S.looping) { S.replayActive = false; log('Replay complete'); } }, dur);
}

function doReplayLoop() {
  if (S.markIn === null || S.markOut === null) { log('Set mark in and out first', 'cut'); return; }
  S.looping = true; S.replayActive = true;
  log(`LOOP @ ${S.speed}x`, 'replay');
}

function doReplayStop() {
  S.replayActive = false; S.looping = false;
  log('STOP replay');
}

function doReturnLive() {
  S.replayActive = false; S.looping = false;
  log('RETURN TO LIVE', 'go');
}

function setSpeed(v) {
  S.speed = v;
  document.getElementById('spd-disp').textContent = v + 'x';
  document.querySelectorAll('.spd-btn').forEach(b => b.classList.remove('active'));
  const map = { 0.25: 0, 0.5: 1, 1: 2, 2: 3 };
  const idx = map[v];
  if (idx !== undefined) document.querySelectorAll('.spd-btn')[idx]?.classList.add('active');
  log('Speed → ' + v + 'x', 'speed');
}

// ─── LOG ──────────────────────────────────────────────────────────────────────
function log(msg, type) {
  const body = document.getElementById('log-body');
  const empty = body.querySelector('.log-empty-msg');
  if (empty) empty.remove();
  S.logCount++;
  const ts = new Date().toTimeString().slice(0, 8);
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-ts">${ts}</span><span class="log-msg ${type || ''}">${msg}</span>`;
  body.appendChild(div);
  body.scrollLeft = body.scrollWidth;
  document.getElementById('log-count').textContent = S.logCount + (S.logCount === 1 ? ' event' : ' events');
}

function clearLog() {
  document.getElementById('log-body').innerHTML = '<span class="log-empty-msg">Waiting for production actions...</span>';
  S.logCount = 0;
  document.getElementById('log-count').textContent = '0 events';
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-bg')) closeModal(e.target.id);
});

function switchMTab(tab, btn) {
  document.querySelectorAll('.mtab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.modal-form').forEach(f => f.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('mf-' + tab).classList.add('active');
}

function warn(msg) { alert(msg); }

// ─── STREAM DECK MAP ──────────────────────────────────────────────────────────
const sdButtons = [
  { label: 'Mark In',     kb: 'I',     cls: 'mark' },
  { label: 'Mark Out',    kb: 'O',     cls: 'mark' },
  { label: 'Play Replay', kb: 'P',     cls: 'go' },
  { label: 'Loop Replay', kb: 'L',     cls: 'go' },
  { label: 'Stop',        kb: '—',     cls: 'replay' },
  { label: '0.5x Speed',  kb: '[',     cls: 'speed' },
  { label: '1x Speed',    kb: ']',     cls: 'speed' },
  { label: 'Return Live', kb: 'R',     cls: 'go' },
  { label: 'CUT / Trans', kb: 'Space', cls: 'go' },
  { label: 'Auto Trans',  kb: 'A',     cls: 'go' },
  { label: 'Fade→Black',  kb: 'B',     cls: 'replay' },
  { label: 'Select Cut',  kb: 'F1',    cls: 'replay' },
  { label: 'Select Fade', kb: 'F2',    cls: 'replay' },
  { label: 'Preview 1',   kb: '1',     cls: 'speed' },
  { label: 'Preview 2',   kb: '2',     cls: 'speed' },
];

function buildStreamDeckMap() {
  const grid = document.getElementById('sd-grid');
  grid.innerHTML = sdButtons.map(b => `
    <div class="sd-key ${b.cls}">
      <div class="sd-key-action">${b.label}</div>
      <div class="sd-key-kb">${b.kb}</div>
    </div>
  `).join('') + '<div class="sd-key blank"></div><div class="sd-key blank"></div><div class="sd-key blank"></div><div class="sd-key blank"></div><div class="sd-key blank"></div>';
}

// ─── KEYBOARD ─────────────────────────────────────────────────────────────────
function setupKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    const k = e.key;
    const num = parseInt(k);

    if (!isNaN(num) && num >= 1 && num <= 9) {
      e.preventDefault();
      const inp = S.inputs[num - 1];
      if (!inp) return;
      if (e.shiftKey) selectDirect(inp.id);
      else selectPreview(inp.id);
      return;
    }

    if (k === 'F1') { e.preventDefault(); selTrans(document.querySelector('[data-t="cut"]')); return; }
    if (k === 'F2') { e.preventDefault(); selTrans(document.querySelector('[data-t="fade"]')); return; }
    if (k === 'F3') { e.preventDefault(); selTrans(document.querySelector('[data-t="wipe"]')); return; }
    if (k === 'F4') { e.preventDefault(); selTrans(document.querySelector('[data-t="slide"]')); return; }

    switch (k) {
      case ' ':         e.preventDefault(); doTransition(); break;
      case 'a': case 'A': doAuto(); break;
      case 'b': case 'B': doFadeToBlack(); break;
      case 'i': case 'I': doMark('in'); break;
      case 'o': case 'O': doMark('out'); break;
      case 'p': case 'P': doReplayPlay(); break;
      case 'l': case 'L': doReplayLoop(); break;
      case 'r': case 'R': doReturnLive(); break;
      case '[':           setSpeed(0.5); break;
      case ']':           setSpeed(1); break;
      case 'Escape':
        document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
        break;
    }
  });
}
