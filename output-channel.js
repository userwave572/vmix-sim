/**
 * output-channel.js — LiveSim Program Output Broadcaster
 * Include AFTER app.js in index.html:
 *   <script src="app.js"></script>
 *   <script src="output-channel.js"></script>
 *
 * Adds a BroadcastChannel that streams the current program output
 * state to output.html (open in another tab/window).
 */

(function () {
  let outCh = null;

  // ── INIT ──────────────────────────────────────────────────────────────────
  function init() {
    try {
      outCh = new BroadcastChannel('livesim_output');
      outCh.onmessage = e => {
        if (e.data.type === 'request_state') broadcastState();
      };
    } catch (e) {
      console.warn('[output-channel] BroadcastChannel not supported');
      return;
    }

    // Add "Output ↗" button to titlebar
    addOutputButton();

    // Hook into the app's switching functions by wrapping them.
    // We wait for DOMContentLoaded in case app.js hasn't fully run yet.
    document.addEventListener('DOMContentLoaded', hookFunctions, { once: true });
    // Also hook after a short delay in case app.js runs synchronously
    setTimeout(hookFunctions, 200);

    // Periodic sync: keep currentTime and state in sync
    setInterval(broadcastState, 600);
  }

  function addOutputButton() {
    // Add button to titlebar left group
    const tbarL = document.querySelector('.tbar-l');
    if (!tbarL) return;
    const btn = document.createElement('button');
    btn.className = 'tmenu';
    btn.textContent = '⬛ Output ↗';
    btn.title = 'Open program output in a new tab (fullscreen)';
    btn.onclick = () => window.open('output.html', '_blank');
    // Insert before the first divider or at the start
    const divider = tbarL.querySelector('.tbar-divider');
    if (divider) tbarL.insertBefore(btn, divider.nextSibling);
    else tbarL.appendChild(btn);
  }

  // ── HOOK INTO APP FUNCTIONS ────────────────────────────────────────────────
  // Wrap existing global functions so we broadcast after every PGM change.
  let hooked = false;
  function hookFunctions() {
    if (hooked) return;
    hooked = true;

    const wrap = (name, after) => {
      const orig = window[name];
      if (typeof orig !== 'function') return;
      window[name] = function (...args) {
        const result = orig.apply(this, args);
        // Broadcast after a short delay to let state settle
        setTimeout(after, 80);
        return result;
      };
    };

    wrap('toPgmDirect',  broadcastState);
    wrap('doTransition', broadcastState);
    wrap('doAuto',       broadcastState);
    wrap('doFTB',        broadcastState);
    wrap('doQuickPlay',  broadcastState);
    wrap('doReturnLive', broadcastState);
    wrap('doReplayPlay', broadcastState);
    wrap('doReplayLoop', broadcastState);
    wrap('doReplayStop', broadcastState);
    wrap('applyLT',      broadcastState);
    wrap('clearLT',      broadcastState);
    wrap('showScore',    broadcastState);
    wrap('hideScore',    broadcastState);
    wrap('showCov',      broadcastState);
    wrap('hideCov',      broadcastState);
    wrap('manualScore',  broadcastState);
    wrap('adjScore',     broadcastState);
    wrap('setPeriod',    broadcastState);

    // Also broadcast when fade transition fully completes (it's async)
    // We achieve this via the periodic setInterval above.
  }

  // ── BROADCAST STATE ───────────────────────────────────────────────────────
  function broadcastState() {
    if (!outCh) return;

    // Read from global S (defined in app.js)
    const S = window.S;
    if (!S) return;

    const inp = S.output ? S.inputs.find(i => i.id === S.output) : null;
    const vid = typeof window.getPgmVideo === 'function' ? window.getPgmVideo() : null;

    // Sanitise the input to only send what output.html needs
    let inpData = null;
    if (inp) {
      inpData = {
        type:        inp.type,
        name:        inp.name,
        src:         inp.src || null,   // blob URL — works cross-tab on hosted origins
        colType:     inp.colType || null,
        customColor: inp.customColor || null,
      };
    }

    // Custom overlay state
    const covEl = document.getElementById('pgm-cov');
    const covVisible = covEl && covEl.style.display !== 'none';

    // Score bar state
    const scoreEl = document.getElementById('pgm-score');
    const scoreVisible = scoreEl && scoreEl.style.display !== 'none';

    outCh.postMessage({
      type:         'pgm_state',
      inp:          inpData,
      currentTime:  vid ? vid.currentTime : null,
      duration:     vid ? vid.duration    : null,
      ftbOn:        S.ftbOn   || false,
      replayState:  S.replayState || 'idle',
      replaySpeed:  S.speed   || 1,
      pgmLT:        S.pgmLT   || null,
      ltFade:       S.ltFade  || 400,
      scoreData:    scoreVisible ? { ...S.scoreData } : null,
      scorePos:     S.scorePos || 'bottom',
      covData:      covVisible  ? { ...S.covData.pgm } : null,
    });
  }

  init();
})();
