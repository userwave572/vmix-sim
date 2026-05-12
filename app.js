'use strict';

// ─── MEDIA POOL ───────────────────────────────────────────────────────────────
// One persistent DOM element per input — moved with appendChild (no restart)
const pool = new Map();

function getPoolEl(inp) {
  if (pool.has(inp.id)) return pool.get(inp.id);
  const el = makeMediaEl(inp);
  pool.set(inp.id, el);
  return el;
}

function makeMediaEl(inp) {
  let el;
  if (inp.type === 'video') {
    el = document.createElement('video');
    el.src = inp.src;
    el.muted = true; el.loop = true; el.playsInline = true;
    el.play().catch(() => {});
  } else if (inp.type === 'still') {
    el = document.createElement('img');
    el.src = inp.src; el.alt = inp.name;
  } else {
    el = document.createElement('div');
    if (inp.colType === 'bars') el.className = 'col-bars';
    else if (inp.colType === 'black') el.className = 'col-black';
    else if (inp.colType === 'white') el.className = 'col-white';
    else el.style.background = inp.customColor;
  }
  el.style.cssText += ';position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;border:none;';
  return el;
}

// ─── TWO-LAYER PGM STATE ──────────────────────────────────────────────────────
// Layer A and B alternate as active/incoming for crossfade transitions.
let pgmActive = 'a'; // which layer currently holds live content
let pgmTransitioning = false;

function getLayer(id) { return document.getElementById('pgm-layer-' + id); }
function getActiveLayer()   { return getLayer(pgmActive); }
function getInactiveLayer() { return getLayer(pgmActive === 'a' ? 'b' : 'a'); }
function getInactiveId()    { return pgmActive === 'a' ? 'b' : 'a'; }

// Place an element into PRV (single-layer, straightforward)
function placePrv(inp) {
  const media = document.getElementById('prv-media');
  const empty = document.getElementById('prv-empty');
  while (media.firstChild) media.removeChild(media.firstChild);
  if (!inp) { empty.style.display = ''; document.getElementById('prv-src').textContent = '—'; return; }
  empty.style.display = 'none';
  document.getElementById('prv-src').textContent = inp.name;
  const el = getPoolEl(inp);
  media.appendChild(el);
  if (inp.type === 'video') el.play().catch(() => {});
}

// Instant cut into PGM active layer
function placePgmCut(inp) {
  const layer = getActiveLayer();
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  const empty = document.getElementById('pgm-empty');
  if (!inp) { empty.style.display = ''; document.getElementById('pgm-src').textContent = '—'; return; }
  empty.style.display = 'none';
  document.getElementById('pgm-src').textContent = inp.name;
  const el = getPoolEl(inp);
  layer.appendChild(el);
  if (inp.type === 'video') el.play().catch(() => {});
}

// ─── STATE ────────────────────────────────────────────────────────────────────
const S = {
  inputs: [], preview: null, output: null,
  trans: 'Cut', duration: 1000, ftbDur: 500, ftbOn: false, ltFade: 400,
  markIn: null, markOut: null, speed: 1.0,
  replayState: 'idle', replayEndHandler: null,
  lts: [], prvLT: null, pgmLT: null,
  customTrans: [],
  logCount: 0,
  // overlays
  covData: {
    prv: { text: '', fg: '#ffffff', bg: '#000000', opacity: 70, size: 16, bold: false, x: 10, y: 10 },
    pgm: { text: '', fg: '#ffffff', bg: '#000000', opacity: 70, size: 16, bold: false, x: 10, y: 10 },
  },
  // score bar
  scoreData: { home: 'HOME', away: 'AWAY', homeScore: 0, awayScore: 0, period: 'Q1', homeCol: '#cc0000', awayCol: '#0044cc' },
  scorePrv: false, scorePgm: false, scorePos: 'bottom',
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
  setupDragOverlays();
  setupScoreSync();
});

// ─── TIMERS ──────────────────────────────────────────────────────────────────
function startStreamTimer() {
  const t0 = Date.now();
  setInterval(() => {
    const e = Math.floor((Date.now() - t0) / 1000);
    document.getElementById('stream-timer').textContent =
      p2(Math.floor(e/3600)) + ':' + p2(Math.floor((e%3600)/60)) + ':' + p2(e%60);
  }, 500);
}
function p2(n) { return String(n).padStart(2,'0'); }
function fmtT(s) {
  if (s == null || isNaN(s)) return '--:--:--';
  const n = Math.floor(s);
  return p2(Math.floor(n/3600)) + ':' + p2(Math.floor((n%3600)/60)) + ':' + p2(n%60);
}

