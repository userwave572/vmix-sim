'use strict';

// ─── STATE ───────────────────────────────────────────────────────────────────
const S = {
  inputs: [],
  preview: null,   // id
  output: null,    // id
  trans: 'Cut',
  duration: 1000,
  ftbDur: 500,
  ftbActive: false,

  // replay
  bufSec: 0,
  markIn: null,
  markOut: null,
  speed: 1.0,
  replayState: 'idle', // idle | playing | looping
  replayTimer: null,

  // lower thirds
  lts: [],        // saved lower thirds
  prvLT: null,    // active LT on preview
  pgmLT: null,    // active LT on program

  // config
  customTrans: [], // [{key:'F6', trans:'Fade', dur:500}, ...]

  logCount: 0,
};

// ─── BOOT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  setupDurSlider();
  setupVolSlider();
  startBuffer();
  startStreamTimer();
  startAudioMeters();
  setupKeyboard();
  buildCustomTransUI();
});

// ─── TIMERS ───────────────────────────────────────────────────────────────────
function startStreamTimer() {
  const t0 = Date.now();
  setInterval(() => {
    const e = Math.floor((Date.now() - t0) / 1000);
    document.getElementById('stream-timer').textContent =
      pad(Math.floor(e/3600)) + ':' + pad(Math.floor((e%3600)/60)) + ':' + pad(e%60);
  }, 500);
}

function startBuffer() {
  setInterval(() => {
    S.bufSec++;
    document.getElementById('buf-disp').textContent = fmtHMS(S.bufSec);
  }, 1000);
}

function pad(n) { return String(n).padStart(2,'0'); }
function fmtHMS(s) { return pad(Math.floor(s/3600)) + ':' + pad(Math.floor((s%3600)/60)) + ':' + pad(s%60); }

// ─── AUDIO METERS ─────────────────────────────────────────────────────────────
function startAudioMeters() {
  setInterval(() => {
    const base = S.output !== null && !S.ftbActive ? 0.55 : 0.02;
    const l = Math.min(1, base + Math.random() * 0.35);
    const r = Math.min(1, base + Math.random() * 0.35);
    const ml = document.getElementById('ml');
    const mr = document.getElementById('mr');
    if (ml) ml.style.height = Math.round(l * 100) + '%';
    if (mr) mr.style.height = Math.round(r * 100) + '%';
  }, 80);
}

// ─── ON AIR ───────────────────────────────────────────────────────────────────
function setOnAir(live) {
  document.getElementById('onair').classList.toggle('live', live);
}

// ─── SLIDERS ──────────────────────────────────────────────────────────────────
function setupDurSlider() {
  const sl = document.getElementById('dur-slider');
  sl.value = S.duration;
  sl.addEventListener('input', () => {
    S.duration = parseInt(sl.value);
    document.getElementById('dur-val').textContent = (S.duration / 1000).toFixed(1) + 's';
  });
  document.getElementById('dur-val').textContent = (S.duration/1000).toFixed(1)+'s';
}

function setupVolSlider() {
  const sl = document.getElementById('vol-slider');
  sl.addEventListener('input', () => {
    document.getElementById('vol-val').textContent = sl.value;
  });
}

// ─── ADD INPUTS ───────────────────────────────────────────────────────────────
function addFileInput() {
  const f = document.getElementById('file-pick').files[0];
  const name = document.getElementById('file-name').value.trim() || (f ? f.name.replace(/\.[^.]+$/,'') : 'Video');
  if (!f) { alert('Select a video file.'); return; }
  const src = URL.createObjectURL(f);
  push({ name, type:'video', src });
  document.getElementById('file-pick').value = '';
  document.getElementById('file-name').value = '';
  elog('Input added: ' + name, 'go');
}

function addStillInput() {
  const f = document.getElementById('still-pick').files[0];
  const name = document.getElementById('still-name').value.trim() || (f ? f.name.replace(/\.[^.]+$/,'') : 'Still');
  if (!f) { alert('Select an image file.'); return; }
  const src = URL.createObjectURL(f);
  push({ name, type:'still', src });
  document.getElementById('still-pick').value = '';
  document.getElementById('still-name').value = '';
  elog('Input added: ' + name, 'go');
}

