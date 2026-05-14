'use strict';

// ─── INDEXEDDB PERSISTENCE ────────────────────────────────────────────────────
let idb = null;
async function openIDB() {
  if (idb) return idb;
  return new Promise((res, rej) => {
    const req = indexedDB.open('livesim_v1', 2);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('inputs')) db.createObjectStore('inputs', { keyPath: 'id' });
    };
    req.onsuccess = e => { idb = e.target.result; res(idb); };
    req.onerror = () => rej(req.error);
  });
}
async function dbPut(inp, blob) {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('inputs', 'readwrite');
    const record = { id: inp.id, name: inp.name, type: inp.type, blob, meta: { colType: inp.colType, customColor: inp.customColor, logoPos: inp.logoPos, logoSize: inp.logoSize } };
    tx.objectStore('inputs').put(record);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function dbDel(id) {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('inputs', 'readwrite');
    tx.objectStore('inputs').delete(id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function dbGetAll() {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('inputs', 'readonly');
    const req = tx.objectStore('inputs').getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}
async function dbClear() {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('inputs', 'readwrite');
    tx.objectStore('inputs').clear();
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}

// ─── LOCALSTORAGE SETTINGS ────────────────────────────────────────────────────
const LS_KEY = 'livesim_settings_v1';
function saveSettings() {
  try {
    const data = {
      trans: S.trans, duration: S.duration, ftbDur: S.ftbDur, ltFade: S.ltFade,
      lts: S.lts, savedClips: S.savedClips,
      configuredTrans: S.configuredTrans,
      customTransRows: customTransRows,
      scoreData: S.scoreData, covData: S.covData, scorePos: S.scorePos,
      colorInputs: S.inputs.filter(i => i.type === 'colour'),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    document.getElementById('sb-persist').textContent = '💾 Saved';
    setTimeout(() => { const el = document.getElementById('sb-persist'); if (el) el.textContent = '💾 Ready'; }, 1500);
  } catch(e) { console.warn('Settings save failed:', e); }
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.trans) S.trans = d.trans;
    if (d.duration) S.duration = d.duration;
    if (d.ftbDur) S.ftbDur = d.ftbDur;
    if (d.ltFade) S.ltFade = d.ltFade;
    if (d.lts) S.lts = d.lts;
    if (d.savedClips) S.savedClips = d.savedClips;
    if (d.configuredTrans) Object.assign(S.configuredTrans, d.configuredTrans);
    if (d.customTransRows) { customTransRows.length = 0; d.customTransRows.forEach(r => customTransRows.push(r)); }
    if (d.scoreData) Object.assign(S.scoreData, d.scoreData);
    if (d.covData) Object.assign(S.covData, d.covData);
    if (d.scorePos) S.scorePos = d.scorePos;
    if (d.colorInputs) d.colorInputs.forEach(inp => S.inputs.push(inp));
  } catch(e) { console.warn('Settings load failed:', e); }
}
async function clearStorage() {
  if (!confirm('Clear all saved data (inputs, settings, clips)? This cannot be undone.')) return;
  localStorage.removeItem(LS_KEY);
  await dbClear();
  location.reload();
}

// ─── MEDIA POOL ───────────────────────────────────────────────────────────────
const pool = new Map();
function getEl(inp) {
  if (pool.has(inp.id)) return pool.get(inp.id);
  const el = makeEl(inp); pool.set(inp.id, el); return el;
}
function makeEl(inp) {
  const base = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;border:none;';
  let el;
  if (inp.type === 'video') {
    el = document.createElement('video');
    el.src = inp.src; el.muted = true; el.loop = true; el.playsInline = true;
    el.play().catch(() => {});
  } else if (inp.type === 'still') {
    el = document.createElement('img'); el.src = inp.src; el.alt = inp.name;
  } else if (inp.type === 'logo') {
    el = document.createElement('div');
    el.style.cssText = base + 'background:#111;display:flex;align-items:center;justify-content:center;';
    const img = document.createElement('img');
    img.src = inp.src; img.style.cssText = 'max-width:80%;max-height:80%;object-fit:contain;position:relative;';
    el.appendChild(img); return el;
  } else {
    el = document.createElement('div');
    if (inp.colType === 'bars') el.className = 'col-bars';
    else if (inp.colType === 'black') el.className = 'col-black';
    else if (inp.colType === 'white') el.className = 'col-white';
    else { el.style.background = inp.customColor; }
  }
  el.style.cssText += base; return el;
}

// ─── AUDIO CONTROL ────────────────────────────────────────────────────────────
// Only the PGM output video should ever produce sound.
function getMasterVol() {
  const sl = document.getElementById('vol-master-slider');
  return sl ? parseInt(sl.value) / 100 : 1.0;
}
function muteAllVideos() {
  pool.forEach(el => { if (el.tagName === 'VIDEO') { el.muted = true; } });
}
function unmutePgm(inp) {
  if (!inp || inp.type !== 'video') return;
  const el = pool.get(inp.id);
  if (el) { el.muted = false; el.volume = getMasterVol(); }
}

// ─── TWO-LAYER PGM ────────────────────────────────────────────────────────────
let pgmActive = 'a', pgmLocked = false;
const lyr = id => document.getElementById('pgm-layer-' + id);
const activeLyr   = () => lyr(pgmActive);
const inactiveLyr = () => lyr(pgmActive === 'a' ? 'b' : 'a');
const inactiveId  = () => pgmActive === 'a' ? 'b' : 'a';

// ─── STATE ────────────────────────────────────────────────────────────────────
const S = {
  inputs: [], preview: null, output: null,
  trans: 'Cut', duration: 1000, ftbDur: 500, ftbOn: false, ltFade: 400,
  markIn: null, markOut: null, speed: 1.0,
  replayState: 'idle', replayEndHandler: null,
  lts: [], prvLT: null, pgmLT: null,
  savedClips: [],
  configuredTrans: { Cut: { dur: 500 }, Fade: { dur: 1000 }, Wipe: { dur: 800 }, Fly: { dur: 800 }, Zoom: { dur: 800 } },
  covData: { prv: { text: '', fg: '#fff', bg: '#000', opacity: 70, size: 18, bold: false, x: 10, y: 10 }, pgm: { text: '', fg: '#fff', bg: '#000', opacity: 70, size: 18, bold: false, x: 10, y: 10 } },
  scoreData: { home: 'HOME', away: 'AWAY', homeScore: 0, awayScore: 0, period: 'Q1', homeCol: '#cc0000', awayCol: '#0044cc' },
  scorePrv: false, scorePgm: false, scorePos: 'bottom',
  stingerSrc: null,   // ObjectURL string for stinger
  editingTrans: null,
  activeOvlLayer: 1,
};

const customTransRows = [];

// ─── BOOT ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  setupDurSlider();
  setupVolumeSlider();
  startStreamTimer();
  startAudioMeters();
  startVideoTimeClock();
  startClockDisplay();
  setupKeyboard();
  setupDragOverlays();
  setupScoreSync();
  setupReplayChannel();

  // Restore settings first (synchronous)
  loadSettings();
  syncUIFromState();

  // Restore file inputs from IndexedDB (async)
  await restoreFileInputs();

  renderAll();
  renderModalList();
  buildAudioPanel();
  renderLTSavedList();
  renderClipsList();
});

