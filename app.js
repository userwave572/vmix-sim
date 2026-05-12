'use strict';

// ─── MEDIA POOL ───────────────────────────────────────────────────────────────
// One DOM element per input — moved between monitors, never recreated.
// This prevents video restarts on every preview/program change.
const pool = new Map(); // inputId -> HTMLElement

function getPoolEl(inp) {
  if (pool.has(inp.id)) return pool.get(inp.id);
  const el = buildMediaEl(inp);
  pool.set(inp.id, el);
  return el;
}

function buildMediaEl(inp) {
  let el;
  if (inp.type === 'video') {
    el = document.createElement('video');
    el.src = inp.src;
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    applyFillStyle(el);
    el.play().catch(() => {});
  } else if (inp.type === 'still') {
    el = document.createElement('img');
    el.src = inp.src;
    el.alt = inp.name;
    applyFillStyle(el);
  } else if (inp.type === 'colour') {
    el = document.createElement('div');
    el.className = 'col-' + inp.colType;
    if (inp.colType === 'custom') el.style.background = inp.customColor;
    applyFillStyle(el);
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    const lbl = document.createElement('span');
    lbl.textContent = inp.name.toUpperCase();
    lbl.style.cssText = 'font-size:11px;color:rgba(255,255,255,.2);letter-spacing:.15em;';
    el.appendChild(lbl);
  }
  return el;
}

function applyFillStyle(el) {
  el.style.position = 'absolute';
  el.style.inset = '0';
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.objectFit = 'cover';
  el.style.display = 'block';
  el.style.border = 'none';
}

// ─── STATE ────────────────────────────────────────────────────────────────────
const S = {
  inputs: [],
  preview: null,  // input id
  output:  null,  // input id
  trans:   'Cut',
  duration: 1000,
  ftbDur:   500,
  ftbOn:    false,
  ltFade:   400,

  // replay — based on actual video.currentTime
  markIn:   null,  // seconds (video.currentTime)
  markOut:  null,  // seconds (video.currentTime)
  speed:    1.0,
  replayState: 'idle',  // idle | playing | looping
  replayLoop: false,
  replayEndHandler: null,  // bound timeupdate listener

  // lower thirds
  lts: [],       // saved list
  prvLT: null,
  pgmLT: null,

  // custom transitions
  customTrans: [], // [{key, trans, dur}]

  logCount: 0,
};

// ─── BOOT ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  setupDurSlider();
  document.getElementById('vol-slider').addEventListener('input', e => {
    document.getElementById('vol-val').textContent = e.target.value;
  });
  startStreamTimer();
  startAudioMeters();
  startVideoTimeClock();
  setupKeyboard();
});

// ─── TIMERS ──────────────────────────────────────────────────────────────────
function startStreamTimer() {
  const t0 = Date.now();
  setInterval(() => {
    const e = Math.floor((Date.now() - t0) / 1000);
    document.getElementById('stream-timer').textContent =
      pad2(Math.floor(e/3600)) + ':' + pad2(Math.floor((e%3600)/60)) + ':' + pad2(e%60);
  }, 500);
}

// Show program video currentTime as the "video time" / buffer
function startVideoTimeClock() {
  setInterval(() => {
    const vid = getPgmVideo();
    if (vid) {
      document.getElementById('buf-disp').textContent = fmtTime(vid.currentTime);
    }
  }, 200);
}

function getPgmVideo() {
  if (!S.output) return null;
  const inp = S.inputs.find(i => i.id === S.output);
  if (!inp || inp.type !== 'video') return null;
  return pool.get(inp.id);
}