function startVideoTimeClock() {
  setInterval(() => {
    const vid = getPgmVideo();
    if (vid) document.getElementById('buf-disp').textContent = fmtT(vid.currentTime);
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
    const base = S.output && !S.ftbOn ? 0.55 : 0.02;
    document.getElementById('ml').style.height = Math.round(Math.min(1, base + Math.random()*.35)*100) + '%';
    document.getElementById('mr').style.height = Math.round(Math.min(1, base + Math.random()*.35)*100) + '%';
  }, 80);
}

function setOnAir(v) { document.getElementById('onair').classList.toggle('live', v); }

// ─── DUR SLIDER ──────────────────────────────────────────────────────────────
function setupDurSlider() {
  const sl = document.getElementById('dur-slider');
  sl.value = S.duration;
  document.getElementById('dur-val').textContent = (S.duration/1000).toFixed(1)+'s';
  sl.addEventListener('input', () => {
    S.duration = parseInt(sl.value);
    document.getElementById('dur-val').textContent = (S.duration/1000).toFixed(1)+'s';
  });
}

// ─── ADD INPUTS ──────────────────────────────────────────────────────────────
function addFileInput() {
  const f = document.getElementById('file-pick').files[0];
  const name = document.getElementById('file-name').value.trim() || (f ? f.name.replace(/\.[^.]+$/,'') : 'Video');
  if (!f) { alert('Select a video file.'); return; }
  pushInput({ name, type:'video', src:URL.createObjectURL(f) });
  document.getElementById('file-pick').value = '';
  document.getElementById('file-name').value = '';
}

function addStillInput() {
  const f = document.getElementById('still-pick').files[0];
  const name = document.getElementById('still-name').value.trim() || (f ? f.name.replace(/\.[^.]+$/,'') : 'Still');
  if (!f) { alert('Select an image file.'); return; }
  pushInput({ name, type:'still', src:URL.createObjectURL(f) });
  document.getElementById('still-pick').value = '';
  document.getElementById('still-name').value = '';
}

function addColourInput() {
  const t = document.getElementById('col-type').value;
  const c = document.getElementById('col-pick').value;
  const name = document.getElementById('col-name').value.trim() || t;
  pushInput({ name, type:'colour', colType:t, customColor:c });
  document.getElementById('col-name').value = '';
}

function pushInput(inp) {
  inp.id = Date.now() + Math.random();
  S.inputs.push(inp);
  renderAll(); renderModalList();
  elog('Input added: '+inp.name, 'go');
}

function removeInput(id) {
  if (pool.has(id)) {
    const el = pool.get(id);
    if (el.parentNode) el.parentNode.removeChild(el);
    if (el.tagName==='VIDEO') { el.pause(); el.src=''; }
    pool.delete(id);
  }
  S.inputs = S.inputs.filter(i=>i.id!==id);
  if (S.preview===id) { S.preview=null; placePrv(null); }
  if (S.output===id)  { S.output=null; clearPgm(); setOnAir(false); }
  renderAll(); renderModalList();
}