function addColourInput() {
  const t = document.getElementById('col-type').value;
  const c = document.getElementById('col-pick').value;
  const name = document.getElementById('col-name').value.trim() || t;
  push({ name, type:'colour', colType:t, customColor:c });
  document.getElementById('col-name').value = '';
  elog('Input added: ' + name, 'go');
}

function push(inp) {
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
  renderTiles();
  renderSwitcher();
}

function renderTiles() {
  const row = document.getElementById('inputs-row');
  const msg = document.getElementById('no-inp-msg');
  // remove old tiles
  row.querySelectorAll('.inp-tile').forEach(e => e.remove());
  msg.style.display = S.inputs.length ? 'none' : '';

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
    div.innerHTML = `
      <div class="inp-tile-thumb">${tileThumb(inp)}${badge}</div>
      <div class="inp-tile-bar">
        <span class="inp-tile-name" title="${inp.name}">${inp.name}</span>
        <span class="inp-tile-num">${i+1}</span>
      </div>
      <button class="inp-tile-del" onclick="event.stopPropagation();removeInput(${inp.id})">✕</button>
    `;
    div.addEventListener('click', () => toPreview(inp.id));
    row.appendChild(div);
  });
}

function tileThumb(inp) {
  if (inp.type==='video')  return `<video src="${inp.src}" muted loop playsinline preload="metadata"></video>`;
  if (inp.type==='still')  return `<img src="${inp.src}" alt="${inp.name}">`;
  if (inp.type==='colour') {
    if (inp.colType==='bars')   return '<div class="col-bars"></div>';
    if (inp.colType==='black')  return '<div class="col-black"></div>';
    if (inp.colType==='white')  return '<div class="col-white"></div>';
    return `<div class="col-custom" style="background:${inp.customColor};width:100%;height:100%;"></div>`;
  }
  return '';
}

function renderSwitcher() {
  const row = document.getElementById('sw-row');
  if (!S.inputs.length) { row.innerHTML = '<div class="sw-empty">Add inputs above to use the switcher</div>'; return; }
  row.innerHTML = S.inputs.map((inp, i) => {
    const cls = inp.id===S.preview ? 'sw-prv' : inp.id===S.output ? 'sw-pgm' : '';
    return `<button class="sw-btn ${cls}" onclick="toProgramDirect(${inp.id})">
      <span>${inp.name}</span>
      <span class="sw-num">${i+1}</span>
    </button>`;
  }).join('');
}

function renderModalList() {
  const list = document.getElementById('modal-inp-list');
  document.getElementById('modal-inp-count').textContent = S.inputs.length;
  if (!S.inputs.length) { list.innerHTML = '<span style="font-size:10px;color:#555;">No inputs yet.</span>'; return; }
  list.innerHTML = S.inputs.map((inp,i) => `
    <div class="mil-item">
      <span class="mil-num">${i+1}</span>
      <span class="mil-name">${inp.name}</span>
      <span class="mil-type">${inp.type}</span>
      <button class="mil-del" onclick="removeInput(${inp.id})">✕</button>
    </div>
  `).join('');
}

// ─── MONITOR LOADING ──────────────────────────────────────────────────────────
function loadMon(which, inp) {
  const screen = document.getElementById(which + '-screen');
  const srcEl  = document.getElementById(which + '-src');
  if (!inp) { clearMon(which); return; }
  srcEl.textContent = inp.name;

  if (inp.type === 'video') {
    const v = document.createElement('video');
    v.src = inp.src; v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
    v.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    screen.innerHTML = '';
    screen.appendChild(v);
    v.play().catch(()=>{});
  } else if (inp.type === 'still') {
    screen.innerHTML = `<img src="${inp.src}" alt="${inp.name}" style="width:100%;height:100%;object-fit:cover;display:block;">`;
  } else if (inp.type === 'colour') {
    const bg = inp.colType==='bars'
      ? 'linear-gradient(90deg,#c00,#cc0,#0c0,#0cc,#00c,#c0c,#ccc)'
      : inp.colType==='black' ? '#000'
      : inp.colType==='white' ? '#fff'
      : inp.customColor;
    screen.innerHTML = `<div style="width:100%;height:100%;background:${bg};display:flex;align-items:center;justify-content:center;"><span style="font-size:11px;color:rgba(255,255,255,.25);letter-spacing:.15em;">${inp.name.toUpperCase()}</span></div>`;
  }

  // re-render lower thirds
  if (which==='prv' && S.prvLT) renderLTonMon('prv', S.prvLT);
  if (which==='pgm' && S.pgmLT) renderLTonMon('pgm', S.pgmLT);
}