function startAudioMeters() {
  setInterval(() => {
    const base = S.output !== null && !S.ftbOn ? 0.55 : 0.02;
    const l = Math.min(1, base + Math.random() * 0.35);
    const r = Math.min(1, base + Math.random() * 0.35);
    const ml = document.getElementById('ml'), mr = document.getElementById('mr');
    if (ml) ml.style.height = Math.round(l * 100) + '%';
    if (mr) mr.style.height = Math.round(r * 100) + '%';
  }, 80);
}

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtTime(s) {
  if (s == null || isNaN(s)) return '--:--:--';
  const sec = Math.floor(s);
  return pad2(Math.floor(sec/3600)) + ':' + pad2(Math.floor((sec%3600)/60)) + ':' + pad2(sec%60);
}

// ─── ON AIR ──────────────────────────────────────────────────────────────────
function setOnAir(live) {
  document.getElementById('onair').classList.toggle('live', live);
}

// ─── DURATION SLIDER ─────────────────────────────────────────────────────────
function setupDurSlider() {
  const sl = document.getElementById('dur-slider');
  sl.value = S.duration;
  document.getElementById('dur-val').textContent = (S.duration / 1000).toFixed(1) + 's';
  sl.addEventListener('input', () => {
    S.duration = parseInt(sl.value);
    document.getElementById('dur-val').textContent = (S.duration / 1000).toFixed(1) + 's';
  });
}

// ─── ADD INPUTS ──────────────────────────────────────────────────────────────
function addFileInput() {
  const f = document.getElementById('file-pick').files[0];
  const name = document.getElementById('file-name').value.trim() || (f ? stripExt(f.name) : 'Video');
  if (!f) { alert('Select a video file.'); return; }
  pushInput({ name, type: 'video', src: URL.createObjectURL(f) });
  document.getElementById('file-pick').value = '';
  document.getElementById('file-name').value = '';
}

function addStillInput() {
  const f = document.getElementById('still-pick').files[0];
  const name = document.getElementById('still-name').value.trim() || (f ? stripExt(f.name) : 'Still');
  if (!f) { alert('Select an image file.'); return; }
  pushInput({ name, type: 'still', src: URL.createObjectURL(f) });
  document.getElementById('still-pick').value = '';
  document.getElementById('still-name').value = '';
}

function addColourInput() {
  const t = document.getElementById('col-type').value;
  const c = document.getElementById('col-pick').value;
  const name = document.getElementById('col-name').value.trim() || t;
  pushInput({ name, type: 'colour', colType: t, customColor: c });
  document.getElementById('col-name').value = '';
}

function stripExt(s) { return s.replace(/\.[^.]+$/, ''); }

function pushInput(inp) {
  inp.id = Date.now() + Math.random();
  S.inputs.push(inp);
  renderAll();
  renderModalList();
  elog('Input added: ' + inp.name, 'go');
}