async function restoreFileInputs() {
  try {
    const records = await dbGetAll();
    for (const r of records) {
      if (!r.blob) continue;
      const src = URL.createObjectURL(r.blob);
      const inp = { id: r.id, name: r.name, type: r.type, src, ...r.meta };
      S.inputs.push(inp);
    }
  } catch(e) { console.warn('IDB restore error:', e); }
}

function syncUIFromState() {
  // Sync transition buttons
  document.querySelectorAll('.trans-btn').forEach(b => b.classList.toggle('active', b.dataset.t === S.trans));
  // Sync dur slider
  const sl = document.getElementById('dur-slider');
  if (sl) { sl.value = S.duration; document.getElementById('dur-val').textContent = (S.duration/1000).toFixed(1)+'s'; }
  // Sync custom trans UI
  if (customTransRows.length) renderCTList();
  // Sync score modal fields
  const fields = { home: 'score-home-name', away: 'score-away-name', period: 'score-period', homeCol: 'score-home-col', awayCol: 'score-away-col' };
  Object.entries(fields).forEach(([k, id]) => { const el = document.getElementById(id); if (el) el.value = S.scoreData[k]; });
  document.getElementById('score-home-val').textContent = S.scoreData.homeScore;
  document.getElementById('score-away-val').textContent = S.scoreData.awayScore;
}

