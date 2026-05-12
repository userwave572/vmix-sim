// ─── STATE ───────────────────────────────────────────────────────────────────
const state = {
  inputs: [],          // { id, name, type, src, thumbType }
  preview: null,       // input id
  output: null,        // input id
  transition: 'cut',
  duration: 500,
  bufferSec: 0,
  markIn: null,
  markOut: null,
  replaySpeed: 1,
  replayActive: false,
  looping: false,
  streamStart: null,
  logEntries: [],
  logCount: 0,
};

let bufferInterval = null;
let streamTimerInterval = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  renderDeck();
  renderScenes();
  startBuffer();
  startStreamTimer();
  setupKeyboard();
  document.getElementById('dur-slider').addEventListener('input', e => {
    state.duration = parseInt(e.target.value);
    document.getElementById('dur-val').textContent = (state.duration / 1000).toFixed(1) + 's';
  });
  renderInputsPanel();
  renderInputsList();
});

// ─── INPUTS ───────────────────────────────────────────────────────────────────
function addYouTubeInput() {
  const rawUrl = document.getElementById('yt-url').value.trim();
  const name = document.getElementById('yt-name').value.trim() || 'YouTube Input';
  if (!rawUrl) return alert('Enter a YouTube URL.');
  const embedUrl = toYouTubeEmbed(rawUrl);
  if (!embedUrl) return alert('Could not parse YouTube URL. Try a standard watch or youtu.be link.');
  const inp = { id: Date.now(), name, type: 'youtube', src: embedUrl };
  state.inputs.push(inp);
  renderInputsPanel();
  renderInputsList();
  document.getElementById('yt-url').value = '';
  document.getElementById('yt-name').value = '';
  addLog('Input added: ' + name, 'info');
}

function toYouTubeEmbed(url) {
  let vid = null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      vid = u.pathname.slice(1);
    } else if (u.hostname.includes('youtube.com')) {
      vid = u.searchParams.get('v');
      if (!vid && u.pathname.includes('/embed/')) vid = u.pathname.split('/embed/')[1].split('/')[0];
    }
  } catch(e) {}
  if (!vid) return null;
  return `https://www.youtube.com/embed/${vid}?autoplay=1&mute=1&controls=0&loop=1&playlist=${vid}&enablejsapi=1`;
}

function addFileInput() {
  const fileEl = document.getElementById('file-input');
  const name = document.getElementById('file-name').value.trim() || 'Local Video';
  if (!fileEl.files[0]) return alert('Select a video file.');
  const url = URL.createObjectURL(fileEl.files[0]);
  const inp = { id: Date.now(), name, type: 'video', src: url };
  state.inputs.push(inp);
  renderInputsPanel();
  renderInputsList();
  fileEl.value = '';
  document.getElementById('file-name').value = '';
  addLog('Input added: ' + name, 'info');
}

function addColorInput() {
  const type = document.getElementById('color-type').value;
  const name = document.getElementById('color-name').value.trim() || type;
  const inp = { id: Date.now(), name, type: 'color', thumbType: type };
  state.inputs.push(inp);
  renderInputsPanel();
  renderInputsList();
  document.getElementById('color-name').value = '';
  addLog('Input added: ' + name, 'info');
}

function removeInput(id) {
  state.inputs = state.inputs.filter(i => i.id !== id);
  if (state.preview === id) { state.preview = null; clearMonitor('preview'); }
  if (state.output === id) { state.output = null; clearMonitor('output'); }
  renderInputsPanel();
  renderInputsList();
}