function removeInput(id) {
  // Remove from pool and DOM
  if (pool.has(id)) {
    const el = pool.get(id);
    if (el.parentNode) el.parentNode.removeChild(el);
    if (el.tagName === 'VIDEO') { el.pause(); el.src = ''; }
    pool.delete(id);
  }
  S.inputs = S.inputs.filter(i => i.id !== id);
  if (S.preview === id) { S.preview = null; clearMon('prv'); }
  if (S.output  === id) { S.output  = null; clearMon('pgm'); setOnAir(false); }
  renderAll();
  renderModalList();
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
function renderAll() {
  renderTiles();
  renderSwitcher();
}

function renderTiles() {
  const row = document.getElementById('inputs-row');
  row.querySelectorAll('.inp-tile').forEach(e => e.remove());
  document.getElementById('no-inp-msg').style.display = S.inputs.length ? 'none' : '';

  S.inputs.forEach((inp, i) => {
    const isPrv = inp.id === S.preview;
    const isPgm = inp.id === S.output;
    const cls = isPrv ? 'is-prv' : isPgm ? 'is-pgm' : '';
    const badge = isPrv
      ? '<span class="inp-tile-badge badge-prv">PRV</span>'
      : isPgm ? '<span class="inp-tile-badge badge-pgm">PGM</span>' : '';

    const div = document.createElement('div');
    div.className = 'inp-tile ' + cls;
    div.innerHTML = `
      <div class="inp-tile-thumb">${tileThumbnail(inp)}${badge}</div>
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

function tileThumbnail(inp) {
  // Tiles get their own small preview elements (not from the pool)
  if (inp.type === 'video')  return `<video src="${inp.src}" muted loop playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;pointer-events:none;"></video>`;
  if (inp.type === 'still')  return `<img src="${inp.src}" alt="${inp.name}" style="width:100%;height:100%;object-fit:cover;">`;
  if (inp.type === 'colour') {
    if (inp.colType === 'bars')   return '<div class="col-bars" style="width:100%;height:100%;"></div>';
    if (inp.colType === 'black')  return '<div class="col-black" style="width:100%;height:100%;"></div>';
    if (inp.colType === 'white')  return '<div class="col-white" style="width:100%;height:100%;"></div>';
    return `<div style="width:100%;height:100%;background:${inp.customColor};"></div>`;
  }
  return '';
}

function renderSwitcher() {
  const row = document.getElementById('sw-row');
  if (!S.inputs.length) { row.innerHTML = '<div class="sw-empty">Add inputs above to use the switcher</div>'; return; }
  row.innerHTML = S.inputs.map((inp, i) => {
    const cls = inp.id === S.preview ? 'sw-prv' : inp.id === S.output ? 'sw-pgm' : '';
    return `<button class="sw-btn ${cls}" onclick="toProgramDirect(${inp.id})">
      <span>${inp.name}</span>
      <span class="sw-num">${i+1}</span>
    </button>`;
  }).join('');
}

function renderModalList() {
  const list = document.getElementById('modal-inp-list');
  document.getElementById('modal-inp-count').textContent = S.inputs.length;
  list.innerHTML = S.inputs.map((inp, i) => `
    <div class="mil-item">
      <span class="mil-num">${i+1}</span>
      <span class="mil-name">${inp.name}</span>
      <span class="mil-type">${inp.type}</span>
      <button class="mil-del" onclick="removeInput(${inp.id})">✕</button>
    </div>
  `).join('') || '<span style="font-size:10px;color:#555;">No inputs yet.</span>';
}

// ─── MONITOR LOADING ─────────────────────────────────────────────────────────
// Place a pooled element into a monitor's media div.
// Because we use appendChild to MOVE the element (not clone), video keeps playing.
function placeMon(which, inp) {
  const mediaDiv = document.getElementById(which + '-media');
  const emptyEl  = document.getElementById(which + '-empty');
  const srcEl    = document.getElementById(which + '-src');

  if (!inp) { clearMon(which); return; }

  srcEl.textContent = inp.name;
  emptyEl.style.display = 'none';

  const el = getPoolEl(inp);
  // appendChild moves the element if it's already in the DOM somewhere else.
  // This is the key — no re-creation, no restart.
  mediaDiv.appendChild(el);

  if (inp.type === 'video') {
    el.play().catch(() => {});
  }
}

function clearMon(which) {
  const mediaDiv = document.getElementById(which + '-media');
  // Don't destroy children — pool elements must survive. Just detach.
  while (mediaDiv.firstChild) mediaDiv.removeChild(mediaDiv.firstChild);
  document.getElementById(which + '-empty').style.display = '';
  document.getElementById(which + '-src').textContent = '—';
  // clear LT too
  document.getElementById(which + '-lt').innerHTML = '';
  if (which === 'prv') S.prvLT = null;
  if (which === 'pgm') S.pgmLT = null;
}

// ─── SWITCHING ────────────────────────────────────────────────────────────────
// Tile click → Preview
function toPreview(id) {
  // If it's already in program, don't steal it — just note it in preview slot
  S.preview = id;
  const inp = S.inputs.find(i => i.id === id);
  if (id !== S.output) {
    placeMon('prv', inp);
  }
  renderAll();
  elog('PRV ← ' + inp.name);
}

// Switcher row → direct cut to program (vMix behaviour)
function toProgramDirect(id) {
  const inp = S.inputs.find(i => i.id === id);
  if (!inp) return;

  const oldPgmId = S.output;

  // Swap: new goes to PGM, old PGM goes to PRV
  S.output  = id;
  S.preview = oldPgmId || S.preview;

  placeMon('pgm', inp);
  if (oldPgmId && oldPgmId !== id) {
    placeMon('prv', S.inputs.find(i => i.id === oldPgmId));
  } else if (!oldPgmId) {
    clearMon('prv');
    S.preview = null;
  }

  setOnAir(true);
  renderAll();
  elog('CUT → PGM: ' + inp.name, 'cut');
}

// Space / Trans button → send Preview to Program with selected transition
function doTransition() {
  if (S.preview === null) { elog('Nothing in preview', 'cut'); return; }

  const prvId = S.preview;
  const pgmId = S.output;
  const inpNext = S.inputs.find(i => i.id === prvId);
  const inpPrev = pgmId ? S.inputs.find(i => i.id === pgmId) : null;

  if (S.trans === 'Cut') {
    // Instant cut
    S.output  = prvId;
    S.preview = pgmId || null;
    placeMon('pgm', inpNext);
    if (inpPrev) placeMon('prv', inpPrev); else clearMon('prv');
    setOnAir(true);
    renderAll();
    elog('CUT → PGM: ' + inpNext.name, 'cut');
  } else {
    doAnimatedTrans(inpNext, inpPrev);
  }
}

function doAnimatedTrans(inpNext, inpPrev) {
  const pgmScreen = document.getElementById('pgm-screen');

  // 1. Capture current frame as a frozen snapshot (canvas → img)
  //    This lets us animate the OLD frame out while loading the new one underneath.
  const snap = buildSnapshot(pgmScreen);
  snap.style.cssText += `
    position:absolute;inset:0;width:100%;height:100%;
    object-fit:cover;z-index:8;pointer-events:none;
    transition:opacity ${S.duration}ms ease;opacity:1;
  `;
  pgmScreen.appendChild(snap);

  // 2. Swap state and load new content into pgm (under the snapshot)
  const prvId = S.preview;
  const pgmId = S.output;
  S.output  = prvId;
  S.preview = pgmId || null;

  placeMon('pgm', inpNext);
  if (inpPrev) placeMon('prv', inpPrev); else clearMon('prv');
  setOnAir(true);
  renderAll();

  // 3. Fade snapshot out, revealing new content underneath
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      snap.style.opacity = '0';
      setTimeout(() => { if (snap.parentNode) snap.parentNode.removeChild(snap); }, S.duration + 100);
    });
  });

  elog(`${S.trans.toUpperCase()} (${(S.duration/1000).toFixed(1)}s) → PGM: ${inpNext.name}`, 'cut');
}

