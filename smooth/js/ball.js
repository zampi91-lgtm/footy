'use strict';
// Ball physics: gravity, bounce, rolling, cage walls, posts, crossbar, nets, dribbling and kicks.
const Ball = (() => {
  const WHITE = 9.97, BLACK = 9.0, GRAV = 16, POST = 0.07, NET = 1.3;
  const B = { R: 0.17, x: 0, y: 0.17, z: 0, vx: 0, vy: 0, vz: 0, owner: null, kicker: null, cool: 0, inGoal: 0, scored: false, rot: M.ident() };
  let mesh;

  B.build = () => {                             // low-poly sphere with black patches so you can see it roll
    const b = new Geo.Buf(), N = 8, K = 6;
    const pt = (i, j) => { const a = i / N * Math.PI * 2, t = j / K * Math.PI; return [Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)]; };
    for (let j = 0; j < K; j++) for (let i = 0; i < N; i++) {
      const m = (i + j * 2) % 3 === 0 ? BLACK : WHITE, q = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j), pt(i + 1, j + 1), pt(i, j + 1)];
      for (const p of q) b.v(p[0], p[1], p[2], p[0], p[1], p[2], 0, 0, m);
    }
    mesh = b.mesh();
  };
  B.reset = (x = 0, z = 0) => Object.assign(B, { x, y: B.R, z, vx: 0, vy: 0, vz: 0, owner: null, kicker: null, cool: 0, inGoal: 0, scored: false, passTo: null, runTo: null, jug: false, hyped: false, walled: false, nutmeg: false });

  // dx, dz: unit direction on the ground. sp: ground speed, up: upward speed
  B.kick = (p, dx, dz, sp, up) => {
    B.owner = null; B.kicker = p; B.cool = 0.3; B.kicked = Math.min(1, sp / 25); B.striker = p; B.passTo = null; B.jug = false; B.walled = false; B.hyped = false; B.runTo = null;
    B.vx = dx * sp; B.vz = dz * sp; B.vy = up; B.y = Math.max(B.y, B.R);
  };

  function circle(a, b, va, vb, ca, cb, min) {  // bounce a 2D point off a round bar; returns [a, b, va, vb] or null
    const da = a - ca, db = b - cb, d = Math.hypot(da, db);
    if (d >= min || d < 1e-6) return null;
    const na = da / d, nb = db / d, vn = va * na + vb * nb;
    if (vn < 0) { va -= 1.7 * vn * na; vb -= 1.7 * vn * nb; }
    return [ca + na * min, cb + nb * min, va, vb];
  }
  function wall(nx, nz, over) {                 // push back along the inward normal and reflect
    B.x += nx * over; B.z += nz * over;
    const vn = B.vx * nx + B.vz * nz;
    if (vn < 0) { B.vx -= 1.7 * vn * nx; B.vz -= 1.7 * vn * nz; B.hit = Math.max(B.hit || 0, -vn); B.walled = true; }
  }

  // returns +1 / -1 on the step a goal is scored at that end, else 0
  B.step = (dt, players) => {
    const A = Arena, r = B.R, ox = B.x, oz = B.z; let goal = 0;
    B.cool -= dt; B.hit = 0;
    if (B.owner) {                              // dribbling: a soft spring to a spot ahead of the lead foot
      const p = B.owner, reach = (B.jug ? 0.5 : 0.66) + (p.sprinting ? 0.5 : 0.14) * (0.5 + 0.5 * Math.sin(p.ph * 2));
      const k = 1 - Math.exp(-dt * (p.sprinting ? 10 : 17));
      B.x += (p.x + Math.sin(p.yaw) * reach - B.x) * k; B.z += (p.z + Math.cos(p.yaw) * reach - B.z) * k;
      if (B.jug) { B.vy -= GRAV * dt; B.y += B.vy * dt; if (B.y <= r) B.jug = false; }   // flicked up: it hangs in front of the carrier until it drops
      if (!B.jug) { B.y = r; B.vy = 0; }
      A.keepIn(B, r);
      B.vx = (B.x - ox) / dt; B.vz = (B.z - oz) / dt;
    } else {
      B.vy -= GRAV * dt;
      const drag = Math.exp(-0.1 * dt); B.vx *= drag; B.vz *= drag;
      B.x += B.vx * dt; B.y += B.vy * dt; B.z += B.vz * dt;
      if (B.y < r) {
        B.y = r;
        if (B.vy < -1.8) { B.hit = -B.vy * 0.6; B.vy *= -0.62; B.vx *= 0.88; B.vz *= 0.88; }
        else { B.vy = 0; const sp = Math.hypot(B.vx, B.vz); if (sp > 0) { const f = Math.max(0, sp - (1.2 + 0.12 * sp) * dt) / sp; B.vx *= f; B.vz *= f; } }
      }
      const sx = B.x < 0 ? -1 : 1, GW = A.GOAL_W, GH = A.GOAL_H;
      if (B.inGoal) {                           // inside the net: it soaks up the ball
        const s = B.inGoal, depth = B.x * s - A.HL;
        if (depth > NET - r) { B.x = s * (A.HL + NET - r); B.vx *= -0.1; B.vz *= 0.5; B.vy *= 0.5; }
        if (Math.abs(B.z) > GW - r) { B.z = Math.sign(B.z) * (GW - r); B.vz *= -0.1; B.vx *= 0.5; }
        if (B.y > GH - r) { B.y = GH - r; B.vy = -Math.abs(B.vy) * 0.1; }
        if (B.scored && depth < r) { B.x = s * (A.HL + r); B.vx = 0; }   // a scored ball stays in the net
        else if (depth < -r) B.inGoal = 0;
        else if (depth > r && !B.scored) { B.scored = true; goal = s; }
      } else {
        if (B.y < GH) for (const zs of [-1, 1]) {   // posts
          const c = circle(B.x, B.z, B.vx, B.vz, sx * A.HL, zs * GW, r + POST);
          if (c) { [B.x, B.z, B.vx, B.vz] = c; B.hit = 6; }
        }
        if (Math.abs(B.z) < GW) {                   // crossbar
          const c = circle(B.x, B.y, B.vx, B.vy, sx * A.HL, GH, r + POST);
          if (c) { [B.x, B.y, B.vx, B.vy] = c; B.hit = 6; }
        }
        const ax = Math.abs(B.x), open = Math.abs(B.z) < GW && B.y < GH;
        if (open && ax > A.HL) B.inGoal = sx;
        else if (!open && ax > A.HL - r) wall(-sx, 0, ax - (A.HL - r));
        const az = Math.abs(B.z); if (az > A.HW - r) wall(0, -Math.sign(B.z), az - (A.HW - r));
        const d = Math.abs(B.x) + Math.abs(B.z) - (A.HL + A.HW - A.CUT - r * 1.4142);
        if (d > 0 && !open) wall(-Math.sign(B.x) * 0.7071, -Math.sign(B.z) * 0.7071, d * 0.7071);
        for (const p of players) {                  // first touch
          if (B.cool > 0 && p === B.kicker) continue;
          if (p.downT > 0 || p.slideT > 0) continue;
          const hands = Player.keeping(p);                      // goalies use their hands inside their own penalty arc
          if (B.hyped && !hands) continue;                       // nobody outfield gets in the way of a Hype Shot
          if (B.y > (hands ? (p.diveT > 0 ? 2.4 : 2.1) : 1.0) || Math.hypot(p.x - B.x, p.z - B.z) > (hands ? (p.diveT > 0 ? 1.55 : 0.95) * (p.team ? AI.skill : 1) : 0.85)) continue;
          const rel = Math.hypot(B.vx - p.vx, B.vz - p.vz);
          if (p.fakeT > 0 && B.kicker && B.kicker.team !== p.team && B.y < 0.5) { B.nutmeg = true; B.cool = 0.4; p.downT = 0.5; p.fakeT = 0; break; }   // through a wrong-footed defender's legs
          if (B.hyped) { B.cool = 0.4; B.kicker = p; if (Math.random() < 0.25) { B.vx *= -0.3; B.vz += Math.random() < 0.5 ? -6 : 6; B.vy = 4; B.hyped = false; } break; }
          if (hands && rel > 19) {                              // hard shot: parried away or fumbled, not caught
            B.cool = 0.35; B.kicker = p;
            if (Math.random() < (p.diveT > 0 ? 0.92 : 0.75) * (p.team ? AI.skill : 1)) { B.vx *= -0.3; B.vz = B.vz * 0.4 + (Math.random() < 0.5 ? -5 : 5); B.vy = 3; B.hit = 5; }
          } else if (!hands && p.sprinting && rel > 15) { B.vx *= -0.35; B.vz *= -0.35; B.vy = 3; B.cool = 0.35; B.kicker = p; }
          else { B.owner = p; B.passTo = null; B.runTo = null; }
          break;
        }
      }
    }
    const dx = B.x - ox, dz = B.z - oz, d = Math.hypot(dx, dz);
    if (d > 1e-5) { const a = Math.atan2(dx, dz); B.rot = M.chain(M.RY(a), M.RX(d / r), M.RY(-a), B.rot); }
    return goal;
  };

  B.draw = () => {
    const s = Math.max(0.5, 1.5 - B.y * 0.25) * B.R * 2.4;
    R.box(M.chain(M.T(B.x, 0.035, B.z), M.S(s, 0.01, s)), 15);
    if (B.hyped) for (let i = 1; i < 6; i++) { const k = i * 0.012, q = B.R * (2.4 - i * 0.3); R.box(M.chain(M.T(B.x - B.vx * k, B.y - B.vy * k, B.z - B.vz * k), B.rot, M.S(q, q, q)), i % 2 ? BLACK : WHITE); }   // Hype Shot trail
    R.draw(mesh, M.chain(M.T(B.x, B.y, B.z), B.rot, M.S(B.R, B.R, B.R)));
  };
  return B;
})();