// ─── TIMERS ──────────────────────────────────────────────────────────────────
function startStreamTimer() {
  const t0 = Date.now();
  setInterval(() => {
    const e = Math.floor((Date.now() - t0) / 1000);
    const s = p2(Math.floor(e/3600))+':'+p2(Math.floor((e%3600)/60))+':'+p2(e%60);
    document.getElementById('stream-timer').textContent = s;
    document.getElementById('tc-time').textContent = s + '.00';
  }, 500);
}
function startClockDisplay() {
  const update = () => {
    const n = new Date(); let h = n.getHours(), m = n.getMinutes(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    document.getElementById('tc-clock').textContent = h + ':' + p2(m) + ' ' + ap;
  };
  update(); setInterval(update, 1000);
}
function startVideoTimeClock() {
  setInterval(() => {
    const v = getPgmVideo();
    if (v) {
      document.getElementById('buf-disp').textContent = fmtT(v.currentTime);
      broadcastReplayStatus();
    }
  }, 250);
}
function startAudioMeters() {
  setInterval(() => {
    const base = S.output && !S.ftbOn ? 0.55 : 0.02;
    document.querySelectorAll('.ach-mfill').forEach(() => {});
    document.querySelectorAll('.ach-mfill').forEach(f => {
      f.style.height = Math.round(Math.min(1, base + Math.random() * 0.38) * 100) + '%';
    });
  }, 80);
}
const p2 = n => String(n).padStart(2, '0');
const fmtT = s => { if (!s && s !== 0) return '--:--:--'; const n = Math.floor(s); return p2(Math.floor(n/3600))+':'+p2(Math.floor((n%3600)/60))+':'+p2(n%60); };
function getPgmVideo() {
  if (!S.output) return null;
  const inp = S.inputs.find(i => i.id === S.output);
  if (!inp || inp.type !== 'video') return null;
  return pool.get(inp.id);
}
function setOnAir(v) { document.getElementById('onair').classList.toggle('live', v); }

// ─── SLIDERS ─────────────────────────────────────────────────────────────────
function setupDurSlider() {
  const sl = document.getElementById('dur-slider');
  sl.addEventListener('input', () => {
    S.duration = parseInt(sl.value);
    document.getElementById('dur-val').textContent = (S.duration/1000).toFixed(1) + 's';
  });
}
function setupVolumeSlider() {
  const sl = document.getElementById('vol-master-slider');
  if (!sl) return;
  sl.addEventListener('input', () => {
    const vol = parseInt(sl.value) / 100;
    const pgmInp = S.inputs.find(i => i.id === S.output);
    if (pgmInp && pgmInp.type === 'video') {
      const el = pool.get(pgmInp.id);
      if (el) el.volume = vol;
    }
  });
}

// ─── ADD INPUTS ──────────────────────────────────────────────────────────────
async function addFileInput() {
  const f = document.getElementById('file-pick').files[0];
  const name = document.getElementById('file-name').value.trim() || (f ? f.name.replace(/\.[^.]+$/, '') : 'Video');
  if (!f) { alert('Select a file.'); return; }
  const src = URL.createObjectURL(f);
  const inp = { id: Date.now() + Math.random(), name, type: 'video', src };
  S.inputs.push(inp);
  await dbPut(inp, f); // persist blob
  afterAddInput(); document.getElementById('file-pick').value = ''; document.getElementById('file-name').value = '';
}
async function addStillInput() {
  const f = document.getElementById('still-pick').files[0];
  const name = document.getElementById('still-name').value.trim() || (f ? f.name.replace(/\.[^.]+$/, '') : 'Still');
  if (!f) { alert('Select a file.'); return; }
  const src = URL.createObjectURL(f);
  const inp = { id: Date.now() + Math.random(), name, type: 'still', src };
  S.inputs.push(inp);
  await dbPut(inp, f);
  afterAddInput(); document.getElementById('still-pick').value = ''; document.getElementById('still-name').value = '';
}
async function addLogoInput() {
  const f = document.getElementById('logo-pick').files[0];
  const name = document.getElementById('logo-name').value.trim() || (f ? f.name.replace(/\.[^.]+$/, '') : 'Logo');
  const pos = document.getElementById('logo-pos').value;
  if (!f) { alert('Select a file.'); return; }
  const src = URL.createObjectURL(f);
  const inp = { id: Date.now() + Math.random(), name, type: 'logo', src, logoPos: pos };
  S.inputs.push(inp);
  await dbPut(inp, f);
  afterAddInput(); document.getElementById('logo-pick').value = ''; document.getElementById('logo-name').value = '';
}
function addColourInput() {
  const t = document.getElementById('col-type').value;
  const c = document.getElementById('col-pick').value;
  const name = document.getElementById('col-name').value.trim() || t;
  const inp = { id: Date.now() + Math.random(), name, type: 'colour', colType: t, customColor: c };
  S.inputs.push(inp);
  afterAddInput(); document.getElementById('col-name').value = '';
}
function afterAddInput() { renderAll(); renderModalList(); buildAudioPanel(); saveSettings(); }

async function removeInput(id) {
  if (pool.has(id)) {
    const el = pool.get(id);
    if (el.parentNode) el.parentNode.removeChild(el);
    if (el.tagName === 'VIDEO') { el.pause(); el.src = ''; }
    pool.delete(id);
  }
  S.inputs = S.inputs.filter(i => i.id !== id);
  if (S.preview === id) { S.preview = null; placePrv(null); }
  if (S.output === id) { S.output = null; clearPgm(); setOnAir(false); }
  await dbDel(id);
  renderAll(); renderModalList(); buildAudioPanel(); saveSettings();
}

// ─── AUDIO PANEL ─────────────────────────────────────────────────────────────
function buildAudioPanel() {
  const outRow = document.getElementById('ach-outputs');
  outRow.innerHTML = `
    <div class="ach wide">
      <div class="ach-name">Master</div>
      <div class="ach-meters"><div class="ach-meter"><div class="ach-mfill"></div></div><div class="ach-meter"><div class="ach-mfill"></div></div></div>
      <div class="ach-fader"><div class="ach-fl" style="bottom:48%;"></div></div>
      <input id="vol-master-slider" type="range" min="0" max="100" value="100" style="width:100%;accent-color:#555;margin:2px 0;">
      <div class="ach-vol" id="vol-master-val">100%</div>
      <div class="ach-btns"><button class="ach-btn m" title="Mute">M</button><button class="ach-btn on" title="Bus A">A</button></div>
    </div>
    <div class="ach wide">
      <div class="ach-name">Recording</div>
      <div class="ach-meters"><div class="ach-meter"><div class="ach-mfill"></div></div><div class="ach-meter"><div class="ach-mfill"></div></div></div>
      <div class="ach-fader"><div class="ach-fl" style="bottom:48%;"></div></div>
      <div class="ach-vol">100%</div>
      <div class="ach-btns"><button class="ach-btn m">M</button><button class="ach-btn on">A</button></div>
    </div>`;
  const slider = document.getElementById('vol-master-slider');
  if (slider) slider.addEventListener('input', e => {
    document.getElementById('vol-master-val').textContent = e.target.value + '%';
    const vol = parseInt(e.target.value) / 100;
    const pgmInp = S.inputs.find(i => i.id === S.output);
    if (pgmInp?.type === 'video') { const el = pool.get(pgmInp.id); if (el) el.volume = vol; }
  });

  document.getElementById('ach-inputs').innerHTML = S.inputs.filter(i => i.type === 'video').map(inp => `
    <div class="ach">
      <div class="ach-name" title="${inp.name}">${inp.name.slice(0, 7)}</div>
      <div class="ach-meters"><div class="ach-meter"><div class="ach-mfill"></div></div><div class="ach-meter"><div class="ach-mfill"></div></div></div>
      <div class="ach-fader"><div class="ach-fl" style="bottom:48%;"></div></div>
      <div class="ach-vol">100%</div>
      <div class="ach-btns"><button class="ach-btn m">M</button><button class="ach-btn">A</button><button class="ach-btn">B</button></div>
    </div>`).join('') || '<span style="font-size:9px;color:#444;padding:4px;">No audio</span>';
}
function toggleAudio() {
  const panel = document.getElementById('audio-panel');
  const btn = document.querySelector('.audio-toggle-btn');
  const collapsed = panel.classList.toggle('collapsed');
  btn.textContent = collapsed ? '▶' : '◀';
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
const TILE_COLORS = ['#e8890a','#e8c200','#0a9955','#0077cc','#8800cc','#cc0055','#008888','#cc4400','#448800','#004499'];

function renderAll() { renderTiles(); updateSB(); }

function renderTiles() {
  const inner = document.getElementById('inputs-inner');
  inner.querySelectorAll('.inp-tile').forEach(e => e.remove());
  document.getElementById('no-inp-msg').style.display = S.inputs.length ? 'none' : '';
  S.inputs.forEach((inp, i) => {
    const isPrv = inp.id === S.preview, isPgm = inp.id === S.output;
    const color = TILE_COLORS[i % TILE_COLORS.length];
    const div = document.createElement('div');
    div.className = 'inp-tile' + (isPrv ? ' is-prv' : isPgm ? ' is-pgm' : '');
    div.innerHTML = `
      <div class="tile-hdr">
        <span class="tile-num" style="background:${color};">${i+1}</span>
        <span class="tile-name-lbl" onclick="toPreview(${inp.id})" title="${inp.name}">${inp.name}</span>
        <button class="tile-x" onclick="event.stopPropagation();removeInput(${inp.id})">✕</button>
      </div>
      <div class="tile-thumb" onclick="toPreview(${inp.id})">
        ${tilePic(inp)}
        ${isPrv ? '<span class="tile-badge prv">PRV</span>' : isPgm ? '<span class="tile-badge pgm">PGM</span>' : ''}
      </div>
      <div class="tile-actions">
        <button class="tile-act prv-act" onclick="toPreview(${inp.id})">Preview</button>
        <button class="tile-act" onclick="doQuickPlay(${inp.id})">Quick Play</button>
        <button class="tile-act cut-act" onclick="toPgmDirect(${inp.id})">Cut</button>
      </div>
      <div class="tile-sw">
        <button class="tile-sw-btn${isPgm?' sw-pgm':''}" onclick="toPgmDirect(${inp.id})">PGM</button>
        <button class="tile-sw-btn${isPrv?' sw-prv':''}" onclick="toPreview(${inp.id})">PRV</button>
        <button class="tile-sw-btn" onclick="toPgmDirect(${inp.id})">OVL1</button>
        <button class="tile-sw-btn">AUDIO</button>
      </div>`;
    inner.appendChild(div);
  });
}

function tilePic(inp) {
  if (inp.type === 'video') return `<video src="${inp.src}" muted loop playsinline preload="metadata" class="tile-fill" style="pointer-events:none;"></video>`;
  if (inp.type === 'still') return `<img src="${inp.src}" class="tile-fill">`;
  if (inp.type === 'logo') return `<div class="tile-logo-fill" style="position:absolute;inset:0;"><img src="${inp.src}" style="max-width:80%;max-height:80%;object-fit:contain;"></div>`;
  if (inp.type === 'colour') {
    if (inp.colType === 'bars') return '<div class="col-bars tile-fill"></div>';
    if (inp.colType === 'black') return '<div class="col-black tile-fill"></div>';
    if (inp.colType === 'white') return '<div class="col-white tile-fill"></div>';
    return `<div class="tile-fill" style="background:${inp.customColor};"></div>`;
  }
  return '';
}

function updateSB() {
  document.getElementById('sb-ninputs').textContent = S.inputs.length + ' input' + (S.inputs.length !== 1 ? 's' : '');
}

function renderModalList() {
  const list = document.getElementById('modal-inp-list');
  document.getElementById('modal-inp-count').textContent = S.inputs.length;
  list.innerHTML = S.inputs.map((inp, i) => `
    <div class="mil">
      <span class="mil-num">${i+1}</span>
      <span class="mil-name">${inp.name}</span>
      <span class="mil-type">${inp.type}</span>
      <button class="mil-del" onclick="removeInput(${inp.id})">✕</button>
    </div>`).join('') || '<span style="font-size:10px;color:#444;">No inputs.</span>';
}

// ─── MONITOR LOADING ─────────────────────────────────────────────────────────
function placePrv(inp) {
  const media = document.getElementById('prv-media');
  while (media.firstChild) media.removeChild(media.firstChild);
  const empty = document.getElementById('prv-empty');
  if (!inp) { empty.style.display = ''; document.getElementById('prv-src').textContent = '—'; return; }
  empty.style.display = 'none';
  document.getElementById('prv-src').textContent = inp.name;
  const el = getEl(inp);
  el.muted = true; // PRV is always muted
  media.appendChild(el);
  if (inp.type === 'video') el.play().catch(() => {});
}

function clearPgm() {
  const layer = activeLyr();
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  document.getElementById('pgm-empty').style.display = '';
  document.getElementById('pgm-src').textContent = '—';
  muteAllVideos();
}

function placePgmCut(inp) {
  const layer = activeLyr();
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  const empty = document.getElementById('pgm-empty');
  if (!inp) { empty.style.display = ''; document.getElementById('pgm-src').textContent = '—'; muteAllVideos(); return; }
  empty.style.display = 'none';
  document.getElementById('pgm-src').textContent = inp.name;
  const el = getEl(inp);
  layer.appendChild(el);
  if (inp.type === 'video') {
    el.play().catch(() => {});
  }
  // ★ AUDIO FIX: mute all first, then unmute the PGM video
  muteAllVideos();
  unmutePgm(inp);
}

// ─── SWITCHING ────────────────────────────────────────────────────────────────
function toPreview(id) {
  S.preview = id;
  const inp = S.inputs.find(i => i.id === id);
  if (id !== S.output) placePrv(inp);
  renderAll();
}

function toPgmDirect(id) {
  if (pgmLocked) return;
  const inp = S.inputs.find(i => i.id === id); if (!inp) return;
  const oldPgmId = S.output;
  S.output = id;
  S.preview = (oldPgmId && oldPgmId !== id) ? oldPgmId : (S.preview === id ? null : S.preview);
  placePgmCut(inp);
  if (oldPgmId && oldPgmId !== id) placePrv(S.inputs.find(i => i.id === oldPgmId));
  else if (!oldPgmId) { placePrv(null); S.preview = null; }
  setOnAir(true); renderAll();
}

function doTransition() {
  if (pgmLocked) return;
  if (S.preview === null) return;
  const prvId = S.preview, pgmId = S.output;
  const inpNext = S.inputs.find(i => i.id === prvId);
  const inpPrev = pgmId ? S.inputs.find(i => i.id === pgmId) : null;
  if (S.trans === 'Cut') {
    S.output = prvId; S.preview = pgmId || null;
    placePgmCut(inpNext);
    if (inpPrev) placePrv(inpPrev); else { placePrv(null); S.preview = null; }
    setOnAir(true); renderAll();
  } else {
    doFadeTrans(inpNext, inpPrev, prvId, pgmId);
  }
}

function doFadeTrans(inpNext, inpPrev, prvId, pgmId) {
  pgmLocked = true;
  const inId = inactiveId(), inLayer = inactiveLyr();
  while (inLayer.firstChild) inLayer.removeChild(inLayer.firstChild);
  const el = getEl(inpNext);
  el.muted = true; // start muted during transition
  inLayer.appendChild(el);
  if (inpNext.type === 'video') el.play().catch(() => {});
  document.getElementById('pgm-src').textContent = inpNext.name;
  document.getElementById('pgm-empty').style.display = 'none';
  inLayer.style.transition = 'none';
  inLayer.style.opacity = '0';
  void inLayer.offsetHeight;
  inLayer.style.transition = `opacity ${S.duration}ms ease`;
  inLayer.style.opacity = '1';
  setTimeout(() => {
    pgmActive = inId;
    const oldLyr = lyr(inId === 'a' ? 'b' : 'a');
    while (oldLyr.firstChild) oldLyr.removeChild(oldLyr.firstChild);
    oldLyr.style.transition = 'none'; oldLyr.style.opacity = '1'; oldLyr.style.zIndex = '1';
    inLayer.style.zIndex = '1';
    S.output = prvId; S.preview = pgmId || null;
    if (inpPrev) placePrv(inpPrev); else { placePrv(null); S.preview = null; }
    // ★ AUDIO: unmute after transition complete
    muteAllVideos(); unmutePgm(inpNext);
    pgmLocked = false; setOnAir(true); renderAll();
  }, S.duration + 50);
}

function doAuto() {
  if (S.preview === null || pgmLocked) return;
  const was = S.trans; if (S.trans === 'Cut') S.trans = 'Fade';
  doTransition(); S.trans = was;
}

function doFTB() {
  const ov = document.getElementById('ftb-overlay');
  ov.style.transition = `opacity ${S.ftbDur}ms ease`;
  S.ftbOn = !S.ftbOn; ov.classList.toggle('active', S.ftbOn);
  document.getElementById('ftb-col-btn').classList.toggle('active', S.ftbOn);
  if (S.ftbOn) { muteAllVideos(); setOnAir(false); }
  else { unmutePgm(S.inputs.find(i => i.id === S.output)); if (S.output) setOnAir(true); }
}

function doQuickPlay(id) {
  const inp = id ? S.inputs.find(i => i.id === id) : S.inputs.find(i => i.id === S.preview);
  if (!inp) return;
  const el = getEl(inp);
  if (inp.type === 'video' && el) { el.currentTime = 0; el.play().catch(() => {}); }
  toPgmDirect(inp.id);
}

function selTrans(btn) {
  S.trans = btn.dataset.t;
  if (S.configuredTrans[S.trans]) { S.duration = S.configuredTrans[S.trans].dur; document.getElementById('dur-slider').value = S.duration; document.getElementById('dur-val').textContent = (S.duration/1000).toFixed(1)+'s'; }
  document.querySelectorAll('.trans-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function selOvlLayer(btn) {
  document.querySelectorAll('.ovl-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); S.activeOvlLayer = parseInt(btn.dataset.l);
}

// ─── TRANS CONFIG ─────────────────────────────────────────────────────────────
function openTransCfg(t) {
  S.editingTrans = t;
  document.getElementById('tc-title').textContent = t + ' Config';
  document.getElementById('tc-dur').value = S.configuredTrans[t]?.dur || 1000;
  openModal('trans-cfg-modal');
}
function saveTransCfg() {
  const t = S.editingTrans; if (!t) return;
  S.configuredTrans[t] = { dur: parseInt(document.getElementById('tc-dur').value) || 1000 };
  if (S.trans === t) { S.duration = S.configuredTrans[t].dur; document.getElementById('dur-slider').value = S.duration; document.getElementById('dur-val').textContent = (S.duration/1000).toFixed(1)+'s'; }
  closeModal('trans-cfg-modal'); saveSettings();
}

// ─── STINGER ─────────────────────────────────────────────────────────────────
function loadStinger() {
  const f = document.getElementById('stinger-pick').files[0];
  if (!f) { alert('Select a video file.'); return; }
  S.stingerSrc = URL.createObjectURL(f);
  // Preload
  const vid = document.getElementById('stinger-src-el');
  vid.src = S.stingerSrc; vid.load();
  document.getElementById('stinger-status').textContent = '✓ Loaded: ' + f.name;
  document.getElementById('stinger-status').style.color = 'var(--green2)';
}
function clearStinger() {
  S.stingerSrc = null;
  document.getElementById('stinger-src-el').src = '';
  document.getElementById('stinger-status').textContent = 'Using default white flash';
  document.getElementById('stinger-status').style.color = 'var(--text3)';
}

// ★ STINGER FIX: guard against double-callback, fresh video element, explicit src
function playStinger(cb) {
  const overlay = document.getElementById('stinger-overlay');
  overlay.innerHTML = '';
  overlay.style.display = 'block';
  let fired = false;
  const done = () => { if (fired) return; fired = true; overlay.style.display = 'none'; overlay.innerHTML = ''; if (cb) cb(); };

  if (S.stingerSrc) {
    // Create a fresh video element — do NOT clone, set src explicitly
    const v = document.createElement('video');
    v.src = S.stingerSrc;
    v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;';
    v.muted = true; // stinger is usually silent
    v.playsInline = true;
    overlay.appendChild(v);
    // Wait for canplay, then play
    const tryPlay = () => { v.play().then(() => {}).catch(() => done()); };
    v.addEventListener('ended', done);
    v.addEventListener('error', done);
    v.addEventListener('canplay', tryPlay, { once: true });
    v.load();
    // Hard fallback: if video hasn't ended in 8 seconds, fire anyway
    setTimeout(done, 8000);
  } else {
    // Default: white flash
    overlay.style.background = '#fff';
    overlay.style.opacity = '1';
    // Fade out
    setTimeout(() => {
      overlay.style.transition = 'opacity 200ms';
      overlay.style.opacity = '0';
      setTimeout(done, 220);
    }, 180);
  }
}

// ─── REPLAY ──────────────────────────────────────────────────────────────────
function doMarkIn() {
  const v = getPgmVideo(); if (!v) { rlog('No video in Output', 'err'); return; }
  S.markIn = v.currentTime;
  document.getElementById('in-disp').textContent = fmtT(S.markIn);
  rlog('Mark In @ ' + fmtT(S.markIn), 'mark');
}
function doMarkOut() {
  const v = getPgmVideo(); if (!v) { rlog('No video in Output', 'err'); return; }
  S.markOut = v.currentTime;
  document.getElementById('out-disp').textContent = fmtT(S.markOut);
  rlog('Mark Out @ ' + fmtT(S.markOut), 'mark');
}
function doReplayPlay() {
  const v = getPgmVideo(); if (!v) { rlog('No video in Output', 'err'); return; }
  if (S.markIn === null) { rlog('Set Mark In first', 'err'); return; }
  if (S.markOut === null) { rlog('Set Mark Out first', 'err'); return; }
  if (S.markOut <= S.markIn) { rlog('Mark Out must be after Mark In', 'err'); return; }
  stopReplayWatcher(v);
  setRStat('playing', `▶ PLAYING  ${fmtT(S.markIn)} → ${fmtT(S.markOut)}  @ ${S.speed}x`);
  playStinger(() => {
    v.playbackRate = S.speed; v.currentTime = S.markIn;
    const onSeeked = () => { v.play().catch(() => {}); v.removeEventListener('seeked', onSeeked); attachWatcher(v, false); showRplBadge(true); };
    v.addEventListener('seeked', onSeeked);
  });
  rlog(`Play ${fmtT(S.markIn)}→${fmtT(S.markOut)} @ ${S.speed}x`, 'go');
}
function doReplayLoop() {
  const v = getPgmVideo(); if (!v) { rlog('No video in Output', 'err'); return; }
  if (S.markIn === null || S.markOut === null) { rlog('Set marks first', 'err'); return; }
  if (S.markOut <= S.markIn) { rlog('Mark Out must be after Mark In', 'err'); return; }
  stopReplayWatcher(v); S.replayState = 'looping';
  setRStat('looping', `⟳ LOOPING  ${fmtT(S.markIn)} → ${fmtT(S.markOut)}  @ ${S.speed}x`);
  playStinger(() => {
    v.playbackRate = S.speed; v.currentTime = S.markIn;
    const onSeeked = () => { v.play().catch(() => {}); v.removeEventListener('seeked', onSeeked); attachWatcher(v, true); showRplBadge(true); };
    v.addEventListener('seeked', onSeeked);
  });
  rlog(`Loop ${fmtT(S.markIn)}→${fmtT(S.markOut)} @ ${S.speed}x`, 'go');
}
function attachWatcher(v, loop) {
  if (S.replayEndHandler) v.removeEventListener('timeupdate', S.replayEndHandler);
  S.replayEndHandler = function() {
    if (v.currentTime >= S.markOut) {
      if (loop && S.replayState === 'looping') { v.currentTime = S.markIn; }
      else {
        v.removeEventListener('timeupdate', S.replayEndHandler); S.replayEndHandler = null;
        playStinger(() => { v.pause(); v.playbackRate = 1; v.play().catch(() => {}); S.replayState = 'idle'; setRStat('idle', 'IDLE — replay complete'); showRplBadge(false); rlog('Complete', 'go'); });
      }
    }
  };
  v.addEventListener('timeupdate', S.replayEndHandler);
}
function stopReplayWatcher(v) { if (S.replayEndHandler && v) { v.removeEventListener('timeupdate', S.replayEndHandler); S.replayEndHandler = null; } }
function doReplayStop() {
  const v = getPgmVideo(); if (v) { stopReplayWatcher(v); v.playbackRate = 1; v.play().catch(() => {}); }
  S.replayState = 'idle'; setRStat('idle', 'IDLE'); showRplBadge(false); rlog('Stopped');
}
function doReturnLive() {
  const v = getPgmVideo();
  if (v && S.replayState !== 'idle') { playStinger(() => { doReplayStop(); }); }
  else { doReplayStop(); }
}
function showRplBadge(show) {
  const b = document.getElementById('replay-badge'); if (!b) return;
  b.style.display = show ? 'block' : 'none';
  document.getElementById('rpl-spd').textContent = S.speed + 'x';
}
function setSpeed(v) {
  S.speed = v; document.getElementById('spd-disp').textContent = v + 'x';
  document.querySelectorAll('.spd-btn').forEach(b => b.classList.remove('active'));
  const m = { 0.25: 0, 0.5: 1, 1.0: 2, 2.0: 3 }; if (m[v] !== undefined) document.querySelectorAll('.spd-btn')[m[v]].classList.add('active');
  const vid = getPgmVideo(); if (vid && S.replayState !== 'idle') vid.playbackRate = v;
}
function setRStat(state, msg) {
  S.replayState = state;
  const bar = document.getElementById('rpl-status'); if (!bar) return;
  bar.textContent = msg; bar.className = 'rpl-status-bar ' + (state === 'idle' ? '' : state);
}
function rlog(msg, type) {
  const log = document.getElementById('replay-log'); if (!log) return;
  const div = document.createElement('div'); div.className = 'rl-entry';
  div.innerHTML = `<span class="rl-ts">${new Date().toTimeString().slice(0,8)} </span><span class="rl-msg ${type||''}">${msg}</span>`;
  log.appendChild(div); log.scrollTop = log.scrollHeight;
}

// ─── CLIPS ───────────────────────────────────────────────────────────────────
function saveClip() {
  if (S.markIn === null || S.markOut === null) { alert('Set Mark In and Mark Out first.'); return; }
  const name = document.getElementById('clip-save-name').value.trim() || `Clip ${S.savedClips.length + 1}`;
  S.savedClips.push({ id: Date.now(), name, markIn: S.markIn, markOut: S.markOut, speed: S.speed, dur: S.markOut - S.markIn });
  document.getElementById('clip-save-name').value = '';
  renderClipsList(); saveSettings();
  broadcastReplayStatus();
}
function deleteClip(id) { S.savedClips = S.savedClips.filter(c => c.id !== id); renderClipsList(); saveSettings(); broadcastReplayStatus(); }
function playClip(id, loop = false) {
  const clip = S.savedClips.find(c => c.id === id); if (!clip) return;
  S.markIn = clip.markIn; S.markOut = clip.markOut; S.speed = clip.speed || 1.0;
  document.getElementById('in-disp').textContent = fmtT(S.markIn);
  document.getElementById('out-disp').textContent = fmtT(S.markOut);
  document.getElementById('spd-disp').textContent = S.speed + 'x';
  setSpeed(S.speed);
  if (loop) doReplayLoop(); else doReplayPlay();
}
function renderClipsList() {
  const list = document.getElementById('clips-list'); if (!list) return;
  const cnt = document.getElementById('clip-count'); if (cnt) cnt.textContent = S.savedClips.length;
  list.innerHTML = S.savedClips.map(c => `
    <div class="clip-item">
      <span class="clip-name">${c.name}</span>
      <span class="clip-dur">${fmtT(c.dur)} @ ${c.speed}x</span>
      <button class="clip-btn play" onclick="playClip(${c.id},false)">▶</button>
      <button class="clip-btn loop" onclick="playClip(${c.id},true)">⟳</button>
      <button class="clip-del" onclick="deleteClip(${c.id})">✕</button>
    </div>`).join('') || '<span style="font-size:10px;color:#444;">No clips saved.</span>';
}

// ─── REPLAY CHANNEL (BroadcastChannel to replay.html) ────────────────────────
let replayChannel = null;
function setupReplayChannel() {
  try {
    replayChannel = new BroadcastChannel('livesim_replay');
    replayChannel.onmessage = e => {
      const { type, cmd, data } = e.data;
      if (type === 'command') {
        switch(cmd) {
          case 'mark_in':   doMarkIn(); break;
          case 'mark_out':  doMarkOut(); break;
          case 'play':      doReplayPlay(); break;
          case 'loop':      doReplayLoop(); break;
          case 'stop':      doReplayStop(); break;
          case 'live':      doReturnLive(); break;
          case 'set_speed': setSpeed(data.speed); break;
          case 'play_clip': playClip(data.id, false); break;
          case 'loop_clip': playClip(data.id, true); break;
          case 'save_clip': { if (data) { S.markIn=data.markIn; S.markOut=data.markOut; document.getElementById('clip-save-name').value=data.name||''; saveClip(); } break; }
          case 'delete_clip': deleteClip(data.id); break;
          case 'request_status': broadcastReplayStatus(); break;
        }
      }
    };
  } catch(e) { console.warn('Replay BroadcastChannel error:', e); }
}
function broadcastReplayStatus() {
  if (!replayChannel) return;
  const v = getPgmVideo();
  replayChannel.postMessage({
    type: 'status',
    data: {
      currentTime: v ? v.currentTime : null,
      duration: v ? v.duration : null,
      markIn: S.markIn, markOut: S.markOut,
      replayState: S.replayState, speed: S.speed,
      pgmName: S.output ? (S.inputs.find(i => i.id === S.output)?.name || null) : null,
      savedClips: S.savedClips,
    }
  });
}

// ─── LOWER THIRDS ─────────────────────────────────────────────────────────────
function applyLT(which) {
  const title = document.getElementById('lt-title').value.trim();
  if (!title) { alert('Enter a title.'); return; }
  const lt = { title, sub: document.getElementById('lt-sub').value.trim(), pos: document.getElementById('lt-pos').value, bg: document.getElementById('lt-bg').value, fg: document.getElementById('lt-fg').value };
  const key = title + '||' + lt.sub;
  if (!S.lts.find(l => l.key === key)) { S.lts.push({ key, ...lt }); renderLTSavedList(); saveSettings(); }
  renderLTonMon(which, lt);
  if (which === 'prv') S.prvLT = lt; else S.pgmLT = lt;
}
function renderLTonMon(which, lt) {
  const c = document.getElementById(which + '-lt'); if (!c) return;
  c.innerHTML = ''; void c.offsetWidth;
  const d = document.createElement('div');
  d.className = 'lt-overlay ' + (lt.pos || 'bottom-left');
  d.style.animationDuration = S.ltFade + 'ms';
  d.innerHTML = `<div class="lt-title-text" style="background:${lt.bg};color:${lt.fg};">${lt.title}</div>${lt.sub ? `<div class="lt-sub-text" style="color:${lt.fg};">${lt.sub}</div>` : ''}`;
  c.appendChild(d);
}
function clearLT() { ['prv','pgm'].forEach(w => { document.getElementById(w+'-lt').innerHTML=''; }); S.prvLT=null; S.pgmLT=null; }
function renderLTSavedList() {
  const list = document.getElementById('lt-saved-list'); if (!list) return;
  list.innerHTML = S.lts.map((lt, i) => `
    <div class="lt-si">
      <div class="lt-si-dot" style="background:${lt.bg};"></div>
      <span class="lt-si-name">${lt.title}${lt.sub?' — '+lt.sub:''}</span>
      <button class="lt-si-prv" onclick="applyLTSaved(${i},'prv')">PRV</button>
      <button class="lt-si-pgm" onclick="applyLTSaved(${i},'pgm')">PGM</button>
      <button class="lt-si-del" onclick="delLT(${i})">✕</button>
    </div>`).join('') || '<span style="font-size:10px;color:#444;padding:4px;display:block;">No saved lower thirds.</span>';
}
function applyLTSaved(i, which) { const lt=S.lts[i]; renderLTonMon(which,lt); if(which==='prv')S.prvLT=lt; else S.pgmLT=lt; }
function delLT(i) { S.lts.splice(i,1); renderLTSavedList(); saveSettings(); }

// ─── CUSTOM OVERLAY ───────────────────────────────────────────────────────────
function liveCov(which) {
  const d = S.covData[which];
  d.text=document.getElementById('cov-'+which+'-text').value;
  d.fg=document.getElementById('cov-'+which+'-fg').value;
  d.bg=document.getElementById('cov-'+which+'-bg').value;
  d.opacity=parseInt(document.getElementById('cov-'+which+'-op').value)||70;
  d.size=parseInt(document.getElementById('cov-'+which+'-sz').value)||18;
  d.bold=document.getElementById('cov-'+which+'-bold').checked;
  const el=document.getElementById(which+'-cov');
  if(el.style.display!=='none') applyCov(which);
}
function applyCov(which) {
  const d=S.covData[which], el=document.getElementById(which+'-cov'); if(!el)return;
  el.textContent=d.text||'(overlay)';
  el.style.color=d.fg; el.style.background=hex2rgba(d.bg,d.opacity/100);
  el.style.fontSize=d.size+'px'; el.style.fontWeight=d.bold?'700':'400';
  el.style.left=d.x+'%'; el.style.top=d.y+'%';
}
function showCov(which){liveCov(which);const el=document.getElementById(which+'-cov');el.style.display='block';applyCov(which);}
function hideCov(which){document.getElementById(which+'-cov').style.display='none';}
function hex2rgba(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return`rgba(${r},${g},${b},${a})`;}
function switchOTab(which,btn){document.querySelectorAll('.otab').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.ot-panel').forEach(p=>p.style.display='none');btn.classList.add('active');document.getElementById('ot-'+which).style.display='flex';}

// ─── DRAG OVERLAYS ────────────────────────────────────────────────────────────
function setupDragOverlays(){['prv','pgm'].forEach(w=>{makeDraggable(w+'-cov',w+'-screen',w,'cov');makeDraggable(w+'-score',w+'-screen',w,'score');});}
function makeDraggable(elId,cId,which,type){
  const el=document.getElementById(elId);if(!el)return;
  let drag=false,sx=0,sy=0,sl=0,st=0;
  el.addEventListener('mousedown',e=>{if(e.button!==0)return;e.preventDefault();drag=true;sx=e.clientX;sy=e.clientY;const r=el.getBoundingClientRect();sl=r.left;st=r.top;});
  document.addEventListener('mousemove',e=>{if(!drag)return;const cr=document.getElementById(cId).getBoundingClientRect();const xp=Math.max(0,Math.min(90,((sl+e.clientX-sx-cr.left)/cr.width)*100));const yp=Math.max(0,Math.min(90,((st+e.clientY-sy-cr.top)/cr.height)*100));el.style.left=xp+'%';el.style.top=yp+'%';if(type==='cov'){S.covData[which].x=xp;S.covData[which].y=yp;}});
  document.addEventListener('mouseup',()=>drag=false);
}

// ─── SCORE BAR ────────────────────────────────────────────────────────────────
function buildScoreHTML(d){return`<div class="score-bar"><div class="sb-home" style="background:${d.homeCol};">${d.home}</div><div class="sb-center"><span class="sb-score">${d.homeScore}</span><span class="sb-sep">—</span><span class="sb-score">${d.awayScore}</span><span class="sb-period">${d.period}</span></div><div class="sb-away" style="background:${d.awayCol};">${d.away}</div></div>`;}
function renderScoreBars(){
  const d={...S.scoreData};
  const pos=(document.getElementById('score-pos')?.value||'bottom'); S.scorePos=pos;
  ['prv','pgm'].forEach(w=>{const wrap=document.getElementById(w+'-score');wrap.innerHTML=buildScoreHTML(d);wrap.className='score-layer pos-'+pos;});
  const prev=document.getElementById('score-preview-wrap'); if(prev)prev.innerHTML=buildScoreHTML(d);
}
function showScore(which){renderScoreBars();if(which==='prv'||which==='both'){document.getElementById('prv-score').style.display='block';S.scorePrv=true;}if(which==='pgm'||which==='both'){document.getElementById('pgm-score').style.display='block';S.scorePgm=true;}}
function hideScore(which){if(which==='all'||which==='prv'){document.getElementById('prv-score').style.display='none';S.scorePrv=false;}if(which==='all'||which==='pgm'){document.getElementById('pgm-score').style.display='none';S.scorePgm=false;}}
function adjScore(team,delta,reset=false){if(reset)S.scoreData[team+'Score']=0;else S.scoreData[team+'Score']=Math.max(0,S.scoreData[team+'Score']+delta);document.getElementById('score-'+team+'-val').textContent=S.scoreData[team+'Score'];manualScore();broadcastScore();}
function manualScore(){S.scoreData.home=document.getElementById('score-home-name')?.value||'HOME';S.scoreData.away=document.getElementById('score-away-name')?.value||'AWAY';S.scoreData.period=document.getElementById('score-period')?.value||'Q1';S.scoreData.homeCol=document.getElementById('score-home-col')?.value||'#cc0000';S.scoreData.awayCol=document.getElementById('score-away-col')?.value||'#0044cc';if(S.scorePrv||S.scorePgm)renderScoreBars();else{const prev=document.getElementById('score-preview-wrap');if(prev)prev.innerHTML=buildScoreHTML(S.scoreData);}saveSettings();broadcastScore();}
function setPeriod(p){const el=document.getElementById('score-period');if(el)el.value=p;S.scoreData.period=p;manualScore();}
function openScoreController(){window.open('scores.html','_blank');}
function openReplayManager(){window.open('replay.html','_blank');}
let scoreChannel=null;
function setupScoreSync(){try{scoreChannel=new BroadcastChannel('livesim_scores');scoreChannel.onmessage=e=>{if(e.data.type==='score_update'){Object.assign(S.scoreData,e.data.data);syncUIFromState();if(S.scorePrv||S.scorePgm)renderScoreBars();}};}catch(e){}}
function broadcastScore(){if(scoreChannel)scoreChannel.postMessage({type:'score_update',data:{...S.scoreData}});}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
function addCustomTrans(){const fKey='F'+(6+customTransRows.length);if(6+customTransRows.length>12){alert('Max 7 slots');return;}customTransRows.push({key:fKey,trans:'Fade',dur:1000});renderCTList();}
function renderCTList(){document.getElementById('custom-trans-list').innerHTML=customTransRows.map((r,i)=>`<div class="custom-trans-row"><span class="ct-key">${r.key}</span><select onchange="customTransRows[${i}].trans=this.value">${['Cut','Fade','Wipe','Fly','Zoom'].map(t=>`<option${t===r.trans?' selected':''}>${t}</option>`).join('')}</select><input type="number" value="${r.dur}" min="100" max="5000" step="100" style="width:70px;" onchange="customTransRows[${i}].dur=parseInt(this.value)"><span style="font-size:9px;color:#555;">ms</span><button onclick="customTransRows.splice(${i},1);renderCTList()">✕</button></div>`).join('');}
function saveConfig(){const dt=document.getElementById('cfg-trans').value,dd=parseInt(document.getElementById('cfg-dur').value)||1000,fd=parseInt(document.getElementById('cfg-ftb').value)||500,lf=parseInt(document.getElementById('cfg-lt').value)??400;S.trans=dt;S.duration=dd;S.ftbDur=fd;S.ltFade=lf;S.customTrans=customTransRows.map(r=>({...r}));document.getElementById('dur-slider').value=dd;document.getElementById('dur-val').textContent=(dd/1000).toFixed(1)+'s';const btn=document.querySelector(`.trans-btn[data-t="${dt}"]`);if(btn){document.querySelectorAll('.trans-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');}closeModal('config-modal');saveSettings();}

// ─── MODALS ──────────────────────────────────────────────────────────────────
function openModal(id){document.getElementById(id).classList.add('open');if(id==='lt-modal')renderLTSavedList();if(id==='score-modal'){renderScoreBars();}if(id==='replay-modal'){renderClipsList();}}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.addEventListener('click',e=>{if(e.target.classList.contains('modal-bg'))closeModal(e.target.id);});
function switchMTab(tab,btn,tabsId){document.querySelectorAll(`#${tabsId} .mtab`).forEach(b=>b.classList.remove('active'));document.querySelectorAll('.mf').forEach(f=>f.classList.remove('active'));btn.classList.add('active');document.getElementById('mf-'+tab).classList.add('active');}

// ─── KEYBOARD ────────────────────────────────────────────────────────────────
function setupKeyboard(){
  document.addEventListener('keydown',e=>{
    const tag=document.activeElement?.tagName;
    if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA')return;
    if(e.metaKey)return;
    const k=e.key;
    if(/^[1-9]$/.test(k)&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();const inp=S.inputs[parseInt(k)-1];if(inp)toPreview(inp.id);return;}
    if(/^[1-9]$/.test(k)&&e.ctrlKey){e.preventDefault();const inp=S.inputs[parseInt(k)-1];if(inp)toPgmDirect(inp.id);return;}
    const fMap={F1:'Cut',F2:'Fade',F3:'Wipe',F4:'Fly',F5:'Zoom'};
    if(fMap[k]){e.preventDefault();const btn=document.querySelector(`.trans-btn[data-t="${fMap[k]}"]`);if(btn)selTrans(btn);return;}
    const fNum=parseInt(k.replace('F',''));
    if(k.startsWith('F')&&!isNaN(fNum)&&fNum>=6&&fNum<=12&&!pgmLocked){
      e.preventDefault();
      const ct=S.customTrans?.[fNum-6];
      if(ct&&S.preview!==null){const wt=S.trans,wd=S.duration;S.trans=ct.trans;S.duration=ct.dur;doTransition();S.trans=wt;S.duration=wd;}
      return;
    }
    switch(k){
      case ' ':e.preventDefault();doTransition();break;
      case 'a':case 'A':doAuto();break;
      case 'b':case 'B':doFTB();break;
      case 'i':case 'I':doMarkIn();break;
      case 'o':case 'O':doMarkOut();break;
      case 'p':case 'P':doReplayPlay();break;
      case 'l':case 'L':doReplayLoop();break;
      case 's':case 'S':doReplayStop();break;
      case 'r':case 'R':doReturnLive();break;
      case '[':setSpeed(0.5);break;
      case ']':setSpeed(1.0);break;
      case 'Escape':document.querySelectorAll('.modal-bg.open').forEach(m=>m.classList.remove('open'));break;
    }
  });
}
