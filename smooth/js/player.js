'use strict';
// Player movement and the limb rig (boxes for torso, head and limbs, as in the skate game).
const Player = (() => {
  const TAU = Math.PI * 2, WHITE = 9.97, BLACK = 9.0, GREY = 9.49;
  const wrap = a => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
  const P = { WALK: 4.8, SPRINT: 7.4, RADIUS: 0.45, SCALE: 1.3, KICK: 0.28 };

  P.make = (team, role, id) => ({ team, role, id, gk: role === 'gk', x: 0, z: 0, yaw: 0, vx: 0, vz: 0, ph: 0, stamina: 1, sprinting: false, kickT: 0, downT: 0, slideT: 0, diveT: 0, thinkT: 0 });

  // Goalie rule: in 5 v 5 only the keeper, in 4 v 4 and 3 v 3 anyone, counts as the goalie while inside their own penalty arc.
  P.keeping = p => (p.gk || AI.float) && Math.hypot(p.x - (p.team ? 1 : -1) * Arena.HL, p.z) < 4.6;
  // a goalie dive: a committed lunge along (dx, dz) with long reach, then a moment on the ground
  P.dive = (p, dx, dz, speed = 8.5) => {
    p.diveT = 0.5; p.vx = dx * speed; p.vz = dz * speed; p.sprinting = false;
    p.diveA = (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) > 0 ? -1.3 : 1.3;
  };
  const pose = (p, dt, to) => { p.tip = (p.tip || 0) + (to - (p.tip || 0)) * (1 - Math.exp(-dt * 20)); };   // body tilt eases between standing, sliding and lying
  // mx, mz: wanted direction in court space (length 0..1)
  P.step = (p, dt, mx, mz, sprint) => {
    if (p.slideT > 0) {                          // sliding: committed to the line, then on the ground for a moment
      p.slideT -= dt; const f = Math.exp(-1.9 * dt); p.vx *= f; p.vz *= f; p.x += p.vx * dt; p.z += p.vz * dt; Arena.keepIn(p, P.RADIUS);
      p.sprinting = false; pose(p, dt, -1.15); if (p.slideT <= 0) { p.downT = 0.34; p.back = true; } return;   // the slide runs out into getting up, in one motion
    }
    if (p.diveT > 0) {
      p.diveT -= dt; const f = Math.exp(-3 * dt); p.vx *= f; p.vz *= f; p.x += p.vx * dt; p.z += p.vz * dt; Arena.keepIn(p, P.RADIUS);
      if (p.diveT <= 0) p.downT = 0.4; p.back = false; return;
    }
    const down = p.downT > 0;
    if (down) { p.downT -= dt; mx = mz = 0; sprint = false; if (p.downT <= 0) p.back = false; }
    pose(p, dt, down ? (p.back ? -1.15 * Math.min(1, p.downT / 0.3) : 1.35 * Math.min(1, p.downT / 0.2)) : 0);
    if (p.fakeT > 0) { p.fakeT -= dt; mx = mz = 0; sprint = false; }   // wrong-footed by a trick
    if (p.trickT > 0) p.trickT -= dt;
    const mag = Math.hypot(mx, mz), moving = mag > 0.05;
    p.sprinting = !!sprint && moving && p.stamina > 0.03;
    const top = (p.sprinting ? P.SPRINT : P.WALK) * (p.pace || 1), k = 1 - Math.exp(-dt * (moving ? (p.sprinting ? 5.5 : 9) : down ? 4.5 : 9.5));
    const sp0 = Math.hypot(p.vx, p.vz), d = moving && sp0 > 1.2 ? wrap(Math.atan2(mx, mz) - Math.atan2(p.vx, p.vz)) : 9;
    let bank = 0;
    if (Math.abs(d) < 2.2) {                     // already running: steer round in an arc and keep the pace, instead of braking into every turn
      const turn = (p.sprinting ? 7.5 : 11.5) * dt, st = Math.max(-turn, Math.min(turn, d)), a = Math.atan2(p.vx, p.vz) + st;
      const sp1 = sp0 + (mag * top * (1 - 0.22 * Math.abs(d) / 2.2) - sp0) * k;
      p.vx = Math.sin(a) * sp1; p.vz = Math.cos(a) * sp1; bank = Math.max(-1, Math.min(1, d / 1.2)) * Math.min(1, sp0 / P.SPRINT);
    } else { p.vx += (mx * top - p.vx) * k; p.vz += (mz * top - p.vz) * k; }   // from a standstill, stopping, or turning right back: push off / plant
    p.bank = (p.bank || 0) + (bank - (p.bank || 0)) * (1 - Math.exp(-dt * 9));
    p.x += p.vx * dt; p.z += p.vz * dt;
    Arena.keepIn(p, P.RADIUS);
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 0.4) p.yaw += wrap(Math.atan2(p.vx, p.vz) - p.yaw) * Math.min(1, dt * 16);
    p.ph = (p.ph + sp * dt * 2.7) % TAU;
    p.kickT = Math.max(0, p.kickT - dt);
    p.stamina = Math.max(0, Math.min(1, p.stamina + (p.sprinting ? -0.2 : 0.14) * dt));
  };

  P.draw = (p, time, controlled) => {
    const sp = Math.hypot(p.vx, p.vz), run = Math.min(1, sp / P.WALK), spr = Math.max(0, Math.min(1, (sp - P.WALK) / (P.SPRINT - P.WALK)));
    const goalie = AI.float ? P.keeping(p) : p.gk;   // whoever is in goal wears grey
    // kits: home is white with black trim, away is black with white trim, and each crew has its own pattern
    // as one small mark on the shirt (0 a thin chest hoop, 1 a thin centre stripe, 2 a thin shoulder line)
    const kit = AI.crew[p.team].kit | 0, base = p.team ? BLACK : WHITE, trim = p.team ? WHITE : BLACK;
    const shirt = goalie ? GREY : base, shorts = base, socks = base;   // all white or all black, so the two sides read apart at a glance
    const S = (0.26 + 0.16 * spr) * run, L = (0.15 + 0.12 * spr) * run, lean = 0.05 * run + 0.12 * spr;
    const hipY = 0.9 - 0.03 * run + Math.abs(Math.sin(p.ph)) * 0.05 * run;
    const tip = Math.abs(p.tip || 0) > 0.02 ? p.tip : 0;   // sliding leans back, knocked down falls forward (eased in Player.step)
    const dive = p.diveT > 0 ? p.diveA * Math.min(1, (0.5 - p.diveT) / 0.12) : 0;
    const Ms = M.chain(M.T(p.x, dive ? 0.45 : 0.16 * Math.min(1, Math.abs(tip)), p.z), M.RY(p.yaw + (p.trickT > 0 && p.trick === 'spin' ? TAU * (1 - p.trickT / 0.45) : 0)), M.RX(dive ? 0 : tip), M.RZ(dive || (p.fakeT > 0 ? 0.22 : 0) - 0.2 * (p.bank || 0)), M.S(P.SCALE, P.SCALE, P.SCALE));   // drawn a little larger than life so they read at 1-bit
    const part = (a, b, th, m, th2) => R.box(M.mul(Ms, M.limb(a, b, th, th2)), m);
    R.box(M.chain(M.T(p.x, 0.03, p.z), M.S(controlled ? 1.6 : 1.2, 0.01, controlled ? 1.6 : 1.2)), 15);
    for (const side of [-1, 1]) {
      const ph = p.ph + (side > 0 ? Math.PI : 0), up = Math.max(0, Math.cos(ph));
      const foot = [side * 0.11, 0.07 + L * up, S * Math.sin(ph)], hip = [side * 0.1, hipY, 0];
      if (side > 0 && p.kickT > 0) { const t = 1 - p.kickT / P.KICK; foot[1] = 0.12 + 0.3 * t; foot[2] = -0.35 + 1.05 * Math.sin(t * Math.PI * 0.6); }   // kicking leg swings through
      const knee = [(foot[0] + hip[0]) / 2, (foot[1] + hip[1]) / 2, (foot[2] + hip[2]) / 2 + 0.07 + 0.3 * up * run];
      part(foot, knee, 0.11, socks); part(knee, hip, 0.14, GREY);
      R.box(M.chain(Ms, M.T(foot[0], foot[1] - 0.02, foot[2] + 0.05), M.S(0.12, 0.09, 0.26)), BLACK);
    }
    const sh = [0, hipY + 0.52, lean];
    R.box(M.chain(Ms, M.T(0, hipY, 0), M.S(0.34, 0.22, 0.23)), shorts);
    part([0, hipY + 0.08, 0], sh, 0.37, shirt, 0.21);
    if (!goalie) {
      if (kit === 0) R.box(M.chain(Ms, M.T(0, hipY + 0.36, lean * 0.6), M.S(0.4, 0.055, 0.24)), trim);
      else if (kit === 1) R.box(M.chain(Ms, M.T(0, hipY + 0.31, lean * 0.5), M.S(0.07, 0.44, 0.26)), trim);
      else R.box(M.chain(Ms, M.T(0, sh[1] - 0.05, sh[2]), M.S(0.5, 0.055, 0.22)), trim);
    }
    R.box(M.chain(Ms, M.T(0, sh[1] + 0.17, sh[2] + 0.02), M.S(0.2, 0.22, 0.2)), GREY);
    R.box(M.chain(Ms, M.T(0, sh[1] + 0.27, sh[2]), M.S(0.22, 0.08, 0.22)), BLACK);
    for (const side of [-1, 1]) {
      const sw = -side * Math.sin(p.ph) * (0.22 + 0.14 * spr) * run;
      part([side * 0.24, sh[1] - 0.06, sh[2]], [side * 0.28, sh[1] - 0.46 + 0.12 * run, sh[2] + sw + 0.08 * run], 0.09, GREY);
    }
    if (controlled) R.box(M.chain(M.T(p.x, 2.75 + Math.sin(time * 6) * 0.06, p.z), M.RY(time * 3), M.RX(0.6), M.RZ(0.78), M.S(0.26, 0.26, 0.26)), BLACK);
  };
  // push overlapping players apart
  P.separate = ps => {
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = P.RADIUS * 1.7;
      if (d < min && d > 1e-4) { const k = (min - d) / d / 2; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
    }
  };
  return P;
})();
