'use strict';
// ─── MEDIA POOL ───────────────────────────────────────────────────────────────
const pool = new Map(); // id → DOM element, never recreated
function getEl(inp) {
  if (pool.has(inp.id)) return pool.get(inp.id);
  const el = buildEl(inp); pool.set(inp.id, el); return el;
}
function buildEl(inp) {
  let el;
  const base = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;border:none;';
  if (inp.type==='video') {
    el=document.createElement('video');
    el.src=inp.src; el.muted=true; el.loop=true; el.playsInline=true;
    el.play().catch(()=>{});
  } else if (inp.type==='still') {
    el=document.createElement('img'); el.src=inp.src; el.alt=inp.name;
  } else if (inp.type==='logo') {
    el=document.createElement('div');
    el.className='tile-logo-thumb';
    el.style.cssText=base;
    const img=document.createElement('img'); img.src=inp.src;
    img.style.cssText='max-width:80%;max-height:80%;object-fit:contain;position:relative;';
    el.appendChild(img); return el;
  } else { // colour
    el=document.createElement('div');
    if (inp.colType==='bars') el.className='col-bars';
    else if (inp.colType==='black') el.className='col-black';
    else if (inp.colType==='white') el.className='col-white';
    else el.style.background=inp.customColor;
  }
  el.style.cssText+=base; return el;
}

// ─── TWO-LAYER PGM ────────────────────────────────────────────────────────────
let pgmActive='a', pgmLocked=false;
const lyr = id => document.getElementById('pgm-layer-'+id);
const activeLyr   = () => lyr(pgmActive);
const inactiveLyr = () => lyr(pgmActive==='a'?'b':'a');
const inactiveId  = () => pgmActive==='a'?'b':'a';

// ─── STATE ────────────────────────────────────────────────────────────────────
const S = {
  inputs:[], preview:null, output:null,
  trans:'Cut', duration:1000, ftbDur:500, ftbOn:false, ltFade:400,
  markIn:null, markOut:null, speed:1.0,
  replayState:'idle', replayEndHandler:null,
  lts:[], prvLT:null, pgmLT:null,
  customTrans:[],
  covData:{ prv:{text:'',fg:'#fff',bg:'#000',opacity:70,size:18,bold:false,x:10,y:10}, pgm:{text:'',fg:'#fff',bg:'#000',opacity:70,size:18,bold:false,x:10,y:10} },
  scoreData:{ home:'HOME', away:'AWAY', homeScore:0, awayScore:0, period:'Q1', homeCol:'#cc0000', awayCol:'#0044cc' },
  scorePrv:false, scorePgm:false, scorePos:'bottom',
  logCount:0,
  stingerVideo:null, // HTMLVideoElement if loaded
  currentTransConfig:{}, // per-trans-type config {dur, stinger}
  activeOverlayLayer:1,
  configuredTrans:{ Cut:{dur:500}, Fade:{dur:1000}, Wipe:{dur:800}, Fly:{dur:800}, Zoom:{dur:800} },
  editingTrans:null,
};

// ─── BOOT ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded',()=>{
  setupDurSlider();
  startStreamTimer();
  startAudioMeters();
  startVideoTimeClock();
  startClockDisplay();
  setupKeyboard();
  setupDragOverlays();
  setupScoreSync();
  buildAudioPanel();
  document.getElementById('logo-size').addEventListener('input',e=>{
    document.getElementById('logo-size-val').textContent=e.target.value+'%';
  });
});

// ─── TIMERS ──────────────────────────────────────────────────────────────────
function startStreamTimer(){
  const t0=Date.now();
  setInterval(()=>{
    const e=Math.floor((Date.now()-t0)/1000);
    document.getElementById('stream-timer').textContent=p2(Math.floor(e/3600))+':'+p2(Math.floor((e%3600)/60))+':'+p2(e%60);
    document.getElementById('tc-frames').textContent=p2(Math.floor(e/3600))+':'+p2(Math.floor((e%3600)/60))+':'+p2(e%60)+'.00';
  },500);
}
function startClockDisplay(){
  setInterval(()=>{
    const n=new Date();
    let h=n.getHours(),m=n.getMinutes(),ampm=h>=12?'PM':'AM';
    h=h%12||12;
    document.getElementById('tc-clock').textContent=h+':'+p2(m)+' '+ampm;
  },1000);
}
function startVideoTimeClock(){
  setInterval(()=>{
    const v=getPgmVideo();
    if(v) document.getElementById('buf-disp').textContent=fmtT(v.currentTime);
  },200);
}
function startAudioMeters(){
  // Animate all meter fills
  setInterval(()=>{
    const base=S.output&&!S.ftbOn?0.55:0.02;
    document.querySelectorAll('.ach-meter-fill').forEach((f,i)=>{
      f.style.height=Math.round(Math.min(1,base+Math.random()*.38)*100)+'%';
    });
    // Animate fader line position (cosmetic)
    const vol=parseInt(document.getElementById('vol-master')?.value||80);
    document.querySelectorAll('.ach-fader-line').forEach(l=>{
      l.style.bottom=(vol*0.6)+'%';
    });
  },80);
}