function renderInputsPanel() {
  const grid = document.getElementById('input-grid');
  const empty = document.getElementById('input-empty');
  const count = document.getElementById('input-count');
  count.textContent = state.inputs.length;

  if (!state.inputs.length) {
    empty.style.display = 'flex';
    grid.innerHTML = '';
    grid.appendChild(empty);
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = state.inputs.map((inp, i) => {
    const isPreview = inp.id === state.preview;
    const isOutput = inp.id === state.output;
    const cls = isPreview ? 'in-preview' : isOutput ? 'in-output' : '';
    const badge = isPreview
      ? '<span class="tile-badge badge-prv">PRV</span>'
      : isOutput
      ? '<span class="tile-badge badge-pgm">PGM</span>'
      : '';
    const thumb = thumbHTML(inp);

    return `
      <div class="input-tile ${cls}" onclick="selectInput(${inp.id})">
        <div class="input-tile-thumb">
          ${thumb}
          ${badge}
        </div>
        <div class="input-tile-info">
          <span class="input-tile-name">${inp.name}</span>
          <span class="input-tile-num">${i + 1}</span>
        </div>
        <button class="input-tile-remove" onclick="event.stopPropagation(); removeInput(${inp.id})">✕</button>
      </div>
    `;
  }).join('');
}

function thumbHTML(inp) {
  if (inp.type === 'youtube') {
    return `<iframe src="${inp.src}" allow="autoplay" allowfullscreen loading="lazy"></iframe>`;
  }
  if (inp.type === 'video') {
    return `<video src="${inp.src}" autoplay muted loop playsinline></video>`;
  }
  if (inp.type === 'color') {
    const cls = 'thumb-' + (inp.thumbType || 'black');
    return `<div class="thumb-overlay ${cls}" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
      <span style="font-family:monospace;font-size:9px;color:rgba(255,255,255,0.5);letter-spacing:0.1em;">${inp.thumbType?.toUpperCase() || ''}</span>
    </div>`;
  }
  return '';
}

function renderInputsList() {
  const list = document.getElementById('inputs-list');
  const cnt = document.getElementById('inputs-list-count');
  cnt.textContent = state.inputs.length;
  list.innerHTML = state.inputs.map((inp, i) => `
    <div class="inputs-list-item">
      <div class="ili-left">
        <span class="ili-num">${i + 1}</span>
        <span class="ili-name">${inp.name}</span>
        <span class="ili-type">${inp.type}</span>
      </div>
      <button class="ili-del" onclick="removeInput(${inp.id})">✕</button>
    </div>
  `).join('') || '<div style="color:var(--text3);font-size:12px;padding:8px 0;">No inputs yet.</div>';
}

// ─── SWITCHING ────────────────────────────────────────────────────────────────
function selectInput(id) {
  if (id === state.output) return;
  state.preview = id;
  const inp = state.inputs.find(i => i.id === id);
  loadMonitor('preview', inp);
  renderInputsPanel();
  addLog('PRV → ' + inp.name, 'info');
}

function selectInputDirect(id) {
  const inp = state.inputs.find(i => i.id === id);
  if (!inp) return;
  state.output = id;
  if (state.preview === id) state.preview = null;
  loadMonitor('output', inp);
  renderInputsPanel();
  setOnAir(true);
  addLog('CUT (direct) → PGM: ' + inp.name, 'cut');
}

function doTransition() {
  if (state.preview === null) return;
  const prevOutId = state.output;
  const prevInId = state.preview;

  state.output = prevInId;
  state.preview = prevOutId;

  const inp = state.inputs.find(i => i.id === state.output);
  const prevOut = prevOutId ? state.inputs.find(i => i.id === prevOutId) : null;

  loadMonitor('output', inp);
  if (prevOut) loadMonitor('preview', prevOut);
  else clearMonitor('preview');

  renderInputsPanel();
  setOnAir(true);

  if (state.transition !== 'cut') {
    const overlay = document.getElementById('trans-overlay');
    overlay.className = 'fade';
    setTimeout(() => overlay.className = '', state.duration);
  }

  addLog(`${state.transition.toUpperCase()} → PGM: ${inp.name}${state.transition !== 'cut' ? ' (' + (state.duration/1000).toFixed(1) + 's)' : ''}`, 'cut');
}

function doAuto() {
  const prev = state.transition;
  if (state.transition === 'cut') state.transition = 'fade';
  doTransition();
  state.transition = prev;
  addLog('AUTO transition executed', 'info');
}

function loadMonitor(which, inp) {
  const screen = document.getElementById(which + '-screen');
  const nameEl = document.getElementById(which + '-name');
  if (!inp) { clearMonitor(which); return; }
  nameEl.textContent = inp.name;

  if (inp.type === 'youtube') {
    screen.innerHTML = `<iframe src="${inp.src}" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
  } else if (inp.type === 'video') {
    screen.innerHTML = `<video src="${inp.src}" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover;"></video>`;
  } else if (inp.type === 'color') {
    const bg = { bars: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#fff)', black: '#000', scorebug: '#111', lowerthird: '#111', titles: '#111' };
    screen.innerHTML = `<div style="width:100%;height:100%;background:${bg[inp.thumbType]||'#111'};display:flex;align-items:center;justify-content:center;">
      <span style="font-family:monospace;font-size:14px;color:rgba(255,255,255,0.4);letter-spacing:0.15em;">${inp.name.toUpperCase()}</span>
    </div>`;
  }
}

function clearMonitor(which) {
  document.getElementById(which + '-screen').innerHTML = `<div class="monitor-placeholder"><span class="placeholder-text">${which === 'preview' ? 'PREVIEW' : 'PROGRAM'}</span></div>`;
  document.getElementById(which + '-name').textContent = '—';
}

function setTrans(btn) {
  state.transition = btn.dataset.trans;
  document.querySelectorAll('.trans-type').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ─── STREAM TIMER & ON AIR ────────────────────────────────────────────────────
function startStreamTimer() {
  state.streamStart = Date.now();
  streamTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.streamStart) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    document.getElementById('stream-timer').textContent = `${h}:${m}:${s}`;
  }, 1000);
}