function buildSnapshot(container) {
  // Try canvas capture for video
  const vid = container.querySelector('video');
  if (vid && vid.videoWidth) {
    try {
      const c = document.createElement('canvas');
      c.width = vid.videoWidth; c.height = vid.videoHeight;
      c.getContext('2d').drawImage(vid, 0, 0);
      const img = document.createElement('img');
      img.src = c.toDataURL('image/jpeg', 0.85);
      return img;
    } catch(e) {}
  }
  // Fallback: clone visible content as a div with solid background
  const fallback = document.createElement('div');
  fallback.style.background = '#000';
  return fallback;
}

function doAuto() {
  if (S.preview === null) { elog('Nothing in preview', 'cut'); return; }
  const savedTrans = S.trans;
  if (S.trans === 'Cut') S.trans = 'Fade';
  doTransition();
  S.trans = savedTrans;
}

// ─── FADE TO BLACK ────────────────────────────────────────────────────────────
function doFTB() {
  const overlay = document.getElementById('ftb-overlay');
  overlay.style.transition = `opacity ${S.ftbDur}ms ease`;

  S.ftbOn = !S.ftbOn;
  overlay.classList.toggle('active', S.ftbOn);
  document.getElementById('ftb-go').classList.toggle('ftb-on', S.ftbOn);

  if (S.ftbOn) {
    setOnAir(false);
    elog('FADE TO BLACK', 'cut');
  } else {
    if (S.output) setOnAir(true);
    elog('FADE UP', 'go');
  }
}

