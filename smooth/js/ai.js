'use strict';
// Team shape and player decisions for everyone the human is not controlling.
// Team 0 (home) attacks +x, team 1 (away) attacks -x. Spots are written for a team attacking +x.
const AI = (() => {
  const A = { skill: 0.85 };                  // 1 = full strength. Lower eases the away side: slower thinking, worse tackles, wilder shots, weaker keeper
  // three original crews. pass / trick / tackle scale how their AI plays; hype scales how fast their meter fills.
  A.CREWS = [
    { name: 'CANAL KINGS', short: 'KINGS', style: 'PASSING CREW', blurb: 'QUICK PASSES, ALWAYS AN OPEN MAN', pass: 2, trick: 1, tackle: 1, hype: 1, kit: 0, kitName: 'HOOP',
      badge: ['100010001', '110111011', '111111111', '111111111', '011111110', '000000000', '011111110', '011111110', '000000000'] },
    { name: 'ROOFTOP REBELS', short: 'REBELS', style: 'TRICK CREW', blurb: 'SHOW-OFFS WHO FILL HYPE FAST', pass: 1, trick: 2.5, tackle: 1, hype: 1.25, kit: 1, kitName: 'STRIPE',
      badge: ['000001110', '000011100', '000111000', '001111110', '000011100', '000111000', '001110000', '011000000', '010000000'] },
    { name: 'IRON YARD', short: 'IRON', style: 'PHYSICAL CREW', blurb: 'HARD TACKLES, HARD TO SHAKE OFF', pass: 1, trick: 0.6, tackle: 1.35, hype: 1, kit: 2, kitName: 'SHOULDER LINE',
      badge: ['000000000', '111111110', '011111111', '001111100', '000111000', '000111000', '001111100', '011111110', '000000000'] },
  ];
  A.crew = [A.CREWS[0], A.CREWS[1]];
  A.size = 5;                                 // players a side: 5 (fixed keeper), or 4 / 3 with a floating goalie (whoever is in the box)
  A.float = false;
  // spots are written for the smallest court (33 x 19.8 m) and scale with the cage
  A.SPOTS = { 5: { gk: [-15, 0], d1: [-7.2, -4.4], d2: [-7.2, 4.4], a1: [2.8, -5], a2: [5, 3.9] }, 4: { gk: [-15, 0], d1: [-6.5, 0.5], a1: [3, -4.6], a2: [4.6, 4.2] }, 3: { gk: [-15, 0], d1: [-5.5, -2.5], a1: [4, 3] } };
  A.KICKS = { 5: { gk: [-15, 0], d1: [-7.7, -3.9], d2: [-7.7, 3.9], a1: [-1.6, -5.5], a2: [-3.3, 2.8] }, 4: { gk: [-15, 0], d1: [-7.5, 0.5], a1: [-1.6, -5], a2: [-3.3, 3.6] }, 3: { gk: [-15, 0], d1: [-6.5, -3], a1: [-2.5, 3] } };
  A.spot = (role, kick) => { const p = (kick ? A.KICKS : A.SPOTS)[A.size][role], k = Arena.HL / 16.5; return [p[0] * k, p[1] * k]; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), rnd = Math.random;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const up = p => !(p.downT > 0 || p.slideT > 0 || p.diveT > 0);
  let all = [];
  const mark = new Map();
  function oppDist(p, team) { let d = 99; for (const q of all) if (q.team !== team && up(q)) d = Math.min(d, dist(p, q)); return d; }
  function blocked(a, b, team) {                // is an opponent standing in the passing lane?
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    for (const q of all) {
      if (q.team === team || !up(q)) continue;
      const t = ((q.x - a.x) * dx + (q.z - a.z) * dz) / L2;
      if (t > 0.08 && t < 0.95 && Math.hypot(a.x + dx * t - q.x, a.z + dz * t - q.z) < 1.1) return true;
    }
    return false;
  }
  function go(p, dt, tx, tz, sprint) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), m = d > 0.25 ? Math.min(1, d / 0.9) / d : 0;
    Player.step(p, dt, dx * m, dz * m, sprint && d > 1.5);
  }

  // pass to the best-placed teammate; returns true if a pass was made
  A.pass = (p, minScore, aim, speed) => {
    const dir = p.team ? -1 : 1; let best = null, bs = minScore;
    for (const m of all) {
      if (m.team !== p.team || m === p || !up(m)) continue;
      const d = dist(p, m); if (d < 2.2 || d > 17) continue;
      let s;
      if (aim) { const c = ((m.x - p.x) * aim[0] + (m.z - p.z) * aim[1]) / d; if (c < 0.8) continue; s = c * 10 - d * 0.05; }   // human pass: whoever is most in line with the aim
      else s = (m.x - p.x) * dir * 0.35 + Math.min(5, oppDist(m, p.team)) * 0.8 - (blocked(p, m, p.team) ? 6 : 0) - (m.gk ? 4 : 0) + rnd();
      if (s > bs) { bs = s; best = m; }
    }
    if (!best) return false;
    const tx = best.x + best.vx * 0.3, tz = best.z + best.vz * 0.3, d = Math.hypot(tx - p.x, tz - p.z) || 1;
    Ball.kick(p, (tx - p.x) / d, (tz - p.z) / d, speed || clamp(7.5 + d * 0.75, 9.5, 16.5), 0);
    Ball.passTo = best; p.kickT = Player.KICK; p.yaw = Math.atan2(tx - p.x, tz - p.z);
    return true;
  };

  // through ball: played into open space ahead of a teammate, who runs onto it
  A.through = (p, minScore, aim) => {
    const dir = p.team ? -1 : 1; let best = null, bs = minScore, bx = 0, bz = 0;
    for (const m of all) {
      if (m.team !== p.team || m === p || !up(m) || m.gk) continue;
      const d = dist(p, m); if (d < 2.2 || d > 18) continue;
      const c = aim ? ((m.x - p.x) * aim[0] + (m.z - p.z) * aim[1]) / d : 1; if (c < 0.6) continue;
      for (const lz of [-2.5, 0, 2.5]) {         // try three spots ahead of the runner and keep the most open one
        const sp = { x: clamp(m.x + dir * 5.5, -Arena.HL + 2.5, Arena.HL - 2.5), z: clamp(m.z + m.vz * 0.4 + lz, -Arena.HW + 1.9, Arena.HW - 1.9) };
        if ((sp.x - p.x) * dir < -1) continue;
        const s = (aim ? c * 10 : (sp.x - p.x) * dir * 0.35 - (blocked(p, sp, p.team) ? 6 : 0) + rnd()) + Math.min(5, oppDist(sp, p.team)) * 0.8;
        if (s > bs) { bs = s; best = m; bx = sp.x; bz = sp.z; }
      }
    }
    if (!best) return false;
    const d = Math.hypot(bx - p.x, bz - p.z) || 1;
    Ball.kick(p, (bx - p.x) / d, (bz - p.z) / d, clamp(7 + d * 0.7, 9, 16), 0);
    Ball.passTo = best; Ball.runTo = [bx, bz]; p.kickT = Player.KICK; p.yaw = Math.atan2(bx - p.x, bz - p.z);
    return true;
  };

  function carrier(p, dt) {
    const dir = p.team ? -1 : 1, gx = dir * Arena.HL, dg = Math.hypot(gx - p.x, p.z);
    p.holdT = (p.holdT || 0) + dt; p.thinkT -= dt;
    if (p.thinkT <= 0 || !p.aim) {
      const ease = p.team ? A.skill : 1;
      p.aim = true; p.thinkT = (0.14 + rnd() * 0.12) / ease;
      let near = null, nd = 99; for (const q of all) if (q.team !== p.team && !q.gk && up(q)) { const d = dist(p, q); if (d < nd) { nd = d; near = q; } }
      if (Tricks.hype[p.team] >= 100 && dg < 14 && p.holdT > 0.2) {                                  // full meter: Hype Shot
        const dx = gx - p.x, dz = (rnd() - 0.5) * 2 - p.z, d = Math.hypot(dx, dz) || 1; Tricks.shot(p, dx / d, dz / d); p.holdT = 0; return;
      }
      const cr = A.crew[p.team];
      if (near && nd < 2.8 && !Ball.jug && !(p.trickT > 0) && rnd() < 0.06 * ease * cr.trick) Tricks.do(p, rnd() < 0.6 ? 'STEP-OVER' : 'SPIN ROLL', rnd() < 0.5 ? -1 : 1);   // show off past a defender
      if (p.holdT > 0.25 && dg < 9.5 && Math.abs(p.z) < 6.5 && (dg < 5.5 || rnd() < 0.2)) {          // shoot, away from the keeper
        const k = all.find(q => q.team !== p.team && q.gk), az = (k && k.z > 0 ? -1 : 1) * 1.0 + (rnd() - 0.5) * 2.3 / ease;
        const dx = gx - p.x, dz = az - p.z, d = Math.hypot(dx, dz) || 1;
        const pw = rnd(); Ball.kick(p, dx / d, dz / d, 17 + pw * 6, 1.5 + pw * 4.5); p.kickT = Player.KICK; p.yaw = Math.atan2(dx, dz); p.holdT = 0; return;
      }
      if (p.holdT > 0.35 && (nd < 2.4 ? A.pass(p, 0.5) : rnd() < 0.13 * cr.pass && ((rnd() < 0.4 && A.through(p, 3.5)) || A.pass(p, 3)))) { p.holdT = 0; return; }
      const a0 = Math.atan2(gx - dir * 2.5 - p.x, p.z * 0.4 - p.z); let bs = -99;                        // dribble toward the goal, bending into open space
      for (const a of [0, 0.6, -0.6, 1.2, -1.2]) {
        const c = { x: clamp(p.x + Math.sin(a0 + a) * 4, -Arena.HL + 1, Arena.HL - 1), z: clamp(p.z + Math.cos(a0 + a) * 4, -Arena.HW + 1, Arena.HW - 1) };
        const sc = -Math.hypot(gx - c.x, c.z) * 0.5 + Math.min(4, oppDist(c, p.team)) * 1.1 - Math.abs(a) * 0.3;
        if (sc > bs) { bs = sc; p.tx = c.x; p.tz = c.z; }
      }
      p.run = nd > 2.2;
    }
    go(p, dt, p.tx, p.tz, p.run);
  }

  function keeper(p, dt) {
    const B = Ball, dir = p.team ? -1 : 1, gx = -dir * Arena.HL;
    if (B.owner === p) {                        // gather, step out, then find a teammate
      p.holdT = (p.holdT || 0) + dt; go(p, dt, gx + dir * 3, p.z, false);
      if (p.holdT > 0.7) { if (!A.pass(p, -99)) { Ball.kick(p, dir, 0, 13, 6.5); p.kickT = Player.KICK; } p.holdT = 0; }
      return;
    }
    p.holdT = 0;
    const toGoal = -B.vx * dir, t = toGoal > 6 ? (p.x - B.x) / B.vx : -1;
    if (!B.owner && t > 0 && t < 1.3) {                                                               // a shot is coming: get across, and dive if it is out of reach
      const tz = clamp(B.z + B.vz * t, -1.7, 1.7), gap = tz - p.z;
      if (Math.abs(gap) > 0.75 && t < 0.42 && B.y + B.vy * t < 2.3 && Player.keeping(p)) { p.yaw = dir * Math.PI / 2; return Player.dive(p, 0, Math.sign(gap), 8.5 * (p.team ? A.skill : 1)); }
      return go(p, dt, p.x, tz, true);
    }
    const o = B.owner;
    if (A.rush && p.team === 0 && !(o && o.team === 0) && !B.inGoal) {                                // the human is calling the goalie out: charge the ball
      const d = dist(p, B); p.smotherCD = (p.smotherCD || 0) - dt;
      if (o && d < 2.1 && Player.keeping(p) && p.smotherCD <= 0 && !(o.trickT > 0)) { p.smotherCD = 1.5; p.yaw = dir * Math.PI / 2; return Player.dive(p, (B.x - p.x) / (d || 1), (B.z - p.z) / (d || 1), 8); }
      if (o && d < 1.15 && p.tackleCD <= 0 && !Player.keeping(p)) {                                   // outside the box he has to tackle like anyone else
        p.tackleCD = 0.9; p.kickT = Player.KICK;
        if (!(o.trickT > 0) && rnd() < 0.3 * A.crew[0].tackle) { Tricks.tackled(0); const a = rnd() * 6.283; B.kick(o, Math.sin(a), Math.cos(a), 3.5 + rnd() * 2, 0.5); B.cool = 0.55; }
      }
      return go(p, dt, B.x + (o ? -dir * 0.35 : B.vx * 0.2), B.z + (o ? 0 : B.vz * 0.2), true);
    }
    // an attacker brings the ball into the box: dive at their feet
    p.smotherCD = (p.smotherCD || 0) - dt;
    if (o && o.team !== p.team && Player.keeping(p) && p.smotherCD <= 0 && Math.hypot(o.x - gx, o.z) < 4.4 && !(o.trickT > 0)) {
      const d = dist(p, B);
      if (d < 2.1) { p.smotherCD = 4; if (rnd() < 0.3 * (p.team ? A.skill : 1)) { p.yaw = dir * Math.PI / 2; return Player.dive(p, (B.x - p.x) / (d || 1), (B.z - p.z) / (d || 1), 8 * (p.team ? A.skill : 1)); } }
    }
    if (A.float && o && o.team === p.team && B.x * dir > 0) return go(p, dt, (-8 * Arena.HL / 16.5 + B.x * dir * 0.35) * dir, B.z * 0.3, false);   // floating goalie: step up behind the attack
    const db = Math.hypot(B.x - gx, B.z);
    if (!B.owner && !B.inGoal && db < 6 && all.every(q => q === p || dist(q, B) > dist(p, B))) return go(p, dt, B.x, B.z, true);
    const ux = (B.x - gx) / (db || 1), uz = B.z / (db || 1), out = db < 9 ? 1.9 : 1.3;
    go(p, dt, gx + ux * out, clamp(uz * out, -1.35, 1.35), false);
  }

  A.step = (dt, players, me, time) => {
    all = players;
    const B = Ball, own = B.owner, poss = own ? own.team : -1, chaser = [null, null];
    for (const t of [0, 1]) {                   // one player per team goes to the ball when their team does not have it
      if (poss === t) continue;
      if (!own && B.passTo && B.passTo.team === t && up(B.passTo)) { chaser[t] = B.passTo; continue; }
      let bd = 99; for (const p of players) if (p.team === t && !p.gk && p !== me && up(p)) { const d = dist(p, B); if (d < bd) { bd = d; chaser[t] = p; } }
    }
    mark.clear();
    for (const t of [0, 1]) {                   // defending team: the opponents nearest our goal are each picked up by the closest free defender
      if (own ? own.team === t : !!(B.passTo && B.passTo.team === t)) continue;
      const gx = (t ? 1 : -1) * Arena.HL, free = players.filter(p => p.team === t && !p.gk && p !== me && p !== chaser[t] && up(p));
      const threats = players.filter(m => m.team !== t && m !== own && !Player.keeping(m) && !(m.gk && !A.float)).sort((a, b) => Math.hypot(a.x - gx, a.z) - Math.hypot(b.x - gx, b.z));
      for (const m of threats) {
        let bi = -1, bd = 99; free.forEach((p, i) => { const d = dist(p, m) - (p.marking === m ? 2 : 0); if (d < bd) { bd = d; bi = i; } });
        if (bi < 0) break; mark.set(free[bi], m); free[bi].marking = m; free.splice(bi, 1);
      }
    }
    for (const p of players) {
      if (p === me) continue;
      p.tackleCD = (p.tackleCD || 0) - dt;
      if (!up(p)) { Player.step(p, dt, 0, 0, false); continue; }
      if (p.gk) { keeper(p, dt); continue; }
      if (p === own) { carrier(p, dt); continue; }
      p.holdT = 0; p.aim = false;
      const dir = p.team ? -1 : 1;
      if (p === chaser[p.team]) {
        if (own) {                              // press the carrier from the goal side and try to poke the ball away
          go(p, dt, B.x - dir * 0.35, B.z, true);
          if (dist(p, B) < 1.15 && p.tackleCD <= 0 && !(p.fakeT > 0)) {
            p.tackleCD = 0.75 + rnd() * 0.5; p.kickT = Player.KICK;
            if (!(own.trickT > 0) && !(own.keepT < 4 && Player.keeping(own)) && rnd() < 0.3 * (p.team ? A.skill : 1) * A.crew[p.team].tackle) { Tricks.tackled(p.team); const a = rnd() * 6.283; B.kick(own, Math.sin(a), Math.cos(a), 3.5 + rnd() * 2, 0.5); B.cool = 0.55; }
          }
        } else if (B.runTo && p === B.passTo && Math.hypot(B.x - B.runTo[0], B.z - B.runTo[1]) > 2.5 && Math.hypot(B.vx, B.vz) > 3) go(p, dt, B.runTo[0], B.runTo[1], true);   // run onto a through ball
        else go(p, dt, B.x + B.vx * 0.22, B.z + B.vz * 0.22, true);
        continue;
      }
      // everyone else: a base spot from the team shape (it slides with the ball), then a smarter spot near it
      const s = A.spot(p.role), att = own ? own.team === p.team : !!(B.passTo && B.passTo.team === p.team), HL = Arena.HL, HW = Arena.HW;
      let x = s[0] + B.x * dir * 0.5 + (att ? 3 : -1.5), z = s[1] * (att ? 1.2 : 0.75) + B.z * 0.3;
      if (att && p.role[0] === 'a') x += 2;
      x = clamp(x, -HL + 2.7, HL - 2.2) * dir; z = clamp(z, -HW + 1.1, HW - 1.1);
      p.posT = (p.posT || 0) - dt;
      if (p.posT <= 0 || p.px === undefined || p.patt !== att) {
        p.posT = 0.25 + rnd() * 0.2; p.patt = att;
        if (att) {                               // in possession: find open space with a clear line from the ball, or a scoring spot near goal
          const gx = dir * HL, fwd = p.role[0] === 'a', C = [];
          for (const ox of [-4, 0, 4]) for (const oz of [-4, 0, 4]) C.push([x + ox, z + oz, 0]);
          if (fwd && B.x * dir > HL * 0.2) C.push([gx - dir * 4.5, 2.4, 3], [gx - dir * 4.5, -2.4, 3], [gx - dir * 7, 0, 2.5], [gx - dir * 3.4, 4.2, 2], [gx - dir * 3.4, -4.2, 2]);
          let bs = -99;
          for (const c of C) {
            const q = { x: clamp(c[0], -HL + 1.5, HL - 1.5), z: clamp(c[1], -HW + 1.2, HW - 1.2) }, db = dist(q, B);
            let sc = c[2] + Math.min(6, oppDist(q, p.team)) - (blocked(B, q, p.team) ? 4 : 0) + (fwd ? clamp((q.x - B.x) * dir, -6, 8) * 0.15 : 0) - (db < 4 ? 3 : db > 17 ? 2 : 0) - dist(q, p) * 0.2;
            for (const m of all) if (m.team === p.team && m !== p && Math.hypot((m.px === undefined || m === own ? m.x : m.px) - q.x, (m.pz === undefined || m === own ? m.z : m.pz) - q.z) < 3.5) sc -= 3;   // keep apart
            if (p.px !== undefined && Math.hypot(q.x - p.px, q.z - p.pz) < 1) sc += 1;
            if (sc > bs) { bs = sc; p.px = q.x; p.pz = q.z; }
          }
        } else {                                 // out of possession: mark the most dangerous free opponent, goal side and in the passing lane
          const m = mark.get(p), gx = -dir * HL;
          if (m) {
            const dg = Math.hypot(gx - m.x, m.z) || 1, k = 0.28;
            let mx = m.x + (gx - m.x) / dg * 1.3 + (B.x - m.x) * k, mz = m.z - m.z / dg * 1.3 + (B.z - m.z) * k;
            mx = mx * 0.8 + x * 0.2; mz = mz * 0.8 + z * 0.2;
            if (p.role[0] === 'd') mx = dir * Math.min(mx * dir, Math.max(B.x * dir - 1.5, -HL + 4));   // the back line stays goal side of the ball
            p.px = clamp(mx, -HL + 1.5, HL - 1.5); p.pz = clamp(mz, -HW + 1.2, HW - 1.2);
          } else { const t = 0.45; p.px = x * (1 - t) + (gx + (B.x - gx) * 0.5) * t; p.pz = z * (1 - t) + B.z * 0.5 * t; }   // spare man: cover the space between the ball and the goal
        }
      }
      go(p, dt, p.px, p.pz, Math.hypot(p.px - p.x, p.pz - p.z) > 4);
    }
  };
  return A;
})();
