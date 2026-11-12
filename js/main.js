'use strict';
// Input, camera, HUD and the main loop.
(() => {
  const cv = document.getElementById('gl'), hud = document.getElementById('hud'), hx = hud.getContext('2d');
  let VW = 480, VH = 300;
  function resize() {
    const asp = innerWidth / innerHeight;
    VW = Math.max(300, Math.min(660, Math.round(VH * asp / 2) * 2));
    cv.width = hud.width = VW; cv.height = hud.height = VH;
  }
  const DT = 1 / 120, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------- input (keyboard + any standard gamepad) ----------------
  const keys = {}, pressed = {}, I = { mx: 0, mz: 0 };
  let gpPrev = [], stickPrev = 0, rPrev = 0, lastKey = null;
  // button mapping: every action can be moved to another key or controller button (Controls menu). Movement stays on WASD / arrows / left stick.
  const DEF_K = { pass: 'KeyJ', thru: 'KeyH', lob: 'KeyK', shoot: 'KeyL', sprint: 'ShiftLeft', trick: 'Space', swap: 'KeyQ' }, DEF_P = { pass: 0, thru: 6, lob: 2, shoot: 1, sprint: 7, trick: 5, swap: 4 };
  const ACTS = [['pass', 'PASS / TACKLE'], ['thru', 'THROUGH PASS / GOALIE OUT'], ['lob', 'LOB / SLIDE / GOALIE DIVE'], ['shoot', 'SHOOT'], ['sprint', 'SPRINT'], ['trick', 'TRICK'], ['swap', 'SWITCH PLAYER']];
  const FIXED = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'KeyI'];
  const PADN = ['A', 'B', 'X', 'Y', 'LEFT BUMPER', 'RIGHT BUMPER', 'LEFT TRIGGER', 'RIGHT TRIGGER', 'BACK', 'START', 'LEFT STICK CLICK', 'RIGHT STICK CLICK'];
  const keyName = c => String(c).replace(/^Key|^Digit/, '').replace(/^Shift.*/, 'SHIFT').replace(/^Control.*/, 'CTRL').replace(/^Alt.*/, 'ALT').replace(/^Numpad/, 'NUM ').toUpperCase();
  const KN = a => keyName(save.keys[a]), PN = a => PADN[save.pad[a]] || 'BUTTON ' + save.pad[a];
  function setBind(map, act, v) { for (const o in map) if (map[o] === v) map[o] = map[act]; map[act] = v; }   // a key already in use swaps places
  addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Escape'].includes(e.code)) e.preventDefault();
    if (!e.repeat) { pressed[e.code] = true; lastKey = e.code; }
    keys[e.code] = true; Snd.init();
  });
  addEventListener('pointerdown', () => Snd.init());
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  // ---------------- touch (phones and tablets): a virtual stick under the left thumb, buttons under the right ----------------
  const tEls = {}; let drag = null;
  // button icons (drawn in the page's white line style). The play buttons change with what they do:
  // [0] with the ball, [1] defending, [2] in your own box as the goalie.
  const BALL = (x, y, r) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"/><circle cx="' + x + '" cy="' + y + '" r="' + r * 0.32 + '" fill="currentColor"/>';
  const BOOT = '<path d="M5 3v10l8 3c2.5.8 4 1.8 4 4.5H5z"/>', SLIDE = '<circle cx="5.5" cy="7" r="2.3"/><path d="M7 10l6 6h8M13 16l-4 3M2 21.5h20"/>';
  const GLOVE = '<path d="M7 21v-7l-2.5-3 1.6-1.6L9 12V5.5h2.3V10h1V4h2.4v6h1V5.5H18V15c0 3.5-2 6-5 6z"/>';
  const SW = '<path d="M20 7H4M8 3L4 7l4 4M4 17h16M16 13l4 4-4 4"/>';
  const ICON = {
    pass: [BALL(5, 15, 3.4) + '<path d="M11 15h10M17 11l4 4-4 4"/>', BOOT + BALL(20, 9, 2.6), BOOT + BALL(20, 9, 2.6)],                 // pass / tackle
    thru: [BALL(4.5, 15, 3.2) + '<path d="M10 9l6 6-6 6M15 9l6 6-6 6"/>', '<path d="M2 20V6h8v14"/><path d="M12 13h9M17 9l4 4-4 4"/>', '<path d="M2 20V6h8v14"/><path d="M12 13h9M17 9l4 4-4 4"/>'],   // through pass / goalie out
    shoot: ['<path d="M2 20V4h20v16M2 9h20M8 4v5M16 4v5"/>' + BALL(12, 15, 3.6), SLIDE, GLOVE],                                         // shoot / slide / dive
    trick: [BALL(12, 16, 4) + '<path d="M4 11a8 8 0 0 1 16 0M17 8l3 3 2-4"/>', '', ''],                                              // trick (nothing to do without the ball)
    swap: [BALL(4.5, 18, 3) + '<path d="M5 12C7 3 17 3 20 12M16.5 10.5L20 12l1.5-3.5"/>', SW, SW],                              // lob with the ball, switch player without it
    pause: '<path d="M8 5v14M16 5v14"/>',
    ok: '<path d="M4 12.5l5 5L20 6.5"/>',
    back: '<path d="M5 5l14 14M19 5L5 19"/>',
  };
  // a short word under each icon; it changes with the mode like the icon does
  const LBL = { pass: ['PASS', 'TACKLE', 'TACKLE'], thru: ['THRU', 'GK OUT', 'GK OUT'], shoot: ['SHOOT', 'SLIDE', 'DIVE'], trick: ['TRICK', '', ''], swap: ['LOB', 'SWAP', 'SWAP'], pause: '', ok: 'OK', back: 'BACK' };
  const svg = (a, m) => '<svg viewBox="0 0 24 24">' + (Array.isArray(ICON[a]) ? ICON[a][m] : ICON[a]) + '</svg>' + (LBL[a] && (Array.isArray(LBL[a]) ? LBL[a][m] : LBL[a]) ? '<b>' + (Array.isArray(LBL[a]) ? LBL[a][m] : LBL[a]) + '</b>' : '');
  let tMode = 0, lobFill = 0;
  function applyLayout() {                      // saved button positions (fractions of the screen) and size
    for (const a in tEls) {
      const el = tEls[a], p = save.layout[a], st = el.style, sc = 'scale(' + save.bsize + ')';
      if (p && el.classList.contains('g')) { st.left = p[0] * 100 + '%'; st.top = p[1] * 100 + '%'; st.right = st.bottom = 'auto'; st.transform = 'translate(-50%,-50%) ' + sc; }
      else { st.left = st.top = st.right = st.bottom = ''; st.transform = el.classList.contains('g') ? sc : ''; }
    }
  }
  let touch = false; const stick = { id: -1, ox: 0, oy: 0, x: 0, z: 0, prev: 0 };
  function touchUI() {
    if (touch) return; touch = true; if (!(save.mc >= 1)) { save.mc = 1; save.cam = 2; persist(); }   // phones start on the Close camera (once)
    const root = document.createElement('div'); root.id = 'touch';
    const zone = document.createElement('div'), base = document.createElement('div'), knob = document.createElement('div');
    zone.id = 'tzone'; base.id = 'tbase'; knob.id = 'tknob'; base.appendChild(knob); zone.appendChild(base); root.appendChild(zone);
    const R = () => innerHeight * 0.175, end = e => { if (e.pointerId !== stick.id) return; stick.id = -1; stick.x = stick.z = 0; base.style.left = base.style.top = base.style.opacity = knob.style.transform = ''; };
    zone.addEventListener('pointerdown', e => { if (stick.id >= 0) return; stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; base.style.opacity = 1; base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px'; knob.style.transform = ''; Snd.init(); });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== stick.id) return;
      let x = (e.clientX - stick.ox) / R(), z = (e.clientY - stick.oy) / R(); const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
      stick.x = Math.abs(x) < 0.15 ? 0 : x; stick.z = Math.abs(z) < 0.15 ? 0 : z; knob.style.transform = 'translate(' + x * R() + 'px,' + z * R() + 'px)';
    });
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    for (const [a, text, grp] of [['pass', 'PASS', 'g'], ['shoot', 'SHOOT', 'g'], ['thru', 'THRU', 'g'], ['trick', 'TRICK', 'g'], ['swap', 'LOB', 'g'], ['pause', 'II', 'g'], ['ok', 'OK', 'm'], ['back', 'BACK', 'm']]) {
      const el = document.createElement('div'); el.className = 'tb ' + grp; el.id = 't-' + a; el.innerHTML = svg(a, 0); el.setAttribute('aria-label', text); root.appendChild(el); tEls[a] = el;
      const up = () => { keys['T_' + a] = false; el.classList.remove('on'); if (drag === a) drag = null; };
      el.addEventListener('pointermove', e => { if (drag !== a) return; save.layout[a] = [clamp(e.clientX / innerWidth, 0.04, 0.96), clamp(e.clientY / innerHeight, 0.08, 0.92)]; applyLayout(); });
      el.addEventListener('pointerdown', e => { e.preventDefault(); if (state === 'layout' && grp === 'g') { drag = a; el.setPointerCapture(e.pointerId); return; } keys['T_' + a] = true; pressed['T_' + a] = true; el.classList.add('on'); Snd.init(); if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); });
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
    }
    document.body.appendChild(root); applyLayout();
  }
  addEventListener('touchstart', touchUI, { passive: true });
  function readInput() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null;
    const b = i => !!(gp && gp.buttons[i] && gp.buttons[i].pressed), ax = i => gp && Math.abs(gp.axes[i] || 0) > 0.2 ? gp.axes[i] : 0;
    let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + ax(0) + stick.x;
    let mz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + ax(1) + stick.z;
    const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    I.mx = mx; I.mz = mz;
    const kd = a => keys[save.keys[a]] || keys['T_' + a] || (save.keys[a] === 'ShiftLeft' && keys.ShiftRight), kp = a => pressed[save.keys[a]] || pressed['T_' + a], pb = a => b(save.pad[a]);
    const tm = Math.hypot(stick.x, stick.z);
    I.sprint = kd('sprint') || pb('sprint') || tm > 0.92;      // touch: push the stick all the way to sprint
    I.invert = pressed.KeyI;
    const e = i => b(i) && !gpPrev[i];
    I.ok = pressed.Enter || pressed.Space || (state !== 'play' && (pressed.KeyJ || e(0)));
    I.back = pressed.Escape || e(9) || (state !== 'play' && e(1));
    I.up = pressed.KeyW || pressed.ArrowUp || e(12); I.down = pressed.KeyS || pressed.ArrowDown || e(13);
    I.left = pressed.KeyA || pressed.ArrowLeft || e(14); I.right = pressed.KeyD || pressed.ArrowRight || e(15);
    if (pressed.T_ok) I.ok = true; if (pressed.T_back || pressed.T_pause) I.back = true;
    if (tm > 0.6 && stick.prev <= 0.6) { if (Math.abs(stick.z) > Math.abs(stick.x)) I[stick.z < 0 ? 'up' : 'down'] = true; else I[stick.x < 0 ? 'left' : 'right'] = true; }   // a stick flick moves through menus
    stick.prev = tm;
    I.keyNew = lastKey; lastKey = null; I.padNew = -1; for (let i = 0; i < 12; i++) if (e(i)) { I.padNew = i; break; }
    const onBall = me && Ball.owner === me;   // the touch swap button is the lob button while you have the ball
    if (pressed[save.keys.swap] || e(save.pad.swap) || (pressed.T_swap && !onBall)) I.swap = true;
    if (kp('trick') || e(save.pad.trick)) I.trickP = true;
    const kx = (pressed.KeyD || pressed.ArrowRight ? 1 : 0) - (pressed.KeyA || pressed.ArrowLeft ? 1 : 0), kz = (pressed.KeyS || pressed.ArrowDown ? 1 : 0) - (pressed.KeyW || pressed.ArrowUp ? 1 : 0);
    const sm = Math.hypot(ax(0), ax(1));
    if (kx || kz) I.tap = [kx, kz]; else if (sm > 0.7 && stickPrev < 0.4) I.tap = [ax(0) / sm, ax(1) / sm];   // a direction tap: a fresh key press or a stick flick
    stickPrev = sm;
    const rm = Math.hypot(ax(2), ax(3));        // right stick flick = a trick, no button needed
    if (rm > 0.7 && rPrev < 0.4) I.trickP = true;
    rPrev = rm;
    if (kp('thru') || e(save.pad.thru)) I.thru = true;
    I.thruHeld = kd('thru') || pb('thru');
    const held = { pass: kd('pass') || kp('pass') || pb('pass'), lob: kd('lob') || kp('lob') || pb('lob') || (onBall && (keys.T_swap || pressed.T_swap)),
      shoot: kd('shoot') || kp('shoot') || pb('shoot') };   // 'pressed' catches taps shorter than a frame
    for (const k in held) {                     // each kick button reports: just pressed, still held, just released
      if (held[k] && !I[k + 'Held']) I[k] = true;
      if (!held[k] && I[k + 'Held']) I[k + 'Rel'] = true;
      I[k + 'Held'] = held[k];
    }
    gpPrev = gp ? gp.buttons.map(x => x.pressed) : [];
  }
  const clearEdges = () => { for (const k in pressed) delete pressed[k]; };

  // ---------------- state ----------------
  let time = 0, invert = false;
  const players = [], score = [0, 0];
  for (const team of [0, 1]) ['gk', 'd1', 'd2', 'a1', 'a2'].forEach((role, i) => players.push(Player.make(team, role, team * 5 + i)));
  const roster = players.slice(), home = () => players.find(p => p.team === 0 && p.role === 'a1');
  function setSize(n) {                         // 5 a side with fixed keepers, or 4 / 3 a side with a floating goalie. Bigger sides get a bigger cage
    AI.size = n; AI.float = n < 5; players.length = 0;
    const roles = { 5: ['gk', 'd1', 'd2', 'a1', 'a2'], 4: ['gk', 'd1', 'a1', 'a2'], 3: ['gk', 'd1', 'a1'] }[n];
    for (const p of roster) if (roles.includes(p.role)) { p.px = undefined; players.push(p); }
    Arena.set({ 5: 1.2, 4: 1.1, 3: 1 }[n], save.court);
  }
  let me = players[3], demo = true, charge = 0, kind = '', goalT = 0, startT = 0, nextKick = 0, message = '', msgT = 0;
  const say = (t, d = 2) => { message = t; msgT = d; };
  // match: first to 5 goals, or whoever leads after 4 minutes; a tie goes to next-goal-wins overtime
  const GOALS = 5, LENGTH = 240;
  let state = 'title', attract = true, sel = 0, helpTab = 0, bindTab = 0, grab = false, helpFrom = 'title', retSel = 0, optFrom = 'title', clock = LENGTH, ot = false, ending = false, crowdT = 0, stats = { hypeGoals: 0, goals: {} };
  function newMatch() {
    score[0] = score[1] = 0; clock = LENGTH; ot = false; ending = false; stats = { hypeGoals: 0, goals: {} };
    Tricks.reset(); if (!attract) state = 'play'; msgT = 0; kickoff(0);
  }
  function fullTime() {
    if (attract) return newMatch();              // the match behind the menus just starts over
    state = 'over'; Snd.whistle(3); crowdT = 3;
    if (score[0] > score[1]) save.wins[save.crew]++;
    save.best = Math.max(save.best, Math.round(Tricks.best)); persist();
  }
  // saved between sessions: wins per crew, best combo, and the last match settings
  const save = { wins: [0, 0, 0], best: 0, crew: 0, opp: 1, diff: 2, size: 5, court: 1, cam: 0, bsize: 1, layout: {}, keys: {}, pad: {} }, CAMS = [['BROADCAST', 11, 18.5], ['HIGH', 17, 13.5], ['CLOSE', 7.5, 15]], DIFF = ['AVACA', 'SUAVE', 'TRANQUI', 'PONTE PILAS', 'JODIDO'], SKILL = [0.63, 0.7, 0.77, 0.835, 0.9];   // old Easy/Normal/Hard range spread over five levels
  try { Object.assign(save, JSON.parse(localStorage.getItem('futbol1bit') || '{}')); } catch (e) { /* storage unavailable */ }
  save.keys = Object.assign({}, DEF_K, save.keys); save.pad = Object.assign({}, DEF_P, save.pad); save.court = (save.court | 0) % Arena.VENUES.length; if (!(save.v >= 2)) save.diff = 2; if (!(save.v >= 3)) { save.v = 3; save.court = 1; } if (!(save.lv >= 1)) { save.lv = 1; save.layout = {}; save.bsize = 1; }   // new default button layout (thumb arc): clear old saved positions once   // one-time resets when the defaults changed save.diff = clamp(save.diff | 0, 0, 4); if (![3, 4, 5].includes(save.size)) save.size = 5;
  save.cam = (save.cam | 0) % 3; save.bsize = +save.bsize || 1; save.layout = save.layout || {};
  const persist = () => { try { localStorage.setItem('futbol1bit', JSON.stringify(save)); } catch (e) { /* ignore */ } };
  persist();                                    // keep the one-time resets above
  function startMatch() {
    attract = false; demo = false; AI.crew = [AI.CREWS[save.crew], AI.CREWS[save.opp]]; AI.skill = SKILL[save.diff]; setSize(save.size);
    for (const p of players) if (p.team) p.pace = 1 - (1 - AI.skill) * 0.5;
    persist(); newMatch();
  }
  function toTitle() { attract = true; demo = true; state = 'title'; sel = 0; AI.skill = 1; setSize(5); newMatch(); }
  function menus() {
    const nav = n => { if (I.up) { sel = (sel + n - 1) % n; Snd.menu(); } if (I.down) { sel = (sel + 1) % n; Snd.menu(); } };
    const go = (to, from, back) => { state = to; helpFrom = from; retSel = back; sel = 0; };   // open a sub-menu, remember where BACK returns to
    const ret = () => { state = helpFrom; sel = retSel; if (state === 'options') helpFrom = optFrom, retSel = optFrom === 'title' ? 2 : 3; };
    if (state === 'title') { nav(3); if (I.ok) { Snd.menu(600); if (sel === 0) { state = 'setup'; sel = 4; } else if (sel === 1) go('help', 'title', 1); else { optFrom = 'title'; go('options', 'title', 2); } } }
    else if (state === 'options') {             // camera + controls, shared by the title and pause menus
      nav(3); const d = (I.right ? 1 : 0) - (I.left ? 1 : 0);
      if (d && sel === 0) { save.cam = (save.cam + d + 3) % 3; persist(); Snd.menu(); }
      if (I.back) { Snd.menu(); ret(); }
      else if (I.ok) { Snd.menu(600); if (sel === 0) { save.cam = (save.cam + 1) % 3; persist(); } else if (sel === 1) go(touch ? 'layout' : 'binds', 'options', 1); else ret(); }
    }
    else if (state === 'layout') {              // touch: drag the buttons, stick left / right for size
      const d = (I.right ? 1 : 0) - (I.left ? 1 : 0);
      if (d) { save.bsize = clamp(Math.round((save.bsize + d * 0.1) * 10) / 10, 0.7, 1.4); applyLayout(); }
      if (I.back) { save.layout = {}; save.bsize = 1; applyLayout(); Snd.menu(); }
      else if (I.ok) { persist(); Snd.menu(600); ret(); }
    }
    else if (state === 'binds') {
      if (grab) {                               // waiting for the new key or button
        if (I.keyNew === 'Escape') grab = false;
        else if (!bindTab && I.keyNew && !FIXED.includes(I.keyNew)) { setBind(save.keys, ACTS[sel][0], I.keyNew); grab = false; }
        else if (bindTab && I.padNew >= 0 && I.padNew !== 9) { setBind(save.pad, ACTS[sel][0], I.padNew); grab = false; }
        if (!grab) { persist(); Snd.menu(600); }
      } else {
        nav(ACTS.length + 1); if (I.left || I.right) { bindTab = 1 - bindTab; Snd.menu(); }
        if (I.back) ret();
        else if (I.ok) { Snd.menu(600); if (sel === ACTS.length) { if (bindTab) save.pad = Object.assign({}, DEF_P); else save.keys = Object.assign({}, DEF_K); persist(); } else grab = true; }
      }
    }
    else if (state === 'setup') {
      nav(5); const d = (I.right ? 1 : 0) - (I.left ? 1 : 0);   // rows: match, court, difficulty, crews >, start
      if (d) { Snd.menu(); if (sel === 0) save.size = 3 + (save.size - 3 + d + 3) % 3; if (sel === 2) save.diff = clamp(save.diff + d, 0, 4);
        if (sel === 1) { save.court = (save.court + d + Arena.VENUES.length) % Arena.VENUES.length; Arena.set(Arena.scale, save.court); } }   // the new court shows behind the menu straight away
      if (I.back) { state = 'title'; sel = 0; } else if (I.ok) { Snd.menu(600); if (sel === 4) startMatch(); else if (sel === 3) { state = 'crews'; sel = 0; } else sel++; }
    }
    else if (state === 'crews') {               // sub-menu: your crew and the opponent
      nav(3); const d = (I.right ? 1 : 0) - (I.left ? 1 : 0);
      if (d) { Snd.menu(); if (sel === 0) save.crew = (save.crew + d + 3) % 3; if (sel === 1) save.opp = (save.opp + d + 3) % 3; }
      if (I.back || (I.ok && sel === 2)) { Snd.menu(600); state = 'setup'; sel = 3; } else if (I.ok) { Snd.menu(600); sel++; }
    }
    else if (state === 'help') { if (I.left || I.right) { helpTab = 1 - helpTab; Snd.menu(); } if (I.ok || I.back) ret(); }
    else if (state === 'pause') {
      nav(5);
      if (I.back) state = 'play';
      else if (I.ok) { Snd.menu(600); if (sel === 0) state = 'play'; else if (sel === 1) newMatch(); else if (sel === 2) go('help', 'pause', 2); else if (sel === 3) { optFrom = 'pause'; go('options', 'pause', 3); } else toTitle(); }
    }
    else if (state === 'over') { if (I.ok) startMatch(); else if (I.back) toTitle(); }
    else if (I.back) { state = 'pause'; sel = 0; }
  }
  function kickoff(team) {                      // everyone back to their own half; `team` starts with the ball
    Ball.reset(0, 0);
    for (const p of players) {
      const dir = p.team ? -1 : 1, s = AI.spot(p.role, true);
      Object.assign(p, { x: s[0] * dir, z: s[1] * dir, vx: 0, vz: 0, yaw: dir * Math.PI / 2, downT: 0, slideT: 0, diveT: 0, fakeT: 0, keepT: 0, kickT: 0, holdT: 0, thinkT: 0.4, stamina: 1 });
      if (p.team === team && p.role === 'a1') { p.x = -0.75 * dir; p.z = 0; Ball.owner = p; }
    }
    me = home(); charge = 0; kind = ''; startT = 1; clearKicks(); I.swap = false; Snd.whistle();
  }
  function clearKicks() { for (const k of ['pass', 'lob', 'shoot']) I[k] = I[k + 'Rel'] = false; I.tap = null; I.trickP = false; I.thru = false; }
  const facing = (p, q, reach) => Math.hypot(q.x - p.x, q.z - p.z) < reach;

  // the controlled player's kicks. Aim is the stick if held, else the way the player faces.
  function kicks(dt) {
    const has = Ball.owner === me, held = Math.hypot(I.mx, I.mz) > 0.3, own = Ball.owner;
    if (me.downT > 0 || me.slideT > 0) { charge = 0; kind = ''; clearKicks(); return; }
    me.tackleCD = (me.tackleCD || 0) - dt;
    let dx = Math.sin(me.yaw), dz = Math.cos(me.yaw);
    if (held) { const l = Math.hypot(I.mx, I.mz); dx = I.mx / l; dz = I.mz / l; }
    if (has && I.trickP) Tricks.random(me);                  // one trick button: a different trick every press
    // passes are a single tap (weighted to the teammate you aim at); only the shot is hold-to-charge
    // keyboard / controller: pass and through pass are a single tap; lob and shot are hold-to-charge.
    if (has && !kind && (I.pass || I.thru)) {
      if (I.thru) { if (!AI.through(me, -99, [dx, dz])) Ball.kick(me, dx, dz, 12, 0); }   // into space ahead of the teammate you aim at
      else if (!AI.pass(me, -99, [dx, dz])) Ball.kick(me, dx, dz, 13, 0);
      me.kickT = Player.KICK; me.yaw = Math.atan2(dx, dz); clearKicks(); return;
    }
    if (has && !kind) for (const k of ['shoot', 'lob']) if (I[k]) { kind = k; charge = 0; break; }
    if (!has || (kind && !I[kind + 'Held'] && !I[kind + 'Rel'])) { kind = ''; charge = 0; }
    if (kind && I[kind + 'Held']) charge = Math.min(1, charge + dt / 0.7);
    if (kind && I[kind + 'Rel']) {
      const c = charge, k = kind; kind = ''; charge = 0;
      if (k === 'shoot') {
        // the shot goes where you aim. If that is roughly at the goal it is pulled just inside the posts,
        // so aiming diagonally picks a corner and running straight keeps your line.
        const gx = Arena.HL - me.x;
        if (dx > 0.35 && gx > 0.5) { const gz = clamp(me.z + dz / dx * gx, -1.25, 1.25) - me.z, gl = Math.hypot(gx, gz); dx = gx / gl; dz = gz / gl; }
        if (Tricks.hype[0] >= 100) Tricks.shot(me, dx, dz);   // a full Hype meter turns the next shot into a Hype Shot
        else Ball.kick(me, dx, dz, 15 + 10 * c, 1.5 + 6 * c);   // more power also lifts the shot: a full bar rises to crossbar height
      } else Ball.kick(me, dx, dz, 5.5 + 8.5 * c, 5 + 4 * c);                                                   // lob: the longer the hold, the further and higher
      me.kickT = Player.KICK; me.yaw = Math.atan2(dx, dz);
    }
    else if (!has && I.pass && me.tackleCD <= 0) {             // standing tackle: poke the ball off a carrier in reach
      me.tackleCD = 0.5; me.kickT = Player.KICK;
      if (own && own.team !== me.team && !(own.trickT > 0) && !(own.keepT < 4 && Player.keeping(own)) && facing(me, Ball, 1.5) && Math.random() < 0.6 * AI.crew[0].tackle) { Ball.owner = me; Ball.passTo = null; Ball.jug = false; Tricks.tackled(0); }
    } else if (!has && (I.lob || (touch && I.shoot)) && Player.keeping(me)) Player.dive(me, dx, dz);   // in your own box you are the goalie: dive instead of sliding
    else if (!has && (I.lob || (touch && I.shoot))) {                                  // slide tackle: wins it more often, but you end up on the ground
      me.slideT = 0.45; me.yaw = Math.atan2(dx, dz); me.vx = dx * 9.5; me.vz = dz * 9.5;
    }
    clearKicks();
  }

  // ---------------- camera: raised side-on broadcast view ----------------
  const cam = { x: 0, z: 0, eye: [0, 12, 21] };
  function camera(dt) {
    const k = 1 - Math.exp(-dt * 3);
    const f = me || Ball; let fx = Ball.x * 0.8 + f.x * 0.2, fz = Ball.z * 0.8 + f.z * 0.2;
    if (attract) { fx = Math.sin(time * 0.12) * 12; fz = -4; }   // slow pan behind the menus
    const sc = Arena.scale, q = 1 + (sc - 1) * 0.5;                // bigger cages: pull back a little and follow further
    cam.x += (clamp(fx * 0.85, -11 * sc, 11 * sc) - cam.x) * k; cam.z += (clamp(fz, -Arena.HW, Arena.HW) * (0.4 + (sc - 1) * 0.6) - cam.z) * k;
    const cm = CAMS[save.cam] || CAMS[0];
    cam.eye = [cam.x, cm[1] * q, cam.z + cm[2] * q];
    return M.mul(M.persp(0.6, VW / VH, 1, 5200), M.look(cam.eye, [cam.x, 0.6, cam.z - 0.5]));
  }

  // ---------------- HUD ----------------
  let BK = '#000', WH = '#fff';
  function dark(fn) {                           // menus: white on a black background
    [BK, WH] = [WH, BK]; hx.fillStyle = BK; hx.save();
    fn(); hx.restore(); [BK, WH] = [WH, BK]; hx.fillStyle = BK;
  }
  function layoutScreen() {
    const w = 250, x = Math.round((VW - w) / 2), y = 70;
    panel(x, y, w, 62); hx.fillRect(x, y, w, 15); hx.fillStyle = WH; centre('BUTTON LAYOUT', y + 4); hx.fillStyle = BK;
    centre('DRAG EACH BUTTON WHERE YOU WANT IT', y + 21); centre('STICK LEFT / RIGHT: SIZE ' + Math.round(save.bsize * 100) + '%', y + 33); centre('OK SAVE      BACK RESET', y + 47);
  }   // menus: white on a black background
  function panel(x, y, w, h) { hx.fillStyle = BK; hx.fillRect(x, y, w, h); hx.fillStyle = WH; hx.fillRect(x + 1, y + 1, w - 2, h - 2); hx.fillStyle = BK; }
  function label(s, x, y, align = 0, sc = 1) {  // align: 0 left, 1 centre, 2 right
    const w = FONT.width(s, sc) + 6, h = 7 * sc + 6; x = Math.round(align === 1 ? x - w / 2 : align === 2 ? x - w : x);
    panel(x, y, w, h); FONT.draw(hx, s, x + 3, y + 3, sc); return w;
  }
  const scoreLine = () => AI.crew[0].short + ' ' + score[0] + ' - ' + score[1] + ' ' + AI.crew[1].short;
  const centre = (s, y, sc = 1) => FONT.draw(hx, s, Math.round((VW - FONT.width(s, sc)) / 2), y, sc);
  function badge(crew, x, y, sc) { crew.badge.forEach((r, j) => { for (let i = 0; i < 9; i++) if (r[i] === '1') hx.fillRect(x + i * sc, y + j * sc, sc, sc); }); }
  const HINT = () => touch ? 'STICK PICK   OK SELECT   X BACK' : 'W/S PICK   ENTER SELECT   ESC BACK', HINTV = () => touch ? 'STICK PICK   LEFT/RIGHT CHANGE   OK SELECT' : 'W/S PICK   A/D CHANGE   ENTER SELECT   ESC BACK';
  function menuBox(title, rows, y, w = 170, hint = '', note = '') {   // a titled list, selected row inverted
    // row: 'TEXT' (centred action), ['LABEL', 'VALUE'] (changes with left/right), ['LABEL', '>'] (opens a sub-menu), '' (gap)
    w = Math.max(w, FONT.width(hint) + 24, FONT.width(note) + 24);
    const x = Math.round((VW - w) / 2), gaps = rows.filter(r => r === '').length, h = (rows.length - gaps) * 13 + gaps * 6 + 24 + (note ? 14 : 0) + (hint ? 14 : 0);
    panel(x, y, w, h); hx.fillRect(x, y, w, 15); hx.fillStyle = WH; centre(title, y + 4); hx.fillStyle = BK;
    let ry = y + 21, i = 0;
    for (const r of rows) {
      if (r === '') { ry += 6; continue; }
      const on = i === sel; if (on) { hx.fillRect(x + 3, ry - 3, w - 6, 13); hx.fillStyle = WH; }
      if (typeof r === 'string') centre(r, ry);
      else { FONT.draw(hx, r[0], x + 10, ry); const v = r[1] === '>' ? '>' : on ? '< ' + r[1] + ' >' : r[1]; FONT.draw(hx, v, x + w - 10 - FONT.width(v), ry); }
      hx.fillStyle = BK; ry += 13; i++;
    }
    if (note) { centre(note, ry + 4); ry += 14; }
    if (hint) { hx.fillRect(x + 8, ry + 2, w - 16, 1); centre(hint, ry + 7); }
  }
  function optionsMenu(y) { menuBox('OPTIONS', [['CAMERA', CAMS[save.cam][0]], [touch ? 'BUTTON LAYOUT' : 'CONTROLS', '>'], '', 'BACK'], y, 200, HINT()); }
  function tabs(on, ty) {                       // KEYBOARD / CONTROLLER tabs, A/D or left/right to switch
    ['KEYBOARD', 'CONTROLLER'].forEach((t, i) => {
      const tw = 90, tx = VW / 2 + (i ? 4 : -tw - 4);
      panel(tx, ty, tw, 13); if (i === on) { hx.fillRect(tx, ty, tw, 13); hx.fillStyle = WH; }
      FONT.draw(hx, t, Math.round(tx + (tw - FONT.width(t)) / 2), ty + 3); hx.fillStyle = BK;
    });
  }
  function bindScreen() {                       // button mapping for the keyboard and the controller
    const w = 300, x = Math.round((VW - w) / 2), y = 40, N = bindTab ? PN : KN;
    panel(x, y, w, 196); hx.fillRect(x, y, w, 15); hx.fillStyle = WH; centre('CONTROLS', y + 4); hx.fillStyle = BK;
    tabs(bindTab, y + 19);
    for (let i = 0; i <= ACTS.length; i++) {
      const ry = y + 42 + i * 13;
      if (i === sel) { hx.fillStyle = BK; hx.fillRect(x + 3, ry - 3, w - 6, 13); hx.fillStyle = WH; }
      if (i === ACTS.length) centre('RESET ' + (bindTab ? 'CONTROLLER' : 'KEYBOARD') + ' TO DEFAULTS', ry);
      else { const v = grab && i === sel ? (Math.floor(time * 3) % 2 ? (bindTab ? 'PRESS A BUTTON' : 'PRESS A KEY') : '') : N(ACTS[i][0]); FONT.draw(hx, ACTS[i][1], x + 12, ry); FONT.draw(hx, v, x + w - 12 - FONT.width(v), ry); }
      hx.fillStyle = BK;
    }
    centre(grab ? 'ESC CANCEL' : 'W/S PICK   A/D TAB   ENTER CHANGE   ESC BACK', y + 164);
    centre(bindTab ? 'MOVE: LEFT STICK    TRICKS: ALSO RIGHT STICK' : 'MOVE: WASD OR ARROWS', y + 178);
  }
  function helpScreen() {
    const f = (k, t) => (k + '                ').slice(0, Math.max(16, k.length + 2)) + t;
    const mk = (N, pad) => ['#WITH THE BALL', f(pad ? 'LEFT STICK' : 'WASD / ARROWS', 'MOVE    ' + N('sprint') + ' SPRINT'), f(N('pass'), 'PASS TO THE TEAMMATE YOU AIM AT'), f(N('thru'), 'THROUGH PASS INTO SPACE FOR A RUNNER'), f(N('lob'), 'LOB: HOLD FOR MORE DISTANCE AND HEIGHT'),
      f(N('shoot'), 'SHOOT: HOLD FOR MORE POWER AND HEIGHT'), f(N('trick'), 'TRICK. PRESS AGAIN AS IT DROPS TO JUGGLE'),
      '#WITHOUT THE BALL', f(N('pass'), 'TACKLE'), f(N('lob'), 'SLIDE.  IN YOUR OWN BOX: GOALIE DIVE'), f(N('swap'), 'SWITCH PLAYER'), f('HOLD ' + N('thru'), 'YOUR GOALIE COMES OUT TO THE BALL'),
      '#HYPE AND RULES', 'TRICKS FILL THE HYPE METER. FULL METER: NEXT SHOT IS A', 'HYPE SHOT, VERY HARD TO SAVE AND WORTH 2 GOALS.', 'FIRST TO 5 GOALS, OR AHEAD AFTER 4 MINUTES.',
      pad ? 'START PAUSES.  CHANGE BUTTONS IN OPTIONS > CONTROLS.' : 'ESC PAUSES, I INVERTS COLOURS.  CHANGE KEYS IN OPTIONS.'];
    const KEYS = mk(KN, 0), PAD = mk(PN, 1);
    const TOUCH = ['#WITH THE BALL', f('LEFT THUMB', 'MOVE. PUSH ALL THE WAY TO SPRINT'), f('PASS', 'PASS TO THE TEAMMATE YOU AIM AT'), f('LOB', 'HOLD: HIGHER AND FURTHER THE LONGER YOU HOLD'), f('THRU', 'THROUGH PASS INTO SPACE FOR A RUNNER'), f('SHOOT', 'HOLD FOR MORE POWER AND HEIGHT'), f('TRICK', 'PRESS AGAIN AS THE BALL DROPS TO JUGGLE'),
      '#WITHOUT THE BALL', f('PASS', 'TACKLE'), f('SHOOT', 'SLIDE.  IN YOUR OWN BOX: GOALIE DIVE'), f('SWAP', 'SWITCH PLAYER (SAME BUTTON AS LOB)'), f('HOLD THRU', 'YOUR GOALIE COMES OUT TO THE BALL'),
      '#HYPE AND RULES', 'TRICKS FILL THE HYPE METER. FULL METER: NEXT SHOT IS A', 'HYPE SHOT, VERY HARD TO SAVE AND WORTH 2 GOALS.', 'FIRST TO 5 GOALS, OR AHEAD AFTER 4 MINUTES.'];
    const L = touch ? TOUCH : helpTab ? PAD : KEYS, w = 372, x = Math.round((VW - w) / 2), top = touch ? 21 : 39, H = L.length * 10 + top + 26, y = Math.max(4, Math.round((VH - H) / 2)); panel(x, y, w, H);
    hx.fillRect(x, y, w, 15); hx.fillStyle = WH; centre('HOW TO PLAY', y + 4); hx.fillStyle = BK;
    if (!touch) tabs(helpTab, y + 19);
    L.forEach((s, i) => { const ly = y + top + i * 10; if (s[0] === '#') { hx.fillRect(x + 6, ly - 2, w - 12, 10); hx.fillStyle = WH; FONT.draw(hx, s.slice(1), x + 9, ly); hx.fillStyle = BK; } else FONT.draw(hx, s, x + 9, ly); });
    hx.fillRect(x + 8, y + H - 15, w - 16, 1); centre(touch ? 'OK OR X TO RETURN' : 'A/D SWITCH TAB    ENTER OR ESC BACK', y + H - 10);
  }
  function frontMenus() {
    if (state === 'help') return helpScreen();
    if (state === 'binds') return bindScreen();
    if (state === 'layout') return layoutScreen();
    if (state === 'options') return optionsMenu(120);
    if (state === 'title') {
      const w = FONT.width('FOOTY', 6) + 28, x = Math.round((VW - w) / 2);
      panel(x, 40, w, 70); centre('FOOTY', 48, 6); centre('1-BIT STREET SOCCER', 96);
      menuBox('MENU', ['QUICK MATCH', 'HOW TO PLAY', 'OPTIONS'], 122, 170);
      label('WINS ' + save.wins.reduce((a, b) => a + b, 0) + '    BEST COMBO ' + save.best, VW / 2, 194, 1);
      label(touch ? 'STICK PICK   OK SELECT' : 'W/S PICK   ENTER SELECT', VW / 2, VH - 36, 1);
      return;
    }
    const c = AI.CREWS[save.crew], o = AI.CREWS[save.opp];
    if (state === 'crews') {                    // crews sub-menu
      const w = 300, x = Math.round((VW - w) / 2), y = 50;
      panel(x, y, w, 196); hx.fillRect(x, y, w, 15); hx.fillStyle = WH; centre('CREWS', y + 4); hx.fillStyle = BK;
      const row = (i, ry, text) => { if (i === sel) { hx.fillRect(x + 3, ry - 3, w - 6, 13); hx.fillStyle = WH; } centre(text, ry); hx.fillStyle = BK; };
      row(0, y + 22, 'YOUR CREW   ' + (sel === 0 ? '< ' + c.name + ' >' : c.name)); badge(c, x + 14, y + 38, 3); FONT.draw(hx, c.style, x + 50, y + 40); FONT.draw(hx, c.blurb, x + 50, y + 50); FONT.draw(hx, 'WINS ' + save.wins[save.crew] + '   KIT: WHITE, BLACK ' + c.kitName, x + 50, y + 60);
      row(1, y + 82, 'OPPONENT   ' + (sel === 1 ? '< ' + o.name + ' >' : o.name)); badge(o, x + 14, y + 98, 3); FONT.draw(hx, o.style, x + 50, y + 100); FONT.draw(hx, o.blurb, x + 50, y + 110); FONT.draw(hx, 'KIT: BLACK, WHITE ' + o.kitName, x + 50, y + 120);
      row(2, y + 146, 'DONE');
      hx.fillRect(x + 8, y + 167, w - 16, 1); centre(HINTV(), y + 174);
      return;
    }
    const MATCH = { 3: ['3 V 3', 'FLOATING GOALIE, SMALL COURT'], 4: ['4 V 4', 'FLOATING GOALIE, BIGGER COURT'], 5: ['5 V 5', 'FIXED KEEPERS, BIGGEST COURT'] }[save.size];
    const NOTE = [MATCH[1], [1, 4, 5, 6].includes(save.court) ? 'PLAYED UNDER THE LIGHTS' : 'PLAYED IN DAYLIGHT', 'HOW GOOD THE OTHER CREW PLAYS', c.short + ' VS ' + o.short + '.  OK TO CHANGE', 'FIRST TO 5, OR AHEAD AFTER 4 MIN'][sel];
    menuBox('QUICK MATCH', [['MATCH', MATCH[0]], ['COURT', Arena.VENUES[save.court]], ['DIFFICULTY', DIFF[save.diff]], ['CREWS', '>'], '', 'START MATCH'], 70, 300, HINTV(), NOTE);
  }
  function resultScreen() {
    const w = 250, h = 128, x = Math.round((VW - w) / 2), y = 70, win = score[0] > score[1];
    const line = (s, yy, sc = 1) => FONT.draw(hx, s, Math.round((VW - FONT.width(s, sc)) / 2), yy, sc);
    panel(x, y, w, h); hx.fillRect(x, y, w, 15); hx.fillStyle = WH; line('FULL TIME', y + 4); hx.fillStyle = BK;
    line(win ? 'YOU WIN' : 'YOU LOSE', y + 22, 3);
    line(scoreLine(), y + 50, 2);
    let top = null; for (const id in stats.goals) if (!top || stats.goals[id] > stats.goals[top]) top = id;
    line('BEST TRICK COMBO  ' + Math.round(Tricks.best), y + 74);
    line('HYPE SHOTS SCORED  ' + stats.hypeGoals, y + 85);
    if (top !== null) line('PLAYER OF THE MATCH  ' + AI.crew[top < 5 ? 0 : 1].short + ' NO.' + (top % 5 + 1) + '  ' + stats.goals[top] + (stats.goals[top] > 1 ? ' GOALS' : ' GOAL'), y + 96);
    if (Math.floor(time * 2) % 2) line(touch ? 'OK REMATCH    BACK TITLE' : 'ENTER REMATCH    ESC TITLE', y + 113);
  }
  function drawHud() {
    hx.clearRect(0, 0, VW, VH); hx.imageSmoothingEnabled = false;
    if (attract) return dark(frontMenus);
    label(scoreLine(), VW / 2, 4, 1);
    const sec = Math.ceil(clock); label(ot ? 'OVERTIME' : Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'), VW / 2, 19, 1);
    if (state === 'over') return dark(resultScreen);
    if (state === 'pause') return dark(() => menuBox('PAUSED', ['RESUME', 'RESTART MATCH', '', 'HOW TO PLAY', 'OPTIONS', '', 'QUIT TO TITLE'], 80, 170, HINT()));
    if (state === 'options') return dark(() => optionsMenu(90));
    if (state === 'help') return dark(helpScreen);
    if (state === 'binds') return dark(bindScreen);
    if (state === 'layout') return dark(layoutScreen);
    if (!touch) label(Ball.owner === me ? KN('pass') + ' PASS  ' + KN('thru') + ' THROUGH  ' + KN('lob') + ' LOB  ' + KN('shoot') + ' SHOOT (HOLD)   ' + KN('trick') + ' TRICK' : me && Player.keeping(me) ? 'IN GOAL:  ' + KN('lob') + ' DIVE   ' + KN('pass') + ' TACKLE   ' + KN('swap') + ' SWITCH PLAYER' : KN('pass') + ' TACKLE   ' + KN('lob') + ' SLIDE   ' + KN('swap') + ' SWITCH PLAYER', VW / 2, VH - 17, 1);
    if (msgT > 0) label(message, VW / 2, 60, 1, 3);
    for (const t of [0, 1]) {                   // Hype meters: home on the left, away on the right
      const x = t ? VW - 70 : 4, h = Tricks.hype[t], full = h >= 100;
      panel(x, 4, 66, 13); if (!full || Math.floor(time * 6) % 2) hx.fillRect(x + 2, 6, Math.round(62 * h / 100), 9);
      hx.globalCompositeOperation = 'difference'; hx.fillStyle = WH; FONT.draw(hx, 'HYPE', x + 21, 7); hx.globalCompositeOperation = 'source-over';
    }
    if (Tricks.hype[0] >= 100) label('HYPE SHOT READY: SHOOT', 4, 20);
    const c = Tricks.combo;
    if (c.n) { label(c.names.slice(-3).join(' + '), VW / 2, VH - 62, 1); label('+' + Math.round(c.total) + (c.n > 1 ? '  X' + c.n : ''), VW / 2, VH - 48, 1); }
    if (Tricks.flashT > 0) label(Tricks.flash, VW / 2, 92, 1, 2);
    if (kind) { label(kind === 'shoot' ? 'SHOOT' : 'LOB', VW / 2 - 34, VH - 35, 2); panel(VW / 2 - 32, VH - 33, 64, 9); hx.fillRect(VW / 2 - 30, VH - 31, Math.round(60 * charge), 5); }   // power meter
    panel(4, VH - 30, 64, 9); hx.fillRect(6, VH - 28, Math.round(60 * (me ? me.stamina : 1)), 5);   // stamina
  }

  // ---------------- main loop ----------------
  let last = 0, acc = 0, lastOwn = null, ownT = 0;
  function tick(dt) {
    time += dt; msgT -= dt;
    if (goalT > 0 || startT > 0) {             // play is stopped: after a goal, or just before a kickoff
      for (const p of players) Player.step(p, dt, 0, 0, false);
      Ball.step(dt, []); clearKicks(); kind = ''; charge = 0; I.swap = false;
      if (goalT > 0) { goalT -= dt; if (goalT <= 0) { if (ending) fullTime(); else kickoff(nextKick); } } else startT -= dt;
      return;
    }
    clock -= dt;
    if (clock <= 0 && !ot) {
      clock = 0;
      if (score[0] !== score[1]) return fullTime();
      ot = true; say('NEXT GOAL WINS', 2.5); Snd.whistle(2);
    }
    const own = Ball.owner;
    if (demo) me = null;                                     // demo: the AI plays both sides
    else if (!me) me = home();
    else if (own && own.team === 0 && (!own.gk || AI.float)) me = own;          // you always control the home player on the ball
    else if (I.swap && me) {                                       // otherwise Q picks the home player nearest the ball
      let bd = 99; for (const p of players) if (p.team === 0 && (!p.gk || AI.float) && p !== me) { const d = Math.hypot(p.x - Ball.x, p.z - Ball.z); if (d < bd) { bd = d; me = p; } }
    }
    I.swap = false;
    if (own) own.keepT = Player.keeping(own) ? (own.keepT || 0) + dt : 0;   // a goalie holding the ball is safe from tackles for 4 seconds
    AI.rush = !!(me && I.thruHeld && !(own && own.team === 0));   // off the ball, holding the through pass button calls your goalie out to the ball
    if (me) { Player.step(me, dt, I.mx, I.mz, I.sprint); kicks(dt); }
    AI.step(dt, players, me, time);
    for (const p of players) {                               // a slide that reaches the ball knocks it loose and floors the carrier
      if (!(p.slideT > 0) || Ball.inGoal || Ball.y > 0.8 || Math.hypot(p.x - Ball.x, p.z - Ball.z) > 1.0) continue;
      const c = Ball.owner; if (c && c.team === p.team) continue;
      if (c) c.downT = 0.7;
      const l = Math.hypot(p.vx, p.vz) || 1; Ball.kick(p, p.vx / l, p.vz / l, 7, 1.5);
    }
    for (const p of players) {                               // a diving goalie who reaches an attacker in the box takes the ball off their feet
      const c = Ball.owner;
      if (c !== lastOwn) { lastOwn = c; ownT = time; }       // only a player who has had the ball for a moment, not a first touch
      if (!(p.diveT > 0) || !c || c.team === p.team || time - ownT < 0.3 || !Player.keeping(p) || c.trickT > 0 || Math.hypot(p.x - Ball.x, p.z - Ball.z) > 1.25 || Math.hypot(c.x - (p.team ? 1 : -1) * Arena.HL, c.z) > 5.4) continue;
      Ball.owner = p; Ball.passTo = null; Ball.jug = false; c.downT = 0.45; p.keepT = 0; Snd.thud(5);
    }
    Player.separate(players);
    const hyped = Ball.hyped, g = Ball.step(dt, players);
    Tricks.update(dt, players, time);
    if (Ball.kicked) { Snd.kick(Ball.kicked); Ball.kicked = 0; }
    if (Ball.hit > 3) Snd.thud(Ball.hit);
    if (g) { score[g > 0 ? 0 : 1] += hyped ? 2 : 1; if (hyped) Tricks.flash = 'HYPE GOAL! X2', Tricks.flashT = 2.2; nextKick = g > 0 ? 1 : 0; goalT = 2.2; say('GOAL!', 2.2);
      const k = Ball.striker; if (k && k.team === (g > 0 ? 0 : 1)) stats.goals[k.id] = (stats.goals[k.id] || 0) + 1;
      if (hyped && g > 0) stats.hypeGoals++;
      ending = ot || score[0] >= GOALS || score[1] >= GOALS;
      Snd.net(); Snd.blip(660, 0.12, 0.1); Snd.blip(990, 0.2, 0.1, 0.13); crowdT = 2.5;
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000 || 0); last = now;
    readInput();
    if (touch && tEls.swap) { const c = kind === 'lob' ? Math.round(charge * 100) : 0; if (c !== lobFill) { lobFill = c; tEls.swap.style.background = c ? 'linear-gradient(to top, var(--fg) ' + c + '%, rgba(0,0,0,0.55) ' + c + '%)' : ''; } }   // the lob button fills up as it charges
    if (touch) { const m = Ball.owner === me ? 0 : me && Player.keeping(me) ? 2 : 1; if (m !== tMode) { tMode = m; for (const a of ['pass', 'thru', 'shoot', 'trick', 'swap']) { tEls[a].innerHTML = svg(a, m); tEls[a].style.opacity = a === 'trick' && m ? 0.3 : ''; } } }
    if (touch) { const c = state === 'layout' ? 'edit' : state === 'play' && !attract ? 'play' : 'menu'; if (document.body.className !== c) document.body.className = c; }
    if (I.invert) invert = !invert;
    menus();
    if (state !== 'play' && !attract) { time += dt; acc = 0; }
    acc += dt; let n = 0;
    while ((state === 'play' || attract) && acc >= DT && n++ < 14) { tick(DT); acc -= DT; }
    crowdT -= dt; Snd.quiet = attract; Snd.crowd(state === 'pause' ? 0 : attract ? 0.02 : 0.035 + Math.max(Tricks.hype[0], Tricks.hype[1]) * 0.0005 + (crowdT > 0 ? 0.16 : 0));
    if (n > 13) acc = 0;
    clearEdges();
    const vp = camera(dt);
    R.begin(vp, time, 60, 190, invert, cam.eye);
    R.depth(true);
    Arena.draw();
    for (const p of players) Player.draw(p, time, p === me);
    Ball.draw();
    drawHud();
    if (invert) { hx.globalCompositeOperation = 'difference'; hx.fillStyle = '#fff'; hx.fillRect(0, 0, VW, VH); hx.globalCompositeOperation = 'source-over'; }
  }
  function boot() {
    resize(); addEventListener('resize', resize);
    try {
      R.init(cv); setSize(5); Ball.build(); kickoff(0);
      document.getElementById('load').remove();
      window.GAME = { Tricks, players, I, Arena, Ball, score, tick, newMatch, startMatch, save, state: () => state, set clock(v) { clock = v; }, get me() { return me; }, set demo(v) { demo = v; } };
      requestAnimationFrame(frame);
    } catch (e) { document.getElementById('load').textContent = 'COULD NOT START: ' + e.message; console.error(e); }
  }
  setTimeout(boot, 30);
})();