// ─── TRANSITION SELECT ────────────────────────────────────────────────────────
function selTrans(btn) {
  S.trans = btn.dataset.t;
  document.querySelectorAll('.trans-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  elog('Transition: ' + S.trans);
}

// ─── REPLAY ──────────────────────────────────────────────────────────────────
// Replay works on the actual video element in program.
// markIn / markOut store video.currentTime values.

function getPgmVideoForReplay() {
  const vid = getPgmVideo();
  if (!vid) { rlog('No video in Output — load a video input first', 'err'); return null; }
  return vid;
}

function doMarkIn() {
  const vid = getPgmVideoForReplay();
  if (!vid) return;
  S.markIn = vid.currentTime;
  document.getElementById('in-disp').textContent = fmtTime(S.markIn);
  rlog('Mark In @ ' + fmtTime(S.markIn), 'mark');
  elog('MARK IN @ ' + fmtTime(S.markIn), 'mark');
  updateReplayStatus();
}

function doMarkOut() {
  const vid = getPgmVideoForReplay();
  if (!vid) return;
  S.markOut = vid.currentTime;
  document.getElementById('out-disp').textContent = fmtTime(S.markOut);
  rlog('Mark Out @ ' + fmtTime(S.markOut), 'mark');
  elog('MARK OUT @ ' + fmtTime(S.markOut), 'mark');
  updateReplayStatus();
}

function doReplayPlay() {
  const vid = getPgmVideoForReplay();
  if (!vid) return;
  if (S.markIn === null)  { rlog('Set Mark In first', 'err'); return; }
  if (S.markOut === null) { rlog('Set Mark Out first', 'err'); return; }
  if (S.markOut <= S.markIn) { rlog('Mark Out must be after Mark In', 'err'); return; }

  // Remove any existing listener
  stopReplayListener(vid);

  S.replayState = 'playing';
  S.replayLoop  = false;

  // Seek to mark in, set speed
  vid.playbackRate = S.speed;
  vid.currentTime = S.markIn;

  // Wait for seek to complete then play
  const onSeeked = () => {
    vid.play().catch(() => {});
    vid.removeEventListener('seeked', onSeeked);
    // Now add timeupdate watcher
    attachReplayWatcher(vid, false);
  };
  vid.addEventListener('seeked', onSeeked);

  setReplayStatus('playing', `▶ PLAYING  ${fmtTime(S.markIn)} → ${fmtTime(S.markOut)}  @ ${S.speed}x`);
  rlog(`Play ${fmtTime(S.markIn)} → ${fmtTime(S.markOut)} @ ${S.speed}x`, 'go');
}

function doReplayLoop() {
  const vid = getPgmVideoForReplay();
  if (!vid) return;
  if (S.markIn === null)  { rlog('Set Mark In first', 'err'); return; }
  if (S.markOut === null) { rlog('Set Mark Out first', 'err'); return; }
  if (S.markOut <= S.markIn) { rlog('Mark Out must be after Mark In', 'err'); return; }

  stopReplayListener(vid);

  S.replayState = 'looping';
  S.replayLoop  = true;

  vid.playbackRate = S.speed;
  vid.currentTime = S.markIn;

  const onSeeked = () => {
    vid.play().catch(() => {});
    vid.removeEventListener('seeked', onSeeked);
    attachReplayWatcher(vid, true);
  };
  vid.addEventListener('seeked', onSeeked);

  setReplayStatus('looping', `⟳ LOOPING  ${fmtTime(S.markIn)} → ${fmtTime(S.markOut)}  @ ${S.speed}x`);
  rlog(`Loop ${fmtTime(S.markIn)} → ${fmtTime(S.markOut)} @ ${S.speed}x`, 'go');
}

function attachReplayWatcher(vid, loop) {
  // Remove previous
  if (S.replayEndHandler) vid.removeEventListener('timeupdate', S.replayEndHandler);

  S.replayEndHandler = function() {
    if (vid.currentTime >= S.markOut) {
      if (loop && S.replayState === 'looping') {
        // Loop back
        vid.currentTime = S.markIn;
      } else {
        // Stop
        vid.pause();
        vid.playbackRate = 1.0;
        S.replayState = 'idle';
        setReplayStatus('idle', 'IDLE — replay complete');
        rlog('Replay complete', 'go');
        vid.removeEventListener('timeupdate', S.replayEndHandler);
        S.replayEndHandler = null;
      }
    }
  };
  vid.addEventListener('timeupdate', S.replayEndHandler);
}

function stopReplayListener(vid) {
  if (S.replayEndHandler && vid) {
    vid.removeEventListener('timeupdate', S.replayEndHandler);
    S.replayEndHandler = null;
  }
}

function doReplayStop() {
  const vid = getPgmVideo();
  if (vid) {
    stopReplayListener(vid);
    vid.playbackRate = 1.0;
    vid.play().catch(() => {});
  }
  S.replayState = 'idle';
  S.replayLoop  = false;
  setReplayStatus('idle', 'IDLE');
  rlog('Stopped — returned to live speed');
  elog('REPLAY STOP', 'replay');
}

function doReturnLive() {
  doReplayStop();
  elog('RETURN TO LIVE', 'go');
}

function setSpeed(v) {
  S.speed = v;
  document.getElementById('spd-disp').textContent = v + 'x';
  document.querySelectorAll('.spd').forEach(b => b.classList.remove('active'));
  const map = { 0.25: 0, 0.5: 1, 1.0: 2, 2.0: 3 };
  if (map[v] !== undefined) document.querySelectorAll('.spd')[map[v]].classList.add('active');
  // Apply immediately if replay is active
  const vid = getPgmVideo();
  if (vid && S.replayState !== 'idle') vid.playbackRate = v;
  elog('Replay speed → ' + v + 'x', 'speed');
}

function updateReplayStatus() {
  if (S.markIn !== null && S.markOut !== null) {
    if (S.replayState === 'idle') {
      setReplayStatus('idle', `Ready: ${fmtTime(S.markIn)} → ${fmtTime(S.markOut)}  (${(S.markOut-S.markIn).toFixed(1)}s clip)`);
    }
  }
}

function setReplayStatus(state, msg) {
  S.replayState = state;
  const bar = document.getElementById('replay-status-bar');
  bar.textContent = msg;
  bar.className = 'replay-status-bar ' + (state === 'idle' ? '' : state);
}

// ─── LOWER THIRDS ────────────────────────────────────────────────────────────
function applyLT(which) {
  const title = document.getElementById('lt-title').value.trim();
  const sub   = document.getElementById('lt-sub').value.trim();
  const pos   = document.getElementById('lt-pos').value;
  const bg    = document.getElementById('lt-bg').value;
  const fg    = document.getElementById('lt-fg').value;
  if (!title) { alert('Enter a title.'); return; }

  const lt = { title, sub, pos, bg, fg };

  // Save to list (deduplicate by title+sub)
  const key = title + '||' + sub;
  if (!S.lts.find(l => l.key === key)) {
    S.lts.push({ key, ...lt });
    renderLTSavedList();
  }

  renderLTonMon(which, lt);
  if (which === 'prv') S.prvLT = lt;
  if (which === 'pgm') S.pgmLT = lt;
  elog('Lower third → ' + which.toUpperCase() + ': ' + title);
}

function renderLTonMon(which, lt) {
  const container = document.getElementById(which + '-lt');
  // Remove then re-add to retrigger animation
  container.innerHTML = '';
  // Force reflow
  void container.offsetWidth;
  const div = document.createElement('div');
  div.className = 'lt-overlay ' + (lt.pos || 'bottom-left');
  div.style.setProperty('--lt-fade', S.ltFade + 'ms');
  div.innerHTML = `
    <div class="lt-title-text" style="background:${lt.bg};color:${lt.fg};">${lt.title}</div>
    ${lt.sub ? `<div class="lt-sub-text" style="color:${lt.fg};">${lt.sub}</div>` : ''}
  `;
  container.appendChild(div);
}

function clearLT() {
  document.getElementById('prv-lt').innerHTML = '';
  document.getElementById('pgm-lt').innerHTML = '';
  S.prvLT = null; S.pgmLT = null;
  elog('Lower thirds cleared');
}

function renderLTSavedList() {
  const list = document.getElementById('lt-saved-list');
  if (!S.lts.length) { list.innerHTML = '<span style="font-size:10px;color:#555;padding:4px 0;display:block;">No saved lower thirds.</span>'; return; }
  list.innerHTML = S.lts.map((lt, i) => `
    <div class="lt-saved-item">
      <div class="lt-si-dot" style="background:${lt.bg};"></div>
      <span class="lt-si-name">${lt.title}${lt.sub ? ' — ' + lt.sub : ''}</span>
      <button class="lt-si-apply" onclick="applyLTSaved(${i},'prv')">PRV</button>
      <button class="lt-si-apply pgm" onclick="applyLTSaved(${i},'pgm')">PGM</button>
      <button class="lt-si-del" onclick="deleteLTSaved(${i})">✕</button>
    </div>
  `).join('');
}

function applyLTSaved(i, which) {
  const lt = S.lts[i];
  renderLTonMon(which, lt);
  if (which === 'prv') S.prvLT = lt;
  if (which === 'pgm') S.pgmLT = lt;
  elog('Lower third → ' + which.toUpperCase() + ': ' + lt.title);
}

function deleteLTSaved(i) {
  S.lts.splice(i, 1);
  renderLTSavedList();
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const customTransRows = [];

function addCustomTrans() {
  const idx = customTransRows.length;
  const fKey = 'F' + (6 + idx);
  if (6 + idx > 12) { alert('Maximum 7 custom transition slots (F6–F12)'); return; }
  customTransRows.push({ key: fKey, trans: 'Fade', dur: 1000 });
  renderCustomTransList();
}

function renderCustomTransList() {
  const cont = document.getElementById('custom-trans-list');
  cont.innerHTML = customTransRows.map((row, i) => `
    <div class="custom-trans-row">
      <span class="ct-key">${row.key}</span>
      <select onchange="customTransRows[${i}].trans=this.value">
        ${['Cut','Fade','Wipe','Slide','Zoom'].map(t =>
          `<option${t === row.trans ? ' selected' : ''}>${t}</option>`
        ).join('')}
      </select>
      <input type="number" value="${row.dur}" min="100" max="5000" step="100" style="width:70px;"
        onchange="customTransRows[${i}].dur=parseInt(this.value)">
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
  const dt  = document.getElementById('cfg-default-trans').value;
  const dd  = parseInt(document.getElementById('cfg-default-dur').value) || 1000;
  const fd  = parseInt(document.getElementById('cfg-ftb-dur').value) || 500;
  const ltf = parseInt(document.getElementById('cfg-lt-fade').value) ?? 400;

  S.trans    = dt;
  S.duration = dd;
  S.ftbDur   = fd;
  S.ltFade   = ltf;

  // Sync slider
  const sl = document.getElementById('dur-slider');
  sl.value = dd;
  document.getElementById('dur-val').textContent = (dd/1000).toFixed(1) + 's';

  // Sync trans buttons
  const btn = document.querySelector(`.trans-type-btn[data-t="${dt}"]`);
  if (btn) { document.querySelectorAll('.trans-type-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }

  // Save custom trans
  S.customTrans = customTransRows.map(r => ({...r}));

  closeModal('config-modal');
  elog('Config saved', 'go');
}

// ─── LOGS ────────────────────────────────────────────────────────────────────
function elog(msg, type) {
  const body = document.getElementById('log-body');
  body.querySelector('.log-empty')?.remove();
  S.logCount++;
  const ts = new Date().toTimeString().slice(0, 8);
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-ts">${ts}</span><span class="log-msg ${type||''}">${msg}</span>`;
  body.appendChild(div);
  body.scrollLeft = body.scrollWidth;
  document.getElementById('log-cnt').textContent = S.logCount + ' event' + (S.logCount !== 1 ? 's' : '');
}

function clearLog() {
  document.getElementById('log-body').innerHTML = '<span class="log-empty">Waiting...</span>';
  S.logCount = 0;
  document.getElementById('log-cnt').textContent = '0 events';
}

function rlog(msg, type) {
  const log = document.getElementById('replay-log');
  const ts  = new Date().toTimeString().slice(0, 8);
  const div = document.createElement('div');
  div.className = 'rl-entry';
  div.innerHTML = `<span class="rl-ts">${ts} </span><span class="rl-msg ${type||''}">${msg}</span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ─── MODALS ──────────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
  if (id === 'lt-modal') renderLTSavedList();
}
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

// ─── KEYBOARD ────────────────────────────────────────────────────────────────
function setupKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.metaKey) return;

    const k = e.key;

    // 1–9 → Preview
    if (/^[1-9]$/.test(k) && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const inp = S.inputs[parseInt(k) - 1];
      if (inp) toPreview(inp.id);
      return;
    }

    // Ctrl+1–9 → direct to Output
    if (/^[1-9]$/.test(k) && e.ctrlKey) {
      e.preventDefault();
      const inp = S.inputs[parseInt(k) - 1];
      if (inp) toProgramDirect(inp.id);
      return;
    }

    // F1–F5 → transition type
    const fMap = { F1:'Cut', F2:'Fade', F3:'Wipe', F4:'Slide', F5:'Zoom' };
    if (fMap[k]) {
      e.preventDefault();
      const btn = document.querySelector(`.trans-type-btn[data-t="${fMap[k]}"]`);
      if (btn) selTrans(btn);
      return;
    }

    // F6–F12 → custom transitions
    const fNum = parseInt(k.replace('F', ''));
    if (k.startsWith('F') && !isNaN(fNum) && fNum >= 6 && fNum <= 12) {
      e.preventDefault();
      const ct = S.customTrans[fNum - 6];
      if (ct && S.preview !== null) {
        const savedTrans = S.trans, savedDur = S.duration;
        S.trans = ct.trans; S.duration = ct.dur;
        doTransition();
        S.trans = savedTrans; S.duration = savedDur;
      }
      return;
    }

    switch (k) {
      case ' ':           e.preventDefault(); doTransition(); break;
      case 'a': case 'A': doAuto(); break;
      case 'b': case 'B': doFTB(); break;
      case 'i': case 'I': doMarkIn(); break;
      case 'o': case 'O': doMarkOut(); break;
      case 'p': case 'P': doReplayPlay(); break;
      case 'l': case 'L': doReplayLoop(); break;
      case 's': case 'S': doReplayStop(); break;
      case 'r': case 'R': doReturnLive(); break;
      case '[':            setSpeed(0.5); break;
      case ']':            setSpeed(1.0); break;
      case 'Escape':
        document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
        break;
    }
  });
}