function p2(n){return String(n).padStart(2,'0');}
function fmtT(s){
  if(s==null||isNaN(s))return'--:--:--';
  const n=Math.floor(s);
  return p2(Math.floor(n/3600))+':'+p2(Math.floor((n%3600)/60))+':'+p2(n%60);
}
function getPgmVideo(){
  if(!S.output)return null;
  const inp=S.inputs.find(i=>i.id===S.output);
  if(!inp||inp.type!=='video')return null;
  return pool.get(inp.id);
}
function setOnAir(v){document.getElementById('onair').classList.toggle('live',v);}

// ─── DUR SLIDER ──────────────────────────────────────────────────────────────
function setupDurSlider(){
  const sl=document.getElementById('dur-slider');
  sl.value=S.duration;
  document.getElementById('dur-val').textContent=(S.duration/1000).toFixed(1)+'s';
  sl.addEventListener('input',()=>{
    S.duration=parseInt(sl.value);
    document.getElementById('dur-val').textContent=(S.duration/1000).toFixed(1)+'s';
  });
}

// ─── ADD INPUTS ──────────────────────────────────────────────────────────────
function addFileInput(){
  const f=document.getElementById('file-pick').files[0];
  const name=document.getElementById('file-name').value.trim()||(f?f.name.replace(/\.[^.]+$/,''):'Video');
  if(!f){alert('Select a video file.');return;}
  pushInput({name,type:'video',src:URL.createObjectURL(f)});
  document.getElementById('file-pick').value=''; document.getElementById('file-name').value='';
}
function addStillInput(){
  const f=document.getElementById('still-pick').files[0];
  const name=document.getElementById('still-name').value.trim()||(f?f.name.replace(/\.[^.]+$/,''):'Still');
  if(!f){alert('Select an image file.');return;}
  pushInput({name,type:'still',src:URL.createObjectURL(f)});
  document.getElementById('still-pick').value=''; document.getElementById('still-name').value='';
}
function addLogoInput(){
  const f=document.getElementById('logo-pick').files[0];
  const name=document.getElementById('logo-name').value.trim()||(f?f.name.replace(/\.[^.]+$/,''):'Logo');
  const pos=document.getElementById('logo-pos').value;
  const size=parseInt(document.getElementById('logo-size').value);
  if(!f){alert('Select an image file.');return;}
  pushInput({name,type:'logo',src:URL.createObjectURL(f),logoPos:pos,logoSize:size});
  document.getElementById('logo-pick').value=''; document.getElementById('logo-name').value='';
}
function addColourInput(){
  const t=document.getElementById('col-type').value;
  const c=document.getElementById('col-pick').value;
  const name=document.getElementById('col-name').value.trim()||t;
  pushInput({name,type:'colour',colType:t,customColor:c});
  document.getElementById('col-name').value='';
}
function pushInput(inp){
  inp.id=Date.now()+Math.random(); S.inputs.push(inp);
  renderAll(); renderModalList(); buildAudioPanel();
  elog('Input added: '+inp.name,'go');
}
function removeInput(id){
  if(pool.has(id)){const el=pool.get(id);if(el.parentNode)el.parentNode.removeChild(el);if(el.tagName==='VIDEO'){el.pause();el.src='';}pool.delete(id);}
  S.inputs=S.inputs.filter(i=>i.id!==id);
  if(S.preview===id){S.preview=null;placePrv(null);}
  if(S.output===id){S.output=null;clearPgm();setOnAir(false);}
  renderAll(); renderModalList(); buildAudioPanel();
}