function clearPgm() {
  const layer = getActiveLayer();
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  document.getElementById('pgm-empty').style.display = '';
  document.getElementById('pgm-src').textContent = '—';
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
function renderAll() { renderTiles(); renderSwitcher(); }

function renderTiles() {
  const row = document.getElementById('inputs-row');
  row.querySelectorAll('.inp-tile').forEach(e=>e.remove());
  document.getElementById('no-inp-msg').style.display = S.inputs.length ? 'none' : '';
  S.inputs.forEach((inp,i) => {
    const isPrv = inp.id===S.preview, isPgm = inp.id===S.output;
    const div = document.createElement('div');
    div.className = 'inp-tile ' + (isPrv?'is-prv':isPgm?'is-pgm':'');
    div.innerHTML = `
      <div class="inp-tile-thumb">${tilePic(inp)}
        ${isPrv?'<span class="inp-tile-badge badge-prv">PRV</span>':isPgm?'<span class="inp-tile-badge badge-pgm">PGM</span>':''}
      </div>
      <div class="inp-tile-bar">
        <span class="inp-tile-name" title="${inp.name}">${inp.name}</span>
        <span class="inp-tile-num">${i+1}</span>
      </div>
      <button class="inp-tile-del" onclick="event.stopPropagation();removeInput(${inp.id})">✕</button>`;
    div.addEventListener('click', () => toPreview(inp.id));
    row.appendChild(div);
  });
}

function tilePic(inp) {
  if (inp.type==='video') return `<video src="${inp.src}" muted loop playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;pointer-events:none;"></video>`;
  if (inp.type==='still') return `<img src="${inp.src}" style="width:100%;height:100%;object-fit:cover;">`;
  if (inp.type==='colour') {
    if (inp.colType==='bars')  return '<div class="col-bars" style="width:100%;height:100%;"></div>';
    if (inp.colType==='black') return '<div class="col-black" style="width:100%;height:100%;"></div>';
    if (inp.colType==='white') return '<div class="col-white" style="width:100%;height:100%;"></div>';
    return `<div style="width:100%;height:100%;background:${inp.customColor};"></div>`;
  }
  return '';
}

function renderSwitcher() {
  const row = document.getElementById('sw-row');
  if (!S.inputs.length) { row.innerHTML='<div class="sw-empty">Add inputs above to use the switcher</div>'; return; }
  row.innerHTML = S.inputs.map((inp,i) => {
    const cls = inp.id===S.preview?'sw-prv':inp.id===S.output?'sw-pgm':'';
    return `<button class="sw-btn ${cls}" onclick="toProgramDirect(${inp.id})">
      <span>${inp.name}</span><span class="sw-num">${i+1}</span></button>`;
  }).join('');
}

function renderModalList() {
  const list = document.getElementById('modal-inp-list');
  document.getElementById('modal-inp-count').textContent = S.inputs.length;
  list.innerHTML = S.inputs.map((inp,i) => `
    <div class="mil-item">
      <span class="mil-num">${i+1}</span>
      <span class="mil-name">${inp.name}</span>
      <span class="mil-type">${inp.type}</span>
      <button class="mil-del" onclick="removeInput(${inp.id})">✕</button>
    </div>`).join('') || '<span style="font-size:10px;color:#555;">No inputs.</span>';
}

// ─── SWITCHING ────────────────────────────────────────────────────────────────
function toPreview(id) {
  S.preview = id;
  const inp = S.inputs.find(i=>i.id===id);
  // Only move to PRV if it's not currently in PGM active layer
  if (id !== S.output) placePrv(inp);
  renderAll();
  elog('PRV ← ' + inp.name);
}

function toProgramDirect(id) {
  if (pgmTransitioning) return;
  const inp = S.inputs.find(i=>i.id===id);
  if (!inp) return;
  const oldPgmId = S.output;
  S.output = id;
  S.preview = (oldPgmId && oldPgmId!==id) ? oldPgmId : (S.preview===id ? null : S.preview);
  placePgmCut(inp);
  if (oldPgmId && oldPgmId!==id) placePrv(S.inputs.find(i=>i.id===oldPgmId));
  else if (!oldPgmId) { placePrv(null); S.preview=null; }
  setOnAir(true);
  renderAll();
  elog('CUT → PGM: '+inp.name, 'cut');
}

function doTransition() {
  if (pgmTransitioning) return;
  if (S.preview===null) { elog('Nothing in preview','cut'); return; }
  const prvId=S.preview, pgmId=S.output;
  const inpNext=S.inputs.find(i=>i.id===prvId);
  const inpPrev=pgmId ? S.inputs.find(i=>i.id===pgmId) : null;
  if (S.trans==='Cut') {
    S.output=prvId; S.preview=pgmId||null;
    placePgmCut(inpNext);
    if (inpPrev) placePrv(inpPrev); else { placePrv(null); S.preview=null; }
    setOnAir(true); renderAll();
    elog('CUT → PGM: '+inpNext.name,'cut');
  } else {
    doFadeTrans(inpNext, inpPrev, prvId, pgmId);
  }
}

function doFadeTrans(inpNext, inpPrev, prvId, pgmId) {
  // Two-layer crossfade:
  // - Active layer (A) holds old content — keeps playing untouched
  // - Inactive layer (B) gets new content — fades in from opacity 0 to 1
  // - After transition: swap which layer is "active", move old content to PRV
  pgmTransitioning = true;
  const inactiveId = getInactiveId();
  const inactiveLayer = getInactiveLayer();

  // 1. Prepare inactive layer: clear, load new content, set opacity 0
  while (inactiveLayer.firstChild) inactiveLayer.removeChild(inactiveLayer.firstChild);
  const el = getPoolEl(inpNext);
  inactiveLayer.appendChild(el);
  if (inpNext.type==='video') el.play().catch(()=>{});

  // Reset without transition first
  inactiveLayer.style.transition = 'none';
  inactiveLayer.style.opacity = '0';
  inactiveLayer.style.zIndex = '2'; // on top of active layer

  document.getElementById('pgm-src').textContent = inpNext.name;
  document.getElementById('pgm-empty').style.display = 'none';

  // Force reflow so the opacity:0 is committed before we animate
  void inactiveLayer.offsetHeight;

  // 2. Fade in the inactive layer (new content) over the active layer (old content)
  inactiveLayer.style.transition = `opacity ${S.duration}ms ease`;
  inactiveLayer.style.opacity = '1';

  // 3. After the fade completes, clean up
  setTimeout(() => {
    // Swap active layer
    pgmActive = inactiveId;
    inactiveLayer.style.zIndex = '1';

    // Clear old active layer and send old content to PRV
    const oldLayer = getLayer(inactiveId === 'a' ? 'b' : 'a');
    while (oldLayer.firstChild) oldLayer.removeChild(oldLayer.firstChild);
    oldLayer.style.transition = 'none';
    oldLayer.style.opacity = '1'; // reset for next use
    oldLayer.style.zIndex = '1';

    S.output = prvId;
    S.preview = pgmId || null;
    if (inpPrev) placePrv(inpPrev);
    else { placePrv(null); S.preview = null; }

    pgmTransitioning = false;
    renderAll();
    setOnAir(true);
    elog(`${S.trans.toUpperCase()} (${(S.duration/1000).toFixed(1)}s) → PGM: ${inpNext.name}`, 'cut');
  }, S.duration + 50);
}

function doAuto() {
  if (S.preview===null || pgmTransitioning) return;
  const was=S.trans;
  if (S.trans==='Cut') S.trans='Fade';
  doTransition();
  S.trans=was;
}

function doFTB() {
  const ov = document.getElementById('ftb-overlay');
  ov.style.transition = `opacity ${S.ftbDur}ms ease`;
  S.ftbOn = !S.ftbOn;
  ov.classList.toggle('active', S.ftbOn);
  document.getElementById('ftb-go').classList.toggle('ftb-on', S.ftbOn);
  if (S.ftbOn) { setOnAir(false); elog('FADE TO BLACK','cut'); }
  else { if(S.output) setOnAir(true); elog('FADE UP','go'); }
}

function selTrans(btn) {
  S.trans = btn.dataset.t;
  document.querySelectorAll('.trans-type-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

// ─── REPLAY ──────────────────────────────────────────────────────────────────
function doMarkIn() {
  const v=getPgmVideo(); if(!v){rlog('No video in Output','err');return;}
  S.markIn=v.currentTime;
  document.getElementById('in-disp').textContent=fmtT(S.markIn);
  rlog('Mark In @ '+fmtT(S.markIn),'mark'); elog('MARK IN @ '+fmtT(S.markIn),'mark');
}

function doMarkOut() {
  const v=getPgmVideo(); if(!v){rlog('No video in Output','err');return;}
  S.markOut=v.currentTime;
  document.getElementById('out-disp').textContent=fmtT(S.markOut);
  rlog('Mark Out @ '+fmtT(S.markOut),'mark'); elog('MARK OUT @ '+fmtT(S.markOut),'mark');
}

function doReplayPlay() {
  const v=getPgmVideo(); if(!v){rlog('No video in Output','err');return;}
  if(S.markIn===null){rlog('Set Mark In first','err');return;}
  if(S.markOut===null){rlog('Set Mark Out first','err');return;}
  if(S.markOut<=S.markIn){rlog('Mark Out must be after Mark In','err');return;}
  stopReplayWatcher(v);
  v.playbackRate=S.speed;
  v.currentTime=S.markIn;
  const onSeeked=()=>{ v.play().catch(()=>{}); v.removeEventListener('seeked',onSeeked); attachWatcher(v,false); };
  v.addEventListener('seeked',onSeeked);
  setRStat('playing',`▶ PLAYING  ${fmtT(S.markIn)} → ${fmtT(S.markOut)}  @ ${S.speed}x`);
  rlog(`Play ${fmtT(S.markIn)}→${fmtT(S.markOut)} @ ${S.speed}x`,'go');
}

function doReplayLoop() {
  const v=getPgmVideo(); if(!v){rlog('No video in Output','err');return;}
  if(S.markIn===null||S.markOut===null){rlog('Set marks first','err');return;}
  if(S.markOut<=S.markIn){rlog('Mark Out must be after Mark In','err');return;}
  stopReplayWatcher(v);
  S.replayState='looping';
  v.playbackRate=S.speed; v.currentTime=S.markIn;
  const onSeeked=()=>{ v.play().catch(()=>{}); v.removeEventListener('seeked',onSeeked); attachWatcher(v,true); };
  v.addEventListener('seeked',onSeeked);
  setRStat('looping',`⟳ LOOPING  ${fmtT(S.markIn)} → ${fmtT(S.markOut)}  @ ${S.speed}x`);
  rlog(`Loop ${fmtT(S.markIn)}→${fmtT(S.markOut)} @ ${S.speed}x`,'go');
}

function attachWatcher(v,loop) {
  if(S.replayEndHandler) v.removeEventListener('timeupdate',S.replayEndHandler);
  S.replayEndHandler=function(){
    if(v.currentTime>=S.markOut) {
      if(loop&&S.replayState==='looping') { v.currentTime=S.markIn; }
      else { v.pause(); v.playbackRate=1; S.replayState='idle'; setRStat('idle','IDLE — replay complete'); rlog('Complete','go'); v.removeEventListener('timeupdate',S.replayEndHandler); S.replayEndHandler=null; }
    }
  };
  v.addEventListener('timeupdate',S.replayEndHandler);
}

function stopReplayWatcher(v) {
  if(S.replayEndHandler&&v){ v.removeEventListener('timeupdate',S.replayEndHandler); S.replayEndHandler=null; }
}

function doReplayStop() {
  const v=getPgmVideo(); if(v){stopReplayWatcher(v);v.playbackRate=1;v.play().catch(()=>{});}
  S.replayState='idle'; setRStat('idle','IDLE'); rlog('Stopped');
}

function doReturnLive() { doReplayStop(); elog('RETURN TO LIVE','go'); }

function setSpeed(v) {
  S.speed=v;
  document.getElementById('spd-disp').textContent=v+'x';
  document.querySelectorAll('.spd').forEach(b=>b.classList.remove('active'));
  const m={0.25:0,0.5:1,1.0:2,2.0:3}; if(m[v]!==undefined) document.querySelectorAll('.spd')[m[v]].classList.add('active');
  const vid=getPgmVideo(); if(vid&&S.replayState!=='idle') vid.playbackRate=v;
  elog('Speed → '+v+'x','speed');
}

function setRStat(state,msg) {
  S.replayState=state;
  const bar=document.getElementById('replay-status-bar');
  bar.textContent=msg; bar.className='replay-status-bar '+(state==='idle'?'':state);
}

function rlog(msg,type) {
  const log=document.getElementById('replay-log');
  const div=document.createElement('div'); div.className='rl-entry';
  div.innerHTML=`<span class="rl-ts">${new Date().toTimeString().slice(0,8)} </span><span class="rl-msg ${type||''}">${msg}</span>`;
  log.appendChild(div); log.scrollTop=log.scrollHeight;
}

// ─── LOWER THIRDS ─────────────────────────────────────────────────────────────
function applyLT(which) {
  const title=document.getElementById('lt-title').value.trim();
  const sub=document.getElementById('lt-sub').value.trim();
  const pos=document.getElementById('lt-pos').value;
  const bg=document.getElementById('lt-bg').value;
  const fg=document.getElementById('lt-fg').value;
  if(!title){alert('Enter a title.');return;}
  const lt={title,sub,pos,bg,fg};
  const key=title+'||'+sub;
  if(!S.lts.find(l=>l.key===key)){S.lts.push({key,...lt});renderLTSavedList();}
  renderLTonMon(which,lt);
  if(which==='prv') S.prvLT=lt; else S.pgmLT=lt;
  elog('Lower third → '+which.toUpperCase()+': '+title);
}

function renderLTonMon(which,lt) {
  const c=document.getElementById(which+'-lt');
  c.innerHTML=''; void c.offsetWidth;
  const d=document.createElement('div');
  d.className='lt-overlay '+(lt.pos||'bottom-left');
  d.style.setProperty('animation-duration',S.ltFade+'ms');
  d.innerHTML=`<div class="lt-title-text" style="background:${lt.bg};color:${lt.fg};">${lt.title}</div>
    ${lt.sub?`<div class="lt-sub-text" style="color:${lt.fg};">${lt.sub}</div>`:''}`;
  c.appendChild(d);
}

function clearLT() {
  document.getElementById('prv-lt').innerHTML='';
  document.getElementById('pgm-lt').innerHTML='';
  S.prvLT=null; S.pgmLT=null; elog('Lower thirds cleared');
}

function renderLTSavedList() {
  const list=document.getElementById('lt-saved-list');
  if(!S.lts.length){list.innerHTML='<span style="font-size:10px;color:#555;padding:4px 0;display:block;">No saved lower thirds.</span>';return;}
  list.innerHTML=S.lts.map((lt,i)=>`
    <div class="lt-saved-item">
      <div class="lt-si-dot" style="background:${lt.bg};"></div>
      <span class="lt-si-name">${lt.title}${lt.sub?' — '+lt.sub:''}</span>
      <button class="lt-si-apply" onclick="applyLTSaved(${i},'prv')">PRV</button>
      <button class="lt-si-apply pgm-apply" onclick="applyLTSaved(${i},'pgm')">PGM</button>
      <button class="lt-si-del" onclick="deleteLTSaved(${i})">✕</button>
    </div>`).join('');
}

function applyLTSaved(i,which) {
  const lt=S.lts[i];
  renderLTonMon(which,lt);
  if(which==='prv') S.prvLT=lt; else S.pgmLT=lt;
}

function deleteLTSaved(i) { S.lts.splice(i,1); renderLTSavedList(); }

// ─── CUSTOM OVERLAY ───────────────────────────────────────────────────────────
function updateCovPreview(which) {
  const d = S.covData[which];
  d.text   = document.getElementById('cov-'+which+'-text').value;
  d.fg     = document.getElementById('cov-'+which+'-fg').value;
  d.bg     = document.getElementById('cov-'+which+'-bg').value;
  d.opacity= parseInt(document.getElementById('cov-'+which+'-opacity').value);
  d.size   = parseInt(document.getElementById('cov-'+which+'-size').value);
  d.bold   = document.getElementById('cov-'+which+'-bold').checked;
  document.getElementById('cov-'+which+'-size-val').textContent = d.size+'px';
  const el = document.getElementById(which+'-cov');
  if(el.style.display!=='none') applyStylesToCov(which);
}

function applyStylesToCov(which) {
  const d = S.covData[which];
  const el = document.getElementById(which+'-cov');
  el.textContent = d.text || '(empty overlay)';
  el.style.color = d.fg;
  el.style.background = hexToRgba(d.bg, d.opacity/100);
  el.style.fontSize = d.size+'px';
  el.style.fontWeight = d.bold ? '700' : '400';
  el.style.left = d.x+'%';
  el.style.top  = d.y+'%';
}

function showCov(which) {
  updateCovPreview(which);
  const el = document.getElementById(which+'-cov');
  el.style.display = 'block';
  applyStylesToCov(which);
  elog('Custom overlay → '+which.toUpperCase());
}

function hideCov(which) {
  document.getElementById(which+'-cov').style.display='none';
}

function hexToRgba(hex,a) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

function switchOTab(which,btn) {
  document.querySelectorAll('.otab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.ot-panel').forEach(p=>p.style.display='none');
  btn.classList.add('active');
  document.getElementById('ot-'+which).style.display='flex';
}

// ─── DRAG OVERLAYS ────────────────────────────────────────────────────────────
function setupDragOverlays() {
  ['prv','pgm'].forEach(which => {
    setupDraggable(which+'-cov', which+'-screen', which, 'cov');
    setupDraggable(which+'-score', which+'-screen', which, 'score');
  });
}

function setupDraggable(elId, containerId, which, type) {
  const el = document.getElementById(elId);
  let dragging=false, startX=0, startY=0, startLeft=0, startTop=0;

  el.addEventListener('mousedown', e => {
    if(e.button!==0) return;
    e.preventDefault();
    dragging=true;
    startX=e.clientX; startY=e.clientY;
    const rect=el.getBoundingClientRect();
    startLeft=rect.left; startTop=rect.top;
  });

  document.addEventListener('mousemove', e => {
    if(!dragging) return;
    const container=document.getElementById(containerId);
    const cRect=container.getBoundingClientRect();
    const dx=e.clientX-startX, dy=e.clientY-startY;
    const newLeft=startLeft+dx-cRect.left;
    const newTop=startTop+dy-cRect.top;
    const xPct=Math.max(0,Math.min(90, (newLeft/cRect.width)*100));
    const yPct=Math.max(0,Math.min(90, (newTop/cRect.height)*100));
    el.style.left=xPct+'%';
    el.style.top=yPct+'%';
    if(type==='cov') { S.covData[which].x=xPct; S.covData[which].y=yPct; }
    else { S.scoreData[which+'X']=xPct; }
  });

  document.addEventListener('mouseup', ()=>{ dragging=false; });
}

// ─── SCORE BAR ────────────────────────────────────────────────────────────────
function buildScoreBarHTML(d) {
  return `<div class="score-bar">
    <div class="sb-home" style="background:${d.homeCol};">${d.home}</div>
    <div class="sb-center">
      <span class="sb-score">${d.homeScore}</span>
      <span class="sb-sep">—</span>
      <span class="sb-score">${d.awayScore}</span>
      <span class="sb-period">${d.period}</span>
    </div>
    <div class="sb-away" style="background:${d.awayCol};">${d.away}</div>
  </div>`;
}

function renderScoreBars() {
  const d = {
    ...S.scoreData,
    homeCol: document.getElementById('score-home-col').value,
    awayCol: document.getElementById('score-away-col').value,
  };
  S.scoreData.homeCol=d.homeCol; S.scoreData.awayCol=d.awayCol;
  const pos=document.getElementById('score-pos').value; S.scorePos=pos;
  ['prv','pgm'].forEach(which=>{
    const wrap=document.getElementById(which+'-score');
    wrap.innerHTML=buildScoreBarHTML(d);
    wrap.className='score-bar-wrap pos-'+pos;
  });
}

function showScore(which) {
  renderScoreBars();
  if(which==='all'||which==='prv') { document.getElementById('prv-score').style.display='block'; S.scorePrv=true; }
  if(which==='all'||which==='pgm') { document.getElementById('pgm-score').style.display='block'; S.scorePgm=true; }
  elog('Score bar → '+(which==='all'?'PRV + PGM':which.toUpperCase()));
}

function hideScore(which) {
  if(which==='all'||which==='prv') { document.getElementById('prv-score').style.display='none'; S.scorePrv=false; }
  if(which==='all'||which==='pgm') { document.getElementById('pgm-score').style.display='none'; S.scorePgm=false; }
}

function adjustScore(team, delta) {
  if(team==='home') S.scoreData.homeScore=Math.max(0,S.scoreData.homeScore+delta);
  else S.scoreData.awayScore=Math.max(0,S.scoreData.awayScore+delta);
  document.getElementById('score-home-val').textContent=S.scoreData.homeScore;
  document.getElementById('score-away-val').textContent=S.scoreData.awayScore;
  manualScoreUpdate();
  broadcastScore();
}

function manualScoreUpdate() {
  S.scoreData.home   = document.getElementById('score-home-name').value||'HOME';
  S.scoreData.away   = document.getElementById('score-away-name').value||'AWAY';
  S.scoreData.period = document.getElementById('score-period').value||'Q1';
  if(S.scorePrv||S.scorePgm) renderScoreBars();
}

function openScoreController() {
  window.open('scores.html','_blank');
}

// ─── SCORE SYNC (BroadcastChannel) ────────────────────────────────────────────
let scoreChannel = null;

function setupScoreSync() {
  try {
    scoreChannel = new BroadcastChannel('livesim_scores');
    scoreChannel.onmessage = (e) => {
      if (e.data.type === 'score_update') {
        const d = e.data.data;
        S.scoreData = { ...S.scoreData, ...d };
        document.getElementById('score-home-name').value=S.scoreData.home;
        document.getElementById('score-away-name').value=S.scoreData.away;
        document.getElementById('score-home-val').textContent=S.scoreData.homeScore;
        document.getElementById('score-away-val').textContent=S.scoreData.awayScore;
        document.getElementById('score-period').value=S.scoreData.period;
        if(S.scorePrv||S.scorePgm) renderScoreBars();
      }
    };
  } catch(e) { console.warn('BroadcastChannel not supported'); }
}

function broadcastScore() {
  if (scoreChannel) scoreChannel.postMessage({ type:'score_update', data:S.scoreData });
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const customTransRows=[];

function addCustomTrans() {
  const fKey='F'+(6+customTransRows.length);
  if(6+customTransRows.length>12){alert('Max 7 custom slots (F6–F12)');return;}
  customTransRows.push({key:fKey,trans:'Fade',dur:1000});
  renderCTList();
}

function renderCTList() {
  document.getElementById('custom-trans-list').innerHTML=customTransRows.map((r,i)=>`
    <div class="custom-trans-row">
      <span class="ct-key">${r.key}</span>
      <select onchange="customTransRows[${i}].trans=this.value">
        ${['Cut','Fade','Wipe','Slide','Zoom'].map(t=>`<option${t===r.trans?' selected':''}>${t}</option>`).join('')}
      </select>
      <input type="number" value="${r.dur}" min="100" max="5000" step="100" style="width:70px;" onchange="customTransRows[${i}].dur=parseInt(this.value)">
      <span style="font-size:9px;color:var(--text3);">ms</span>
      <button onclick="customTransRows.splice(${i},1);renderCTList()">✕</button>
    </div>`).join('');
}

function saveConfig() {
  const dt=document.getElementById('cfg-default-trans').value;
  const dd=parseInt(document.getElementById('cfg-default-dur').value)||1000;
  const fd=parseInt(document.getElementById('cfg-ftb-dur').value)||500;
  const lf=parseInt(document.getElementById('cfg-lt-fade').value)??400;
  S.trans=dt; S.duration=dd; S.ftbDur=fd; S.ltFade=lf;
  document.getElementById('dur-slider').value=dd;
  document.getElementById('dur-val').textContent=(dd/1000).toFixed(1)+'s';
  const btn=document.querySelector(`.trans-type-btn[data-t="${dt}"]`);
  if(btn){document.querySelectorAll('.trans-type-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');}
  S.customTrans=customTransRows.map(r=>({...r}));
  closeModal('config-modal'); elog('Config saved','go');
}

// ─── LOG ─────────────────────────────────────────────────────────────────────
function elog(msg,type) {
  const body=document.getElementById('log-body');
  body.querySelector('.log-empty')?.remove();
  S.logCount++;
  const div=document.createElement('div'); div.className='log-entry';
  div.innerHTML=`<span class="log-ts">${new Date().toTimeString().slice(0,8)}</span><span class="log-msg ${type||''}">${msg}</span>`;
  body.appendChild(div); body.scrollLeft=body.scrollWidth;
  document.getElementById('log-cnt').textContent=S.logCount+' event'+(S.logCount!==1?'s':'');
}

function clearLog() {
  document.getElementById('log-body').innerHTML='<span class="log-empty">Waiting...</span>';
  S.logCount=0; document.getElementById('log-cnt').textContent='0 events';
}

// ─── MODALS ──────────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
  if(id==='lt-modal') renderLTSavedList();
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', e=>{ if(e.target.classList.contains('modal-bg')) closeModal(e.target.id); });

function switchMTab(tab,btn) {
  document.querySelectorAll('.mtab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.modal-form').forEach(f=>f.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('mf-'+tab).classList.add('active');
}

// ─── KEYBOARD ────────────────────────────────────────────────────────────────
function setupKeyboard() {
  document.addEventListener('keydown', e=>{
    const tag=document.activeElement?.tagName;
    if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA') return;
    if(e.metaKey) return;
    const k=e.key;

    if(/^[1-9]$/.test(k)&&!e.ctrlKey&&!e.shiftKey&&!e.altKey) {
      e.preventDefault();
      const inp=S.inputs[parseInt(k)-1]; if(inp) toPreview(inp.id); return;
    }
    if(/^[1-9]$/.test(k)&&e.ctrlKey) {
      e.preventDefault();
      const inp=S.inputs[parseInt(k)-1]; if(inp) toProgramDirect(inp.id); return;
    }

    const fMap={F1:'Cut',F2:'Fade',F3:'Wipe',F4:'Slide',F5:'Zoom'};
    if(fMap[k]) {
      e.preventDefault();
      const btn=document.querySelector(`.trans-type-btn[data-t="${fMap[k]}"]`);
      if(btn) selTrans(btn); return;
    }

    const fNum=parseInt(k.replace('F',''));
    if(k.startsWith('F')&&!isNaN(fNum)&&fNum>=6&&fNum<=12&&!pgmTransitioning) {
      e.preventDefault();
      const ct=S.customTrans[fNum-6];
      if(ct&&S.preview!==null) {
        const wt=S.trans,wd=S.duration;
        S.trans=ct.trans; S.duration=ct.dur;
        doTransition();
        S.trans=wt; S.duration=wd;
      }
      return;
    }

    switch(k) {
      case ' ':          e.preventDefault(); doTransition(); break;
      case 'a':case 'A': doAuto(); break;
      case 'b':case 'B': doFTB(); break;
      case 'i':case 'I': doMarkIn(); break;
      case 'o':case 'O': doMarkOut(); break;
      case 'p':case 'P': doReplayPlay(); break;
      case 'l':case 'L': doReplayLoop(); break;
      case 's':case 'S': doReplayStop(); break;
      case 'r':case 'R': doReturnLive(); break;
      case '[':           setSpeed(0.5); break;
      case ']':           setSpeed(1.0); break;
      case 'Escape':
        document.querySelectorAll('.modal-bg.open').forEach(m=>m.classList.remove('open')); break;
    }
  });
}