function clearMon(which) {
  const screen = document.getElementById(which+'-screen');
  screen.innerHTML = `<div class="mon-empty">${which==='prv'?'PREVIEW':'OUTPUT'}</div>`;
  document.getElementById(which+'-src').textContent = '—';
  document.getElementById(which+'-lt').innerHTML = '';
}

// ─── SWITCHING LOGIC ──────────────────────────────────────────────────────────
// Click tile → goes to Preview
function toPreview(id) {
  S.preview = id;
  const inp = S.inputs.find(i=>i.id===id);
  loadMon('prv', inp);
  renderAll();
  elog('PRV ← ' + inp.name, 'info');
}

// Switcher row button → cut direct to Program (vMix behaviour)
function toProgramDirect(id) {
  const inp = S.inputs.find(i=>i.id===id);
  if (!inp) return;
  // If already in preview, swap properly
  if (id === S.preview) {
    // put old pgm into preview
    const oldPgm = S.output;
    S.output = id;
    S.preview = oldPgm;
    loadMon('pgm', inp);
    if (oldPgm) loadMon('prv', S.inputs.find(i=>i.id===oldPgm));
    else clearMon('prv');
  } else {
    // direct cut, don't disturb preview
    S.output = id;
    loadMon('pgm', inp);
  }
  setOnAir(true);
  renderAll();
  elog('CUT → PGM: ' + inp.name, 'cut');
}

// Ctrl+1-9 → same as switcher row (direct to program)
function directByIndex(idx) {
  const inp = S.inputs[idx];
  if (inp) toProgramDirect(inp.id);
}

// Space / Trans button → send Preview to Program, swap
function doTransition() {
  if (S.preview === null) { elog('Nothing in preview', 'cut'); return; }
  if (S.ftbActive) { // if FTB is on, just bring up with transition
    doFTB(); return;
  }

  const prvId = S.preview;
  const pgmId = S.output;
  const inp = S.inputs.find(i=>i.id===prvId);

  if (S.trans === 'Cut') {
    S.output  = prvId;
    S.preview = pgmId || null;
    loadMon('pgm', inp);
    if (pgmId) loadMon('prv', S.inputs.find(i=>i.id===pgmId));
    else clearMon('prv');
    setOnAir(true);
    elog('CUT → PGM: ' + inp.name, 'cut');
  } else {
    // animated transition: crossfade PRV over PGM
    animateTrans(inp, pgmId);
  }
  renderAll();
}

function animateTrans(inpNext, oldPgmId) {
  const pgmScreen = document.getElementById('pgm-screen');
  // snapshot current pgm as background
  const snap = pgmScreen.cloneNode(true);
  snap.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;';
  pgmScreen.parentElement.appendChild(snap);

  // load new content into pgm
  S.output  = inpNext.id;
  S.preview = oldPgmId || null;
  loadMon('pgm', inpNext);
  if (oldPgmId) loadMon('prv', S.inputs.find(i=>i.id===oldPgmId));
  else clearMon('prv');
  setOnAir(true);
  elog(`${S.trans.toUpperCase()} (${(S.duration/1000).toFixed(1)}s) → PGM: ${inpNext.name}`, 'cut');

  // fade out snapshot
  snap.style.transition = `opacity ${S.duration}ms ease`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      snap.style.opacity = '0';
      setTimeout(() => snap.remove(), S.duration + 50);
    });
  });
  renderAll();
}

function doAuto() {
  if (S.preview === null) { elog('Nothing in preview', 'cut'); return; }
  const prevTrans = S.trans;
  if (S.trans === 'Cut') S.trans = 'Fade'; // auto always uses a transition
  doTransition();
  S.trans = prevTrans;
}

