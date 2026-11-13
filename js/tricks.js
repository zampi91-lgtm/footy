'use strict';
// Trick moves, combos, the Hype meters and the Hype Shot.
const Tricks = (() => {
  const T = { hype: [0, 0], combo: { team: -1, n: 0, total: 0, t: 0, names: [] }, last: [-9, -9], flash: '', flashT: 0, best: 0 };
  const PTS = { 'STEP-OVER': 5, 'DRAG-BACK': 5, 'SPIN ROLL': 9, 'FLICK-UP': 9, 'RAINBOW': 15, 'JUGGLE': 3, 'WALL PASS': 9, 'NUTMEG': 18, 'COUNTER': 5 };
  let players = [], time = 0, lastOwner = null, lastTeam = -1, pend = null, jn = 0;

  T.reset = () => { T.hype = [0, 0]; T.best = 0; T.flashT = 0; endCombo(); };
  function endCombo() { T.combo = { team: -1, n: 0, total: 0, t: 0, names: [] }; jn = 0; }

  // every trick feeds its team's Hype; tricks chained without losing the ball are worth more each time
  T.add = (team, name, base = PTS[name]) => {
    const c = T.combo; if (c.team !== team) { endCombo(); T.combo.team = team; }
    const k = T.combo; k.n++; k.t = 3; k.names.push(name);
    const pts = base * Math.min(2.5, 1 + 0.25 * (k.n - 1)) * AI.crew[team].hype;
    k.total += pts; if (team === 0) T.best = Math.max(T.best, k.total); Snd.trick(k.n); T.hype[team] = Math.min(100, T.hype[team] + pts); T.last[team] = time;
  };
  function fake(p, radius, dur) {               // wrong-foot nearby defenders: they freeze for a moment
    for (const q of players) if (q.team !== p.team && !Player.keeping(q) && Math.hypot(q.x - p.x, q.z - p.z) < radius) q.fakeT = dur;
  }

  T.do = (p, name, side = 1) => {
    const B = Ball, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), sp = Math.hypot(p.vx, p.vz);
    if (name === 'STEP-OVER') { p.vx += fz * side * 5; p.vz -= fx * side * 5; p.trick = 'step'; p.trickT = 0.3; p.kickT = Player.KICK; fake(p, 3, 0.5); }
    else if (name === 'DRAG-BACK') { p.yaw += Math.PI; p.vx = -fx * 3.5; p.vz = -fz * 3.5; B.x = p.x - fx * 0.6; B.z = p.z - fz * 0.6; p.trick = 'drag'; p.trickT = 0.3; fake(p, 2.5, 0.4); }
    else if (name === 'SPIN ROLL') { const v = Math.min(sp, Player.WALK); p.vx = fx * v; p.vz = fz * v;   // spin on the spot at your pace, no forward dash (it read as a slide)
      p.trick = 'spin'; p.trickT = 0.45; fake(p, 2.4, 0.55); }
    else if (name === 'FLICK-UP') { B.jug = true; B.vy = 6.2; B.y = B.R + 0.02; jn = 0; }
    else if (name === 'JUGGLE') { B.vy = 5.6; jn++; }
    else if (name === 'RAINBOW') { B.kick(p, fx, fz, 5.5 + sp, 7.5); B.cool = 0.2; p.trick = 'step'; p.trickT = 0.3; fake(p, 2.6, 0.5); }
    T.add(p.team, name, name === 'JUGGLE' ? PTS.JUGGLE + jn : PTS[name]);
  };

  // the human's trick button: a different trick every press; while the ball is up from a flick-up, a press juggles it
  let lastTrick = '';
  T.random = p => {
    if (Ball.owner !== p || p.trickT > 0) return;
    if (Ball.jug && Ball.y > 0.45) { if (jn < 5 && Ball.vy < 1.5) T.do(p, 'JUGGLE'); return; }
    const L = ['STEP-OVER', 'DRAG-BACK', 'SPIN ROLL', 'FLICK-UP', 'RAINBOW'].filter(n => n !== lastTrick);
    lastTrick = L[Math.floor(Math.random() * L.length)]; T.do(p, lastTrick, Math.random() < 0.5 ? -1 : 1);
  };
  // direction-tap trick input (no longer bound to a control)
  T.tap = (p, dx, dz) => {
    if (Ball.owner !== p) return;
    if (Ball.jug && Ball.y > 0.45) { if (jn < 5 && Ball.vy < 1.5) T.do(p, 'JUGGLE'); return; }   // time the touch as the ball drops; up to five per flick-up
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), f = dx * fx + dz * fz, s = dx * fz - dz * fx;
    if (Math.abs(s) > Math.abs(f)) { pend = null; return T.do(p, 'STEP-OVER', Math.sign(s)); }
    const d = f > 0 ? 'f' : 'b';
    if (pend && pend.d === d) { pend = null; T.do(p, d === 'f' ? 'SPIN ROLL' : 'RAINBOW'); }   // double tap
    else pend = { d, t: 0.2, p };
  };

  T.shot = (p, dx, dz) => {                     // spend a full meter on a shot that is very hard to save and counts double
    T.hype[p.team] = 0; Ball.kick(p, dx, dz, 30, 2.2); Ball.hyped = true;
    p.kickT = Player.KICK; p.yaw = Math.atan2(dx, dz); T.flash = 'HYPE SHOT!'; T.flashT = 1.2;
  };
  T.tackled = team => { if (time - T.last[1 - team] < 0.9) T.add(team, 'COUNTER'); };   // winning the ball straight after their trick

  T.update = (dt, ps, now) => {
    players = ps; time = now; T.flashT -= dt;
    const B = Ball, own = B.owner, c = T.combo;
    if (pend) { pend.t -= dt; if (pend.t <= 0) { const q = pend; pend = null; if (B.owner === q.p) T.do(q.p, q.d === 'f' ? 'FLICK-UP' : 'DRAG-BACK'); } }
    if (own && own !== lastOwner) {               // someone just took the ball
      if (B.walled && B.kicker && B.kicker.team === own.team) T.add(own.team, 'WALL PASS');
      if (lastTeam >= 0 && own.team !== lastTeam && c.team === lastTeam && c.n > 1) { const share = c.total * 0.3; endCombo(); T.hype[own.team] = Math.min(100, T.hype[own.team] + share); }
      else if (own.team !== c.team) endCombo();
      B.walled = false; B.hyped = false; lastTeam = own.team;
    }
    lastOwner = own;
    if (B.nutmeg) { B.nutmeg = false; if (B.kicker) T.add(B.kicker.team, 'NUTMEG'); }
    if (B.hyped && Math.hypot(B.vx, B.vz) < 9) B.hyped = false;
    if (c.n) { c.t -= dt; if (c.t <= 0) endCombo(); }
  };
  return T;
})();