function setOnAir(live) {
  const dot = document.getElementById('on-air-dot');
  const lbl = document.getElementById('on-air-label');
  if (live) { dot.classList.add('live'); lbl.classList.add('live'); lbl.textContent = 'ON AIR'; }
  else { dot.classList.remove('live'); lbl.classList.remove('live'); lbl.textContent = 'STANDBY'; }
}

// ─── BUFFER / REPLAY ──────────────────────────────────────────────────────────
function startBuffer() {
  bufferInterval = setInterval(() => {
    state.bufferSec++;
    document.getElementById('buf-time').textContent = fmtSec(state.bufferSec);
  }, 1000);
}

function fmtSec(s) {
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

const deckConfig = [
  { label: 'MARK IN', cls: 'mark', key: 'I', action: 'markIn', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6"/><line x1="12" y1="2" x2="12" y2="6"/></svg>` },
  { label: 'MARK OUT', cls: 'mark', key: 'O', action: 'markOut', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6"/><line x1="12" y1="18" x2="12" y2="22"/></svg>` },
  { label: 'PLAY', cls: 'go', key: 'P', action: 'playReplay', icon: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>` },
  { label: 'LOOP', cls: 'go', key: 'L', action: 'loopReplay', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17,1 21,5 17,9"/><path d="M3,11V9a4,4,0,0,1,4-4h14"/><polyline points="7,23 3,19 7,15"/><path d="M21,13v2a4,4,0,0,1-4,4H3"/></svg>` },
  { label: 'STOP', cls: 'replay', key: null, action: 'stopReplay', icon: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16"/></svg>` },
  { label: '0.25x', cls: 'speed', key: null, action: 'speed025', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>` },
  { label: '0.5x', cls: 'speed', key: '[', action: 'speed05', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>` },
  { label: '1x', cls: 'speed', key: ']', action: 'speed1', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>` },
  { label: 'CAM A', cls: 'replay', key: null, action: 'camA', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="15" height="10" rx="2"/><polygon points="17,9 22,6 22,18 17,15"/></svg>` },
  { label: 'CAM B', cls: 'replay', key: null, action: 'camB', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="15" height="10" rx="2"/><polygon points="17,9 22,6 22,18 17,15"/></svg>` },
  { label: '–5s', cls: 'replay', key: null, action: 'jumpBack', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1,4 1,10 7,10"/><path d="M3.5,15a9,9,0,1,0,.5-3"/></svg>` },
  { label: '+5s', cls: 'replay', key: null, action: 'jumpFwd', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23,4 23,10 17,10"/><path d="M20.5,15a9,9,0,1,1-.5-3"/></svg>` },
  { label: 'TO AIR', cls: 'go', key: null, action: 'takeAir', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1,6 Q12,1 23,6"/><path d="M5,10 Q12,6 19,10"/><circle cx="12" cy="14" r="2"/><line x1="12" y1="16" x2="12" y2="22"/></svg>` },
  { label: 'LIVE', cls: 'go', key: 'R', action: 'returnLive', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M20.2,7.8a8,8,0,0,1,0,8.4M3.8,7.8a8,8,0,0,0,0,8.4"/></svg>` },
  { label: '', cls: 'blank', key: null, action: null, icon: '' },
];

const deckActions = {
  markIn: () => {
    state.markIn = state.bufferSec;
    document.getElementById('mark-in-disp').textContent = fmtSec(state.markIn);
    document.getElementById('mark-in-disp').classList.add('active');
    addLog('MARK IN @ ' + fmtSec(state.markIn), 'mark');
  },
  markOut: () => {
    state.markOut = state.bufferSec;
    document.getElementById('mark-out-disp').textContent = fmtSec(state.markOut);
    document.getElementById('mark-out-disp').classList.add('active');
    addLog('MARK OUT @ ' + fmtSec(state.markOut), 'mark');
  },
  playReplay: () => {
    if (state.markIn === null || state.markOut === null) { addLog('Set mark in/out first', 'cut'); return; }
    state.replayActive = true;
    addLog(`PLAY replay ${fmtSec(state.markIn)}→${fmtSec(state.markOut)} @ ${state.replaySpeed}x`, 'replay');
    const dur = Math.abs(state.markOut - state.markIn) / state.replaySpeed;
    setTimeout(() => { if (state.replayActive && !state.looping) { state.replayActive = false; addLog('Replay complete', 'info'); } }, dur * 1000);
  },
  loopReplay: () => {
    state.looping = true; state.replayActive = true;
    addLog(`LOOP replay @ ${state.replaySpeed}x`, 'replay');
  },
  stopReplay: () => {
    state.replayActive = false; state.looping = false;
    addLog('STOP replay', 'info');
  },
  speed025: () => { state.replaySpeed = 0.25; document.getElementById('speed-disp').textContent = '0.25x'; addLog('Speed → 0.25x', 'speed'); },
  speed05: () => { state.replaySpeed = 0.5; document.getElementById('speed-disp').textContent = '0.5x'; addLog('Speed → 0.5x', 'speed'); },
  speed1: () => { state.replaySpeed = 1; document.getElementById('speed-disp').textContent = '1x'; addLog('Speed → 1x', 'speed'); },
  camA: () => addLog('Replay source → CAM A', 'replay'),
  camB: () => addLog('Replay source → CAM B', 'replay'),
  jumpBack: () => { state.bufferSec = Math.max(0, state.bufferSec - 5); document.getElementById('buf-time').textContent = fmtSec(state.bufferSec); addLog('Scrub –5s', 'replay'); },
  jumpFwd: () => { state.bufferSec += 5; document.getElementById('buf-time').textContent = fmtSec(state.bufferSec); addLog('Scrub +5s', 'replay'); },
  takeAir: () => { addLog('Replay TO AIR', 'go'); setOnAir(true); },
  returnLive: () => { addLog('RETURN TO LIVE', 'go'); setOnAir(true); },
};

function renderDeck() {
  const grid = document.getElementById('deck-grid');
  grid.innerHTML = deckConfig.map((btn, i) => {
    if (btn.cls === 'blank') return `<div class="dk-btn blank"></div>`;
    const hint = btn.key ? `<span style="font-size:8px;opacity:0.5;">${btn.key}</span>` : '';
    return `<button class="dk-btn ${btn.cls}" id="dk-${i}" onclick="fireDeck('${btn.action}', ${i})" title="${btn.label}">
      ${btn.icon}
      <span>${btn.label}</span>
      ${hint}
    </button>`;
  }).join('');
}

function fireDeck(action, idx) {
  if (!action || !deckActions[action]) return;
  deckActions[action]();
  const btn = document.getElementById('dk-' + idx);
  if (btn) {
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 200);
  }
}

const scenes = ['WIDE SHOT', 'SIDELINE', 'CLOSE UP', 'SCOREBUG', 'TITLES', 'REPLAY OUT', 'INTERVIEW', 'B-ROLL'];
function renderScenes() {
  document.getElementById('scene-grid').innerHTML = scenes.map((s, i) =>
    `<button class="scene-btn" id="sc-${i}" onclick="fireScene(${i})">${s}</button>`
  ).join('');
}
function fireScene(i) {
  document.querySelectorAll('.scene-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('sc-' + i).classList.add('active');
  addLog('Scene → ' + scenes[i], 'info');
}

// ─── LOG ──────────────────────────────────────────────────────────────────────
function addLog(msg, type) {
  const log = document.getElementById('event-log');
  const empty = log.querySelector('.log-empty');
  if (empty) empty.remove();
  state.logCount++;
  const now = new Date();
  const ts = now.toTimeString().slice(0, 8);
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-ts">${ts}</span><span class="log-msg ${type || ''}">${msg}</span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  document.getElementById('log-count').textContent = state.logCount + ' event' + (state.logCount !== 1 ? 's' : '');
}

function clearLog() {
  document.getElementById('event-log').innerHTML = '<div class="log-empty">Waiting for production actions...</div>';
  state.logCount = 0;
  document.getElementById('log-count').textContent = '0 events';
}

// ─── TABS / MODALS ────────────────────────────────────────────────────────────
function switchRightTab(tab, btn) {
  document.querySelectorAll('.right-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.right-tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
});

function switchFormTab(tab, btn) {
  document.querySelectorAll('.ift').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.input-form').forEach(f => f.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('form-' + tab).classList.add('active');
}

// ─── KEYBOARD ─────────────────────────────────────────────────────────────────
function setupKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    const key = e.key;
    const num = parseInt(key);

    if (!isNaN(num) && num >= 1 && num <= 9) {
      if (e.shiftKey) {
        const inp = state.inputs[num - 1];
        if (inp) selectInputDirect(inp.id);
      } else {
        const inp = state.inputs[num - 1];
        if (inp) selectInput(inp.id);
      }
      return;
    }

    if (key === 'F1') { e.preventDefault(); setTrans(document.querySelector('[data-trans="cut"]')); return; }
    if (key === 'F2') { e.preventDefault(); setTrans(document.querySelector('[data-trans="fade"]')); return; }
    if (key === 'F3') { e.preventDefault(); setTrans(document.querySelector('[data-trans="wipe"]')); return; }
    if (key === 'F4') { e.preventDefault(); setTrans(document.querySelector('[data-trans="zoom"]')); return; }

    switch (key) {
      case ' ': e.preventDefault(); doTransition(); break;
      case 'a': case 'A': doAuto(); break;
      case 'i': case 'I': fireDeckByAction('markIn'); break;
      case 'o': case 'O': fireDeckByAction('markOut'); break;
      case 'p': case 'P': fireDeckByAction('playReplay'); break;
      case 'l': case 'L': fireDeckByAction('loopReplay'); break;
      case 'r': case 'R': fireDeckByAction('returnLive'); break;
      case '[': fireDeckByAction('speed05'); break;
      case ']': fireDeckByAction('speed1'); break;
      case 'Escape':
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
        break;
    }
  });
}

function fireDeckByAction(action) {
  const idx = deckConfig.findIndex(d => d.action === action);
  fireDeck(action, idx);
}

// ─── TRANS OVERLAY ────────────────────────────────────────────────────────────
document.body.insertAdjacentHTML('beforeend', '<div id="trans-overlay"></div>');