// ─── FADE TO BLACK ────────────────────────────────────────────────────────────
function doFTB() {
  const overlay = document.getElementById('ftb-overlay');
  const dur = S.ftbDur;
  overlay.style.setProperty('--ftb-dur', dur + 'ms');

  if (!S.ftbActive) {
    // fade to black
    S.ftbActive = true;
    overlay.classList.add('ftb-active');
    setOnAir(false);
    document.getElementById('ftb-go').style.borderColor = 'var(--red2)';
    document.getElementById('ftb-go').style.color = 'var(--red2)';
    elog('FADE TO BLACK', 'cut');
  } else {
    // bring back up
    S.ftbActive = false;
    overlay.classList.remove('ftb-active');
    if (S.output) setOnAir(true);
    document.getElementById('ftb-go').style.borderColor = '';
    document.getElementById('ftb-go').style.color = '';
    elog('FADE UP FROM BLACK', 'go');
  }
}

// ─── TRANSITION SELECT ────────────────────────────────────────────────────────
function selTrans(btn) {
  S.trans = btn.dataset.t;
  document.querySelectorAll('.trans-type-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  elog('Transition: ' + S.trans);
}

// ─── LOWER THIRDS ─────────────────────────────────────────────────────────────
function applyLT(which) {
  const title = document.getElementById('lt-title').value.trim();
  const sub   = document.getElementById('lt-sub').value.trim();
  const pos   = document.getElementById('lt-pos').value;
  const bg    = document.getElementById('lt-bg').value;
  const fg    = document.getElementById('lt-fg').value;
  if (!title) { alert('Enter a title.'); return; }

  const lt = { title, sub, pos, bg, fg };

  // save to list if not already there
  const key = title + '|' + sub;
  if (!S.lts.find(l => l.key===key)) {
    S.lts.push({ key, ...lt });
    renderLTSavedList();
  }

  renderLTonMon(which, lt);
  if (which === 'prv') S.prvLT = lt;
  if (which === 'pgm') S.pgmLT = lt;
  elog('Lower third → ' + which.toUpperCase() + ': ' + title, 'info');
}

function renderLTonMon(which, lt) {
  const container = document.getElementById(which + '-lt');
  const posClass = lt.pos || 'bottom-left';
  container.innerHTML = `
    <div class="lt-overlay ${posClass}">
      <div class="lt-title-text" style="background:${lt.bg};color:${lt.fg};">${lt.title}</div>
      ${lt.sub ? `<div class="lt-sub-text" style="color:${lt.fg};">${lt.sub}</div>` : ''}
    </div>
  `;
}

function clearLT() {
  S.prvLT = null; S.pgmLT = null;
  document.getElementById('prv-lt').innerHTML = '';
  document.getElementById('pgm-lt').innerHTML = '';
  elog('Lower thirds cleared');
}

function renderLTSavedList() {
  const list = document.getElementById('lt-saved-list');
  if (!S.lts.length) { list.innerHTML = '<span style="font-size:10px;color:#555;">No saved lower thirds.</span>'; return; }
  list.innerHTML = S.lts.map((lt,i) => `
    <div class="lt-saved-item">
      <span class="lt-si-name">${lt.title}${lt.sub?' — '+lt.sub:''}</span>
      <button class="lt-si-apply" onclick="applyLTSaved(${i},'prv')">PRV</button>
      <button class="lt-si-apply" onclick="applyLTSaved(${i},'pgm')">PGM</button>
      <button class="lt-si-del" onclick="deleteLTSaved(${i})">✕</button>
    </div>
  `).join('');
}

function applyLTSaved(i, which) {
  const lt = S.lts[i];
  renderLTonMon(which, lt);
  if (which==='prv') S.prvLT = lt;
  if (which==='pgm') S.pgmLT = lt;
  elog('Lower third → ' + which.toUpperCase() + ': ' + lt.title, 'info');
}

function deleteLTSaved(i) {
  S.lts.splice(i, 1);
  renderLTSavedList();
}

// ─── REPLAY ───────────────────────────────────────────────────────────────────
function setReplayStatus(state, msg) {
  S.replayState = state;
  const bar = document.getElementById('replay-status-bar');
  bar.textContent = msg;
  bar.className = 'replay-status-bar ' + (state === 'idle' ? '' : state === 'playing' ? 'playing' : state === 'looping' ? 'looping' : '');
}

function doMarkIn() {
  S.markIn = S.bufSec;
  document.getElementById('in-disp').textContent = fmtHMS(S.markIn);
  rlog('Mark In @ ' + fmtHMS(S.markIn), 'mark');
}

function doMarkOut() {
  S.markOut = S.bufSec;
  document.getElementById('out-disp').textContent = fmtHMS(S.markOut);
  rlog('Mark Out @ ' + fmtHMS(S.markOut), 'mark');
}

function doReplayPlay() {
  if (S.markIn === null) { rlog('Set Mark In first', 'err'); return; }
  if (S.markOut === null) { rlog('Set Mark Out first', 'err'); return; }
  if (S.markOut <= S.markIn) { rlog('Mark Out must be after Mark In', 'err'); return; }

  clearTimeout(S.replayTimer);
  S.replayState = 'playing';
  const clipLen = (S.markOut - S.markIn) / S.speed;
  setReplayStatus('playing', `▶ PLAYING  ${fmtHMS(S.markIn)} → ${fmtHMS(S.markOut)}  @ ${S.speed}x`);
  rlog(`Play ${fmtHMS(S.markIn)}→${fmtHMS(S.markOut)} @ ${S.speed}x`, 'go');

  S.replayTimer = setTimeout(() => {
    if (S.replayState === 'playing') {
      setReplayStatus('idle', 'IDLE — replay complete');
      rlog('Replay complete', 'go');
    }
  }, clipLen * 1000);
}

function doReplayLoop() {
  if (S.markIn === null || S.markOut === null) { rlog('Set Mark In and Out first', 'err'); return; }
  if (S.markOut <= S.markIn) { rlog('Mark Out must be after Mark In', 'err'); return; }
  S.replayState = 'looping';
  setReplayStatus('looping', `⟳ LOOPING  ${fmtHMS(S.markIn)} → ${fmtHMS(S.markOut)}  @ ${S.speed}x`);
  rlog(`Loop ${fmtHMS(S.markIn)}→${fmtHMS(S.markOut)} @ ${S.speed}x`, 'go');
  clearTimeout(S.replayTimer);
}

function doReplayStop() {
  clearTimeout(S.replayTimer);
  S.replayState = 'idle';
  setReplayStatus('idle', 'IDLE');
  rlog('Stopped', null);
}

function doReturnLive() {
  doReplayStop();
  rlog('Return to live', 'go');
  elog('RETURN TO LIVE', 'go');
}

function setSpeed(v) {
  S.speed = v;
  document.getElementById('spd-disp').textContent = v.toFixed(2).replace(/\.?0+$/,'') + 'x';
  document.querySelectorAll('.spd').forEach(b=>b.classList.remove('active'));
  const map = {0.25:0, 0.5:1, 1.0:2, 2.0:3};
  const idx = map[v];
  if (idx !== undefined) document.querySelectorAll('.spd')[idx].classList.add('active');
  rlog('Speed → ' + v + 'x', null);
  elog('Replay speed → ' + v + 'x', 'speed');
}

// ─── CONFIG ───────────────────────────────────────────────────────────────────
let customTransCount = 0;
const customTransRows = []; // [{key, trans, dur}]

function buildCustomTransUI() {
  // F6 onward available for custom
}

function addCustomTrans() {
  const idx = customTransRows.length;
  const fKey = 'F' + (6 + idx);
  if (6 + idx > 12) { alert('Maximum 7 custom transitions (F6–F12)'); return; }
  customTransRows.push({ key: fKey, trans: 'Fade', dur: 1000 });
  renderCustomTransList();
}

function renderCustomTransList() {
  const cont = document.getElementById('custom-trans-list');
  cont.innerHTML = customTransRows.map((row, i) => `
    <div class="custom-trans-row">
      <span class="ct-key">${row.key}</span>
      <select onchange="customTransRows[${i}].trans=this.value">
        ${['Cut','Fade','Wipe','Slide','Zoom'].map(t=>`<option${t===row.trans?' selected':''}>${t}</option>`).join('')}
      </select>
      <input type="number" value="${row.dur}" min="100" max="5000" step="100" style="width:70px;" onchange="customTransRows[${i}].dur=parseInt(this.value)">
      <span style="font-size:9px;color:var(--text3);">ms</span>
      <button onclick="removeCustomTrans(${i})">✕</button>
    </div>
  `).join('');
}

function removeCustomTrans(i) {
  customTransRows.splice(i, 1);
  renderCustomTransList();
}

function saveConfig() {
  const dt = document.getElementById('cfg-default-trans').value;
  const dd = parseInt(document.getElementById('cfg-default-dur').value) || 1000;
  const fd = parseInt(document.getElementById('cfg-ftb-dur').value) || 500;

  S.trans = dt;
  S.duration = dd;
  S.ftbDur = fd;

  // sync duration slider
  const sl = document.getElementById('dur-slider');
  sl.value = dd;
  document.getElementById('dur-val').textContent = (dd/1000).toFixed(1)+'s';

  // sync trans buttons
  const btn = document.querySelector(`.trans-type-btn[data-t="${dt}"]`);
  if (btn) { document.querySelectorAll('.trans-type-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); }

  S.customTrans = customTransRows.map(r => ({...r}));

  closeModal('config-modal');
  elog('Config saved', 'go');
}

// ─── LOGS ─────────────────────────────────────────────────────────────────────
function elog(msg, type) {
  const body = document.getElementById('log-body');
  const empty = body.querySelector('.log-empty');
  if (empty) empty.remove();
  S.logCount++;
  const ts = new Date().toTimeString().slice(0,8);
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-ts">${ts}</span><span class="log-msg ${type||''}">${msg}</span>`;
  body.appendChild(div);
  body.scrollLeft = body.scrollWidth;
  document.getElementById('log-cnt').textContent = S.logCount + ' event' + (S.logCount!==1?'s':'');
}

function clearLog() {
  document.getElementById('log-body').innerHTML = '<span class="log-empty">Waiting...</span>';
  S.logCount = 0;
  document.getElementById('log-cnt').textContent = '0 events';
}

function rlog(msg, type) {
  const log = document.getElementById('replay-log');
  const ts = new Date().toTimeString().slice(0,8);
  const div = document.createElement('div');
  div.className = 'rl-entry';
  div.innerHTML = `<span class="rl-ts">${ts} </span><span class="rl-msg ${type||''}">${msg}</span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
  if (id === 'lt-modal') renderLTSavedList();
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-bg')) closeModal(e.target.id);
});

function switchMTab(tab, btn) {
  document.querySelectorAll('.mtab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.modal-form').forEach(f=>f.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('mf-' + tab).classList.add('active');
}

// ─── KEYBOARD ─────────────────────────────────────────────────────────────────
function setupKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA') return;
    // don't block browser shortcuts
    if (e.metaKey) return;

    const k = e.key;

    // 1-9 → preview
    if (/^[1-9]$/.test(k) && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const inp = S.inputs[parseInt(k)-1];
      if (inp) toPreview(inp.id);
      return;
    }

    // Ctrl+1-9 → direct to program (like vMix ctrl shortcuts)
    if (/^[1-9]$/.test(k) && e.ctrlKey) {
      e.preventDefault();
      directByIndex(parseInt(k)-1);
      return;
    }

    // F1-F5 → transition type
    const fMap = { F1:'Cut', F2:'Fade', F3:'Wipe', F4:'Slide', F5:'Zoom' };
    if (fMap[k]) {
      e.preventDefault();
      const btn = document.querySelector(`.trans-type-btn[data-t="${fMap[k]}"]`);
      if (btn) selTrans(btn);
      return;
    }

    // Custom F-key transitions (F6+)
    const customIdx = parseInt(k.replace('F','')) - 6;
    if (k.startsWith('F') && !isNaN(customIdx) && customIdx >= 0 && S.customTrans[customIdx]) {
      e.preventDefault();
      const ct = S.customTrans[customIdx];
      const prevTrans = S.trans, prevDur = S.duration;
      S.trans = ct.trans; S.duration = ct.dur;
      doTransition();
      S.trans = prevTrans; S.duration = prevDur;
      return;
    }

    switch(k) {
      case ' ':         e.preventDefault(); doTransition(); break;
      case 'a': case 'A': doAuto(); break;
      case 'b': case 'B': doFTB(); break;
      case 'i': case 'I': doMarkIn(); break;
      case 'o': case 'O': doMarkOut(); break;
      case 'p': case 'P': doReplayPlay(); break;
      case 'l': case 'L': doReplayLoop(); break;
      case 's': case 'S': doReplayStop(); break;
      case 'r': case 'R': doReturnLive(); break;
      case '[':           setSpeed(0.5); break;
      case ']':           setSpeed(1.0); break;
      case 'Escape':
        document.querySelectorAll('.modal-bg.open').forEach(m=>m.classList.remove('open'));
        break;
    }
  });
}