// ─── AUDIO PANEL ─────────────────────────────────────────────────────────────
function buildAudioPanel(){
  // Output channels
  const outRow=document.getElementById('audio-outputs-row');
  outRow.innerHTML=`
    <div class="ach wide">
      <div class="ach-name">Master</div>
      <div class="ach-meters"><div class="ach-meter"><div class="ach-meter-fill"></div></div><div class="ach-meter"><div class="ach-meter-fill"></div></div></div>
      <div class="ach-fader-track"><div class="ach-fader-line" style="bottom:48%;"></div></div>
      <input id="vol-master" type="range" min="0" max="100" value="80" style="width:100%;accent-color:#555;margin:2px 0;">
      <div class="ach-vol" id="vol-master-val">80%</div>
      <div class="ach-btns"><button class="ach-btn m-btn">M</button><button class="ach-btn active">A</button></div>
    </div>
    <div class="ach wide">
      <div class="ach-name">Recording</div>
      <div class="ach-meters"><div class="ach-meter"><div class="ach-meter-fill"></div></div><div class="ach-meter"><div class="ach-meter-fill"></div></div></div>
      <div class="ach-fader-track"><div class="ach-fader-line" style="bottom:48%;"></div></div>
      <div class="ach-vol">100%</div>
      <div class="ach-btns"><button class="ach-btn m-btn">M</button><button class="ach-btn active">A</button></div>
    </div>`;
  document.getElementById('vol-master').addEventListener('input',e=>{
    document.getElementById('vol-master-val').textContent=e.target.value+'%';
  });
  // Input channels
  const inRow=document.getElementById('audio-inputs-row');
  inRow.innerHTML=S.inputs.filter(i=>i.type==='video').map(inp=>`
    <div class="ach">
      <div class="ach-name" title="${inp.name}">${inp.name.slice(0,8)}</div>
      <div class="ach-meters"><div class="ach-meter"><div class="ach-meter-fill"></div></div><div class="ach-meter"><div class="ach-meter-fill"></div></div></div>
      <div class="ach-fader-track"><div class="ach-fader-line" style="bottom:48%;"></div></div>
      <div class="ach-vol">100%</div>
      <div class="ach-btns"><button class="ach-btn m-btn">M</button><button class="ach-btn">A</button><button class="ach-btn">B</button></div>
    </div>`).join('')||'<span style="font-size:9px;color:var(--text3);padding:4px;">No audio inputs</span>';
}
function toggleAudioPanel(){
  const body=document.getElementById('audio-panel-body');
  const btn=document.getElementById('audio-toggle');
  const hidden=body.style.display==='none';
  body.style.display=hidden?'':'none';
  btn.textContent=hidden?'Hide':'Show';
  document.querySelector('.audio-panel').style.width=hidden?'220px':'32px';
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
function renderAll(){renderTiles();updateStatusBar();}

const tileColors=['#e88a00','#e8c200','#00aa55','#0088cc','#8800cc','#cc0055','#008888','#cc4400','#448800','#0044cc'];

function renderTiles(){
  const inner=document.getElementById('inputs-inner');
  inner.querySelectorAll('.inp-tile').forEach(e=>e.remove());
  document.getElementById('no-inp-msg').style.display=S.inputs.length?'none':'';
  S.inputs.forEach((inp,i)=>{
    const isPrv=inp.id===S.preview, isPgm=inp.id===S.output;
    const color=tileColors[i%tileColors.length];
    const div=document.createElement('div');
    div.className='inp-tile '+(isPrv?'is-prv':isPgm?'is-pgm':'');
    div.innerHTML=`
      <div class="tile-hdr">
        <span class="tile-num-badge" style="background:${color};">${i+1}</span>
        <span class="tile-name" onclick="toPreview(${inp.id})" title="${inp.name}">${inp.name}</span>
        <button class="tile-close-btn" onclick="event.stopPropagation();removeInput(${inp.id})">✕</button>
      </div>
      <div class="tile-thumb" onclick="toPreview(${inp.id})">
        ${tilePic(inp)}
        ${isPrv?'<span class="tile-thumb-badge prv">PRV</span>':isPgm?'<span class="tile-thumb-badge pgm">PGM</span>':''}
      </div>
      <div class="tile-actions">
        <button class="tile-act-btn prv-btn" onclick="toPreview(${inp.id})">Preview</button>
        <button class="tile-act-btn" onclick="doQuickPlay(${inp.id})">Quick Play</button>
        <button class="tile-act-btn cut-btn" onclick="toPgmDirect(${inp.id})">Cut</button>
      </div>
      <div class="tile-sw-row">
        <button class="tile-sw-btn ${isPgm?'sw-pgm-active':''}" onclick="toPgmDirect(${inp.id})" title="Cut to Output">PGM</button>
        <button class="tile-sw-btn ${isPrv?'sw-prv-active':''}" onclick="toPreview(${inp.id})" title="Send to Preview">PRV</button>
        <button class="tile-sw-btn" onclick="toPgmDirect(${inp.id})" title="Overlay 1">OVL1</button>
        <button class="tile-sw-btn" title="Audio">AUDIO</button>
      </div>`;
    inner.appendChild(div);
  });
}

function tilePic(inp){
  if(inp.type==='video') return `<video src="${inp.src}" muted loop playsinline preload="metadata" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;"></video>`;
  if(inp.type==='still') return `<img src="${inp.src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">`;
  if(inp.type==='logo')  return `<div class="tile-logo-thumb" style="position:absolute;inset:0;background:#111;display:flex;align-items:center;justify-content:center;"><img src="${inp.src}" style="max-width:80%;max-height:80%;object-fit:contain;"></div>`;
  if(inp.type==='colour'){
    if(inp.colType==='bars')  return '<div class="col-bars" style="position:absolute;inset:0;"></div>';
    if(inp.colType==='black') return '<div class="col-black" style="position:absolute;inset:0;"></div>';
    if(inp.colType==='white') return '<div class="col-white" style="position:absolute;inset:0;"></div>';
    return `<div style="position:absolute;inset:0;background:${inp.customColor};"></div>`;
  }
  return '';
}

function updateStatusBar(){
  document.getElementById('sb-inputs-count').textContent=S.inputs.length+' input'+(S.inputs.length!==1?'s':'');
}

function renderModalList(){
  const list=document.getElementById('modal-inp-list');
  document.getElementById('modal-inp-count').textContent=S.inputs.length;
  list.innerHTML=S.inputs.map((inp,i)=>`
    <div class="mil-item">
      <span class="mil-num">${i+1}</span>
      <span class="mil-name">${inp.name}</span>
      <span class="mil-type">${inp.type}</span>
      <button class="mil-del" onclick="removeInput(${inp.id})">✕</button>
    </div>`).join('')||'<span style="font-size:10px;color:#555;">No inputs.</span>';
}

// ─── MONITOR LOADING ─────────────────────────────────────────────────────────
function placePrv(inp){
  const media=document.getElementById('prv-media');
  const empty=document.getElementById('prv-empty');
  while(media.firstChild)media.removeChild(media.firstChild);
  if(!inp){empty.style.display='';document.getElementById('prv-src').textContent='—';return;}
  empty.style.display='none';
  document.getElementById('prv-src').textContent=inp.name;
  const el=getEl(inp); media.appendChild(el);
  if(inp.type==='video')el.play().catch(()=>{});
}
function clearPgm(){
  while(activeLyr().firstChild)activeLyr().removeChild(activeLyr().firstChild);
  document.getElementById('pgm-empty').style.display='';
  document.getElementById('pgm-src').textContent='—';
}
function placePgmCut(inp){
  const layer=activeLyr();
  while(layer.firstChild)layer.removeChild(layer.firstChild);
  const empty=document.getElementById('pgm-empty');
  if(!inp){empty.style.display='';document.getElementById('pgm-src').textContent='—';return;}
  empty.style.display='none';
  document.getElementById('pgm-src').textContent=inp.name;
  const el=getEl(inp); layer.appendChild(el);
  if(inp.type==='video')el.play().catch(()=>{});
}

// ─── SWITCHING ────────────────────────────────────────────────────────────────
function toPreview(id){
  S.preview=id;
  const inp=S.inputs.find(i=>i.id===id);
  if(id!==S.output)placePrv(inp);
  renderAll(); elog('PRV ← '+inp.name);
}
function toPgmDirect(id){
  if(pgmLocked)return;
  const inp=S.inputs.find(i=>i.id===id); if(!inp)return;
  const oldPgmId=S.output;
  S.output=id;
  S.preview=oldPgmId&&oldPgmId!==id?oldPgmId:S.preview===id?null:S.preview;
  placePgmCut(inp);
  if(oldPgmId&&oldPgmId!==id)placePrv(S.inputs.find(i=>i.id===oldPgmId));
  else if(!oldPgmId){placePrv(null);S.preview=null;}
  setOnAir(true); renderAll(); elog('CUT → PGM: '+inp.name,'cut');
}
function doQuickPlay(id){
  // Quick Play: plays video from start then cuts back
  const inp=id?S.inputs.find(i=>i.id===id):S.inputs.find(i=>i.id===S.preview);
  if(!inp){elog('No input for Quick Play','cut');return;}
  const el=getEl(inp);
  if(inp.type==='video'&&el){el.currentTime=0;el.play().catch(()=>{});}
  toPgmDirect(inp.id);
  elog('Quick Play: '+inp.name,'go');
}
function doTransition(){
  if(pgmLocked)return;
  if(S.preview===null){elog('Nothing in preview','cut');return;}
  const prvId=S.preview,pgmId=S.output;
  const inpNext=S.inputs.find(i=>i.id===prvId);
  const inpPrev=pgmId?S.inputs.find(i=>i.id===pgmId):null;
  if(S.trans==='Cut'){
    S.output=prvId; S.preview=pgmId||null;
    placePgmCut(inpNext);
    if(inpPrev)placePrv(inpPrev); else{placePrv(null);S.preview=null;}
    setOnAir(true); renderAll(); elog('CUT → PGM: '+inpNext.name,'cut');
  } else {
    doFadeTrans(inpNext,inpPrev,prvId,pgmId);
  }
}
function doFadeTrans(inpNext,inpPrev,prvId,pgmId){
  pgmLocked=true;
  const inId=inactiveId(), inLayer=inactiveLyr();
  while(inLayer.firstChild)inLayer.removeChild(inLayer.firstChild);
  const el=getEl(inpNext); inLayer.appendChild(el);
  if(inpNext.type==='video')el.play().catch(()=>{});
  document.getElementById('pgm-src').textContent=inpNext.name;
  document.getElementById('pgm-empty').style.display='none';
  inLayer.style.transition='none'; inLayer.style.opacity='0'; inLayer.style.zIndex='2';
  void inLayer.offsetHeight;
  inLayer.style.transition=`opacity ${S.duration}ms ease`;
  inLayer.style.opacity='1';
  setTimeout(()=>{
    pgmActive=inId;
    inLayer.style.zIndex='1';
    const oldLyr=lyr(inId==='a'?'b':'a');
    while(oldLyr.firstChild)oldLyr.removeChild(oldLyr.firstChild);
    oldLyr.style.transition='none'; oldLyr.style.opacity='1'; oldLyr.style.zIndex='1';
    S.output=prvId; S.preview=pgmId||null;
    if(inpPrev)placePrv(inpPrev); else{placePrv(null);S.preview=null;}
    pgmLocked=false; setOnAir(true); renderAll();
    elog(`${S.trans.toUpperCase()} (${(S.duration/1000).toFixed(1)}s) → PGM: ${inpNext.name}`,'cut');
  },S.duration+50);
}
function doAuto(){
  if(S.preview===null||pgmLocked)return;
  const was=S.trans; if(S.trans==='Cut')S.trans='Fade';
  doTransition(); S.trans=was;
}
function doFTB(){
  const ov=document.getElementById('ftb-overlay');
  ov.style.transition=`opacity ${S.ftbDur}ms ease`;
  S.ftbOn=!S.ftbOn; ov.classList.toggle('active',S.ftbOn);
  document.getElementById('ftb-btn').classList.toggle('active',S.ftbOn);
  if(S.ftbOn){setOnAir(false);elog('FADE TO BLACK','cut');}
  else{if(S.output)setOnAir(true);elog('FADE UP','go');}
}
function selTrans(btn){
  S.trans=btn.dataset.t;
  // Update duration from per-trans config
  if(S.configuredTrans[S.trans]){
    S.duration=S.configuredTrans[S.trans].dur;
    document.getElementById('dur-slider').value=S.duration;
    document.getElementById('dur-val').textContent=(S.duration/1000).toFixed(1)+'s';
  }
  document.querySelectorAll('.trans-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
function selOverlayLayer(btn){
  document.querySelectorAll('.ovl-sel').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  S.activeOverlayLayer=parseInt(btn.dataset.layer);
}

// ─── TRANS CONFIG ─────────────────────────────────────────────────────────────
function openTransConfig(transType){
  S.editingTrans=transType;
  document.getElementById('tc-modal-title').textContent=transType+' Config';
  document.getElementById('tc-dur').value=S.configuredTrans[transType]?.dur||1000;
  openModal('trans-config-modal');
}
function saveTransConfig(){
  const t=S.editingTrans; if(!t)return;
  S.configuredTrans[t]={dur:parseInt(document.getElementById('tc-dur').value)||1000};
  if(S.trans===t){S.duration=S.configuredTrans[t].dur;document.getElementById('dur-slider').value=S.duration;document.getElementById('dur-val').textContent=(S.duration/1000).toFixed(1)+'s';}
  closeModal('trans-config-modal'); elog(t+' config saved','go');
}

// ─── STINGER ─────────────────────────────────────────────────────────────────
function loadStinger(){
  const f=document.getElementById('stinger-pick').files[0];
  if(!f){alert('Select a video file.');return;}
  const vid=document.getElementById('stinger-video-src');
  vid.src=URL.createObjectURL(f);
  vid.load();
  S.stingerVideo=vid;
  document.getElementById('stinger-status').textContent='✓ Stinger loaded: '+f.name;
  document.getElementById('stinger-status').style.color='var(--green2)';
  elog('Stinger loaded: '+f.name,'go');
}
function clearStinger(){
  S.stingerVideo=null;
  document.getElementById('stinger-video-src').src='';
  document.getElementById('stinger-status').textContent='Using default CSS flash stinger';
  document.getElementById('stinger-status').style.color='var(--text3)';
}
function playStinger(cb){
  const overlay=document.getElementById('stinger-overlay');
  overlay.innerHTML='';
  if(S.stingerVideo&&S.stingerVideo.src){
    const v=S.stingerVideo.cloneNode();
    v.style.cssText='width:100%;height:100%;object-fit:cover;display:block;';
    v.muted=false; overlay.appendChild(v);
    overlay.style.display='block';
    v.play().catch(()=>{});
    v.onended=()=>{ overlay.style.display='none'; if(cb)cb(); };
    // Fallback timeout
    setTimeout(()=>{ overlay.style.display='none'; if(cb)cb(); },(v.duration||2)*1000+500);
  } else {
    // Default: white flash
    const flash=document.createElement('div');
    flash.className='stinger-flash';
    flash.style.cssText='position:absolute;inset:0;background:#fff;opacity:1;transition:opacity 200ms;';
    overlay.appendChild(flash); overlay.style.display='block';
    void flash.offsetHeight;
    setTimeout(()=>{
      flash.style.opacity='0';
      setTimeout(()=>{ overlay.style.display='none'; if(cb)cb(); },250);
    },150);
  }
}

// ─── REPLAY ──────────────────────────────────────────────────────────────────
function doMarkIn(){
  const v=getPgmVideo(); if(!v){rlog('No video in Output','err');return;}
  S.markIn=v.currentTime;
  document.getElementById('in-disp').textContent=fmtT(S.markIn);
  rlog('Mark In @ '+fmtT(S.markIn),'mark'); elog('MARK IN @ '+fmtT(S.markIn),'mark');
}
function doMarkOut(){
  const v=getPgmVideo(); if(!v){rlog('No video in Output','err');return;}
  S.markOut=v.currentTime;
  document.getElementById('out-disp').textContent=fmtT(S.markOut);
  rlog('Mark Out @ '+fmtT(S.markOut),'mark'); elog('MARK OUT @ '+fmtT(S.markOut),'mark');
}
function doReplayPlay(){
  const v=getPgmVideo(); if(!v){rlog('No video in Output','err');return;}
  if(S.markIn===null){rlog('Set Mark In first','err');return;}
  if(S.markOut===null){rlog('Set Mark Out first','err');return;}
  if(S.markOut<=S.markIn){rlog('Mark Out must be after Mark In','err');return;}
  stopReplayWatcher(v);
  setRStat('playing',`▶ PLAYING  ${fmtT(S.markIn)} → ${fmtT(S.markOut)}  @ ${S.speed}x`);
  // Play stinger in, then start replay
  playStinger(()=>{
    v.playbackRate=S.speed; v.currentTime=S.markIn;
    const onSeeked=()=>{
      v.play().catch(()=>{});
      v.removeEventListener('seeked',onSeeked);
      attachWatcher(v,false);
      showReplayBadge(true);
    };
    v.addEventListener('seeked',onSeeked);
  });
  rlog(`Play ${fmtT(S.markIn)}→${fmtT(S.markOut)} @ ${S.speed}x`,'go');
}
function doReplayLoop(){
  const v=getPgmVideo(); if(!v){rlog('No video in Output','err');return;}
  if(S.markIn===null||S.markOut===null){rlog('Set marks first','err');return;}
  if(S.markOut<=S.markIn){rlog('Mark Out must be after Mark In','err');return;}
  stopReplayWatcher(v);
  S.replayState='looping';
  setRStat('looping',`⟳ LOOPING  ${fmtT(S.markIn)} → ${fmtT(S.markOut)}  @ ${S.speed}x`);
  playStinger(()=>{
    v.playbackRate=S.speed; v.currentTime=S.markIn;
    const onSeeked=()=>{ v.play().catch(()=>{}); v.removeEventListener('seeked',onSeeked); attachWatcher(v,true); showReplayBadge(true); };
    v.addEventListener('seeked',onSeeked);
  });
  rlog(`Loop ${fmtT(S.markIn)}→${fmtT(S.markOut)} @ ${S.speed}x`,'go');
}
function attachWatcher(v,loop){
  if(S.replayEndHandler)v.removeEventListener('timeupdate',S.replayEndHandler);
  S.replayEndHandler=function(){
    if(v.currentTime>=S.markOut){
      if(loop&&S.replayState==='looping'){v.currentTime=S.markIn;}
      else{
        // Stinger out, then return to normal
        playStinger(()=>{
          v.pause(); v.playbackRate=1; v.play().catch(()=>{});
          S.replayState='idle'; setRStat('idle','IDLE — replay complete');
          showReplayBadge(false);
          rlog('Replay complete','go');
        });
        v.removeEventListener('timeupdate',S.replayEndHandler); S.replayEndHandler=null;
      }
    }
  };
  v.addEventListener('timeupdate',S.replayEndHandler);
}
function stopReplayWatcher(v){
  if(S.replayEndHandler&&v){v.removeEventListener('timeupdate',S.replayEndHandler);S.replayEndHandler=null;}
}
function doReplayStop(){
  const v=getPgmVideo();
  if(v){stopReplayWatcher(v);v.playbackRate=1;v.play().catch(()=>{});}
  S.replayState='idle'; setRStat('idle','IDLE'); showReplayBadge(false); rlog('Stopped');
}
function doReturnLive(){
  const v=getPgmVideo();
  if(v&&S.replayState!=='idle'){
    playStinger(()=>{
      doReplayStop(); elog('RETURN TO LIVE','go');
    });
  } else { doReplayStop(); elog('RETURN TO LIVE','go'); }
}
function showReplayBadge(show){
  const badge=document.getElementById('replay-badge');
  if(badge){badge.style.display=show?'flex':'none';document.getElementById('replay-badge-speed').textContent=S.speed+'x';}
}
function setSpeed(v){
  S.speed=v; document.getElementById('spd-disp').textContent=v+'x';
  document.querySelectorAll('.spd-btn').forEach(b=>b.classList.remove('active'));
  const m={0.25:0,0.5:1,1.0:2,2.0:3}; if(m[v]!==undefined)document.querySelectorAll('.spd-btn')[m[v]].classList.add('active');
  const vid=getPgmVideo(); if(vid&&S.replayState!=='idle')vid.playbackRate=v;
  elog('Replay speed → '+v+'x','speed');
}
function setRStat(state,msg){
  S.replayState=state;
  const bar=document.getElementById('replay-status-bar'); if(!bar)return;
  bar.textContent=msg; bar.className='replay-status-bar '+(state==='idle'?'':state);
}
function rlog(msg,type){
  const log=document.getElementById('replay-log'); if(!log)return;
  const div=document.createElement('div'); div.className='rl-entry';
  div.innerHTML=`<span class="rl-ts">${new Date().toTimeString().slice(0,8)} </span><span class="rl-msg ${type||''}">${msg}</span>`;
  log.appendChild(div); log.scrollTop=log.scrollHeight;
}

// ─── LOWER THIRDS ─────────────────────────────────────────────────────────────
function applyLT(which){
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
  if(which==='prv')S.prvLT=lt; else S.pgmLT=lt;
  elog('Lower third → '+which.toUpperCase()+': '+title);
}
function renderLTonMon(which,lt){
  const c=document.getElementById(which+'-lt'); if(!c)return;
  c.innerHTML=''; void c.offsetWidth;
  const d=document.createElement('div');
  d.className='lt-overlay '+(lt.pos||'bottom-left');
  d.style.animationDuration=S.ltFade+'ms';
  d.innerHTML=`<div class="lt-title-text" style="background:${lt.bg};color:${lt.fg};">${lt.title}</div>
    ${lt.sub?`<div class="lt-sub-text" style="color:${lt.fg};">${lt.sub}</div>`:''}`;
  c.appendChild(d);
}
function clearLT(){
  document.getElementById('prv-lt').innerHTML=''; document.getElementById('pgm-lt').innerHTML='';
  S.prvLT=null; S.pgmLT=null; elog('Lower thirds cleared');
}
function renderLTSavedList(){
  const list=document.getElementById('lt-saved-list'); if(!list)return;
  if(!S.lts.length){list.innerHTML='<span style="font-size:10px;color:#555;display:block;padding:4px;">No saved lower thirds.</span>';return;}
  list.innerHTML=S.lts.map((lt,i)=>`
    <div class="lt-si">
      <div class="lt-si-dot" style="background:${lt.bg};"></div>
      <span class="lt-si-name">${lt.title}${lt.sub?' — '+lt.sub:''}</span>
      <button class="lt-si-prv" onclick="applyLTSaved(${i},'prv')">PRV</button>
      <button class="lt-si-pgm" onclick="applyLTSaved(${i},'pgm')">PGM</button>
      <button class="lt-si-del" onclick="deleteLTSaved(${i})">✕</button>
    </div>`).join('');
}
function applyLTSaved(i,which){const lt=S.lts[i];renderLTonMon(which,lt);if(which==='prv')S.prvLT=lt;else S.pgmLT=lt;}
function deleteLTSaved(i){S.lts.splice(i,1);renderLTSavedList();}

// ─── CUSTOM OVERLAY ───────────────────────────────────────────────────────────
function liveUpdateCov(which){
  const d=S.covData[which];
  d.text=document.getElementById('cov-'+which+'-text').value;
  d.fg=document.getElementById('cov-'+which+'-fg').value;
  d.bg=document.getElementById('cov-'+which+'-bg').value;
  d.opacity=parseInt(document.getElementById('cov-'+which+'-opacity').value)||70;
  d.size=parseInt(document.getElementById('cov-'+which+'-size').value)||18;
  d.bold=document.getElementById('cov-'+which+'-bold').checked;
  document.getElementById('cov-'+which+'-size-v').textContent=d.size+'px';
  const el=document.getElementById(which+'-cov');
  if(el.style.display!=='none')applyCovStyle(which);
}
function applyCovStyle(which){
  const d=S.covData[which];
  const el=document.getElementById(which+'-cov'); if(!el)return;
  el.textContent=d.text||(which==='prv'?'Preview overlay':'Output overlay');
  el.style.color=d.fg;
  el.style.background=hexRgba(d.bg,d.opacity/100);
  el.style.fontSize=d.size+'px';
  el.style.fontWeight=d.bold?'700':'400';
  el.style.left=d.x+'%'; el.style.top=d.y+'%';
}
function showCov(which){liveUpdateCov(which);const el=document.getElementById(which+'-cov');el.style.display='block';applyCovStyle(which);elog('Overlay → '+which.toUpperCase());}
function hideCov(which){document.getElementById(which+'-cov').style.display='none';}
function hexRgba(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return`rgba(${r},${g},${b},${a})`;}
function switchOTab(which,btn){
  document.querySelectorAll('.otab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.ot-panel').forEach(p=>p.style.display='none');
  btn.classList.add('active'); document.getElementById('ot-'+which).style.display='flex';
}

// ─── DRAG OVERLAYS ────────────────────────────────────────────────────────────
function setupDragOverlays(){
  ['prv','pgm'].forEach(which=>{
    makeDraggable(which+'-cov',which+'-screen',which,'cov');
    makeDraggable(which+'-score',which+'-screen',which,'score');
  });
}
function makeDraggable(elId,containerId,which,type){
  const el=document.getElementById(elId); if(!el)return;
  let dragging=false,sx=0,sy=0,sl=0,st=0;
  el.addEventListener('mousedown',e=>{
    if(e.button!==0)return; e.preventDefault();
    dragging=true; sx=e.clientX; sy=e.clientY;
    const r=el.getBoundingClientRect(); sl=r.left; st=r.top;
  });
  document.addEventListener('mousemove',e=>{
    if(!dragging)return;
    const cr=document.getElementById(containerId).getBoundingClientRect();
    const xp=Math.max(0,Math.min(90,((sl+e.clientX-sx-cr.left)/cr.width)*100));
    const yp=Math.max(0,Math.min(90,((st+e.clientY-sy-cr.top)/cr.height)*100));
    el.style.left=xp+'%'; el.style.top=yp+'%';
    if(type==='cov'){S.covData[which].x=xp;S.covData[which].y=yp;}
  });
  document.addEventListener('mouseup',()=>dragging=false);
}

// ─── SCORE BAR ────────────────────────────────────────────────────────────────
function buildScoreBarHTML(d){
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
function renderScoreBars(){
  const d={...S.scoreData};
  const pos=document.getElementById('score-pos')?.value||'bottom'; S.scorePos=pos;
  ['prv','pgm'].forEach(which=>{
    const wrap=document.getElementById(which+'-score');
    wrap.innerHTML=buildScoreBarHTML(d);
    wrap.className='score-layer pos-'+pos;
  });
  // Update preview in modal
  const prev=document.getElementById('score-bar-preview');
  if(prev)prev.innerHTML=buildScoreBarHTML(d);
}
function showScore(which){
  renderScoreBars();
  if(which==='prv'||which==='both'){document.getElementById('prv-score').style.display='block';S.scorePrv=true;}
  if(which==='pgm'||which==='both'){document.getElementById('pgm-score').style.display='block';S.scorePgm=true;}
  elog('Score bar → '+(which==='both'?'PRV + PGM':which.toUpperCase()));
}
function hideScore(which){
  if(which==='all'||which==='prv'){document.getElementById('prv-score').style.display='none';S.scorePrv=false;}
  if(which==='all'||which==='pgm'){document.getElementById('pgm-score').style.display='none';S.scorePgm=false;}
}
function adjScore(team,delta,reset=false){
  if(reset){S.scoreData[team+'Score']=0;}
  else{S.scoreData[team+'Score']=Math.max(0,S.scoreData[team+'Score']+delta);}
  document.getElementById('score-'+team+'-val').textContent=S.scoreData[team+'Score'];
  manualScoreUpdate(); broadcastScore();
}
function manualScoreUpdate(){
  S.scoreData.home=document.getElementById('score-home-name')?.value||'HOME';
  S.scoreData.away=document.getElementById('score-away-name')?.value||'AWAY';
  S.scoreData.period=document.getElementById('score-period')?.value||'Q1';
  S.scoreData.homeCol=document.getElementById('score-home-col')?.value||'#cc0000';
  S.scoreData.awayCol=document.getElementById('score-away-col')?.value||'#0044cc';
  if(S.scorePrv||S.scorePgm)renderScoreBars();
  broadcastScore();
}
function setPeriod(p){
  const el=document.getElementById('score-period'); if(el)el.value=p;
  S.scoreData.period=p; manualScoreUpdate();
}
function openScoreController(){window.open('scores.html','_blank');}

let scoreChannel=null;
function setupScoreSync(){
  try{
    scoreChannel=new BroadcastChannel('livesim_scores');
    scoreChannel.onmessage=e=>{
      if(e.data.type==='score_update'){
        const d=e.data.data; S.scoreData={...S.scoreData,...d};
        // Sync modal fields
        const fields={home:'score-home-name',away:'score-away-name',period:'score-period',homeCol:'score-home-col',awayCol:'score-away-col'};
        Object.entries(fields).forEach(([k,id])=>{const el=document.getElementById(id);if(el)el.value=S.scoreData[k];});
        document.getElementById('score-home-val').textContent=S.scoreData.homeScore;
        document.getElementById('score-away-val').textContent=S.scoreData.awayScore;
        if(S.scorePrv||S.scorePgm)renderScoreBars();
      }
    };
  }catch(e){console.warn('BroadcastChannel not supported');}
}
function broadcastScore(){
  if(scoreChannel)scoreChannel.postMessage({type:'score_update',data:{...S.scoreData}});
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const customTransRows=[];
function addCustomTrans(){
  const fKey='F'+(6+customTransRows.length);
  if(6+customTransRows.length>12){alert('Max 7 slots (F6–F12)');return;}
  customTransRows.push({key:fKey,trans:'Fade',dur:1000});
  renderCTList();
}
function renderCTList(){
  document.getElementById('custom-trans-list').innerHTML=customTransRows.map((r,i)=>`
    <div class="custom-trans-row">
      <span class="ct-key">${r.key}</span>
      <select onchange="customTransRows[${i}].trans=this.value">
        ${['Cut','Fade','Wipe','Fly','Zoom'].map(t=>`<option${t===r.trans?' selected':''}>${t}</option>`).join('')}
      </select>
      <input type="number" value="${r.dur}" min="100" max="5000" step="100" style="width:70px;" onchange="customTransRows[${i}].dur=parseInt(this.value)">
      <span style="font-size:9px;color:var(--text3);">ms</span>
      <button onclick="customTransRows.splice(${i},1);renderCTList()">✕</button>
    </div>`).join('');
}
function saveConfig(){
  const dt=document.getElementById('cfg-trans').value;
  const dd=parseInt(document.getElementById('cfg-dur').value)||1000;
  const fd=parseInt(document.getElementById('cfg-ftb').value)||500;
  const lf=parseInt(document.getElementById('cfg-lt').value)??400;
  S.trans=dt; S.duration=dd; S.ftbDur=fd; S.ltFade=lf;
  document.getElementById('dur-slider').value=dd;
  document.getElementById('dur-val').textContent=(dd/1000).toFixed(1)+'s';
  const btn=document.querySelector(`.trans-btn[data-t="${dt}"]`);
  if(btn){document.querySelectorAll('.trans-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');}
  S.customTrans=customTransRows.map(r=>({...r}));
  closeModal('config-modal'); elog('Config saved','go');
}

// ─── LOG ─────────────────────────────────────────────────────────────────────
function elog(msg,type){
  S.logCount++;
}

// ─── MODALS ──────────────────────────────────────────────────────────────────
function openModal(id){
  document.getElementById(id).classList.add('open');
  if(id==='lt-modal')renderLTSavedList();
  if(id==='score-modal')renderScoreBars();
}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.addEventListener('click',e=>{if(e.target.classList.contains('modal-bg'))closeModal(e.target.id);});
function switchMTab(tab,btn){
  document.querySelectorAll('#add-input-tabs .mtab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.mf').forEach(f=>f.classList.remove('active'));
  btn.classList.add('active'); document.getElementById('mf-'+tab).classList.add('active');
}

// ─── KEYBOARD ────────────────────────────────────────────────────────────────
function setupKeyboard(){
  document.addEventListener('keydown',e=>{
    const tag=document.activeElement?.tagName;
    if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA')return;
    if(e.metaKey)return;
    const k=e.key;
    if(/^[1-9]$/.test(k)&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){
      e.preventDefault();const inp=S.inputs[parseInt(k)-1];if(inp)toPreview(inp.id);return;
    }
    if(/^[1-9]$/.test(k)&&e.ctrlKey){
      e.preventDefault();const inp=S.inputs[parseInt(k)-1];if(inp)toPgmDirect(inp.id);return;
    }
    const fMap={F1:'Cut',F2:'Fade',F3:'Wipe',F4:'Fly',F5:'Zoom'};
    if(fMap[k]){e.preventDefault();const btn=document.querySelector(`.trans-btn[data-t="${fMap[k]}"]`);if(btn)selTrans(btn);return;}
    const fNum=parseInt(k.replace('F',''));
    if(k.startsWith('F')&&!isNaN(fNum)&&fNum>=6&&fNum<=12&&!pgmLocked){
      e.preventDefault();
      const ct=S.customTrans[fNum-6];
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
