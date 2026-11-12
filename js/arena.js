'use strict';
// Seven venues around the same cage: Under the Tracks, Rooftop Nights (night), Pier 9, Parkside, and night versions of the three day courts.
// The cage size follows the match size (Arena.set).
// Court axes: x runs goal to goal (home attacks +x), z runs across (camera sits on the +z side).
const Arena = (() => {
  const A = { HL: 16.5, HW: 9.9, CUT: 2, GOAL_W: 1.5, GOAL_H: 1.8, BOARD: 1.0, FENCE: 4.2, scale: 1, venue: 0,
    VENUES: ['UNDER THE TRACKS', 'ROOFTOP NIGHTS', 'PIER 9', 'PARKSIDE', 'TRACKS AFTER DARK', 'PIER 9 MIDNIGHT', 'PARKSIDE LATE'] };   // 4-6 are the night versions of 0, 2, 3
  const WHITE = 9.97, MAT = { ground: 0, court: 23, net: 24, graffiti: 25, fence: 26, metal: 6, board: 7, stone: 19 };
  let mesh;

  // cage outline, clockwise from the far-left corner; each side knows if it faces the camera
  function sides() {
    const { HL, HW, CUT: C, GOAL_W: G } = A, S = [];
    const add = (p, q, o = {}) => S.push({ p, q, ...o });
    add([-HL + C, -HW], [HL - C, -HW]);                       // far side
    add([HL - C, -HW], [HL, -HW + C]);
    add([HL, -HW + C], [HL, -G]); add([HL, -G], [HL, G], { goal: 1 }); add([HL, G], [HL, HW - C]);
    add([HL, HW - C], [HL - C, HW], { near: 1 });
    add([HL - C, HW], [-HL + C, HW], { near: 1 });            // near side: boards only, so the camera sees in
    add([-HL + C, HW], [-HL, HW - C], { near: 1 });
    add([-HL, HW - C], [-HL, G]); add([-HL, G], [-HL, -G], { goal: 1 }); add([-HL, -G], [-HL, -HW + C]);
    add([-HL, -HW + C], [-HL + C, -HW]);
    return S;
  }

  // court size (1 = 33 x 19.8 m) and venue; rebuilds the scene when either changes
  A.set = (scale, venue) => {
    if (mesh && scale === A.scale && venue === A.venue) return;
    A.scale = scale; A.venue = venue; A.HL = 16.5 * scale; A.HW = 9.9 * scale;
    R.court = A.HL; R.night = venue === 1 || venue > 3 ? 1 : 0;
    A.build();
  };

  function lights(b) {                          // night courts: floodlight poles at the far corners and a string of bulbs along the far fence
    const { HL, HW, FENCE } = A;
    for (const sx of [-1, 1]) {
      const x = sx * (HL + 0.9), z = -(HW + 0.5);
      Geo.beam(b, [x, 0, z], [x, 4.7, z], 0.16, MAT.metal); Geo.obox(b, x - sx * 0.5, z, Math.PI / 2, 0.7, 0.22, 4.45, 4.8, WHITE);
    }
    for (let x = -HL + 2.4; x <= HL - 2.4; x += 1.6) Geo.obox(b, x, -HW, 0, 0.07, 0.07, FENCE + 0.08, FENCE + 0.24, WHITE);
  }
  function tracks(b) {                          // an elevated train line on stone piers, city blocks behind
    const { HL, HW } = A, TZ = -(HW + 9), TY = 7.6, TW = 7;
    Geo.floor(b, -400, -400, 400, 400, -0.06, MAT.ground);
    Geo.obox(b, 0, TZ, Math.PI / 2, 200, TW / 2, TY, TY + 0.7, 10, 21 + TW / 100, 21 + TW / 100);
    for (let x = -98; x <= 98; x += 14) {
      for (const z of [TZ - 3, TZ + 3]) Geo.obox(b, x, z, 0, 0.35, 0.35, 0, TY, MAT.stone);
      Geo.beam(b, [x, TY - 0.4, TZ - 3.4], [x, TY - 0.4, TZ + 3.4], 0.5, MAT.metal, 0.7);
    }
    let k = 0;
    for (let x = -96; x < 96;) { const w = 12 + (k * 7) % 11, h = 11 + (k * 13) % 14; Geo.obox(b, x + w / 2, TZ - 17, Math.PI / 2, w / 2, 7, 0, h, 2 + ((k * 37) % 90) / 100, 3 + ((k * 53) % 90) / 100); x += w + (k % 3 ? 0 : 5); k++; }
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) Geo.obox(b, sx * (HL + 19.5), -8 + i * 17, 0, 8, 7, 0, 9 + ((i + (sx > 0 ? 1 : 0)) * 5) % 9, 2 + (0.2 + i * 0.27), 3.6);
  }
  function rooftop(b) {                         // night: the cage sits on a roof, lit by lamps, with lit windows all around
    const { HL, HW, FENCE } = A, X = HL + 8, Z0 = -(HW + 11), Z1 = HW + 8;
    Geo.floor(b, -400, -400, 400, 400, -40, MAT.ground);
    Geo.obox(b, 0, (Z0 + Z1) / 2, Math.PI / 2, X, (Z1 - Z0) / 2, -40, -0.06, 2.4, 3.6);
    for (const [p, q] of [[[-X, Z0], [X, Z0]], [[X, Z0], [X, Z1]], [[-X, Z1], [-X, Z0]]]) Geo.wall(b, p, q, -0.06, 0.8, 0.35, MAT.board);
    let k = 0;                                  // neighbouring buildings: lower roofs and a few taller walls of windows
    for (let x = -90; x < 90;) { const w = 11 + (k * 7) % 9, h = [-7, 5, -3, 9, -10, 3][k % 6]; Geo.obox(b, x + w / 2, Z0 - 9, Math.PI / 2, w / 2, 6, -40, h, 2 + ((k * 37) % 90) / 100, 3 + ((k * 53) % 90) / 100); x += w + 2; k++; }
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) Geo.obox(b, sx * (X + 9), -22 + i * 16, 0, 7, 7, -40, [4, -5, 7][(i + (sx > 0 ? 1 : 0)) % 3], 2.3 + i * 0.2, 3.5);
    lights(b);
    const wx = -HL * 0.55, wz = -(HW + 7.2);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) Geo.beam(b, [wx + dx * 1.2, 0, wz + dz * 1.2], [wx + dx * 1.2, 2.4, wz + dz * 1.2], 0.14, MAT.metal);
    Geo.obox(b, wx, wz, 0, 1.6, 1.6, 2.4, 5.4, MAT.stone, MAT.stone, MAT.stone);
    for (let i = 0; i < 5; i++) Geo.obox(b, HL * 0.15 + i * 3.4, -(HW + 6.4 + (i % 2) * 1.6), Math.PI / 2, 0.8, 0.55, 0, 0.9 + (i % 3) * 0.25, MAT.board);   // vents
  }
  function pier(b) {                            // a plank pier over the water, stacked containers and bollards
    const { HL, HW } = A, X = HL + 7, Z0 = -(HW + 10), Z1 = HW + 7;
    Geo.floor(b, -400, -400, 400, 400, -1.3, 5);
    Geo.obox(b, 0, (Z0 + Z1) / 2, Math.PI / 2, X, (Z1 - Z0) / 2, -1.3, -0.06, MAT.stone, 16);
    for (let x = -X + 1; x <= X - 1; x += 4.5) Geo.obox(b, x, Z0 + 0.6, 0, 0.28, 0.28, 0, 0.75, MAT.stone, MAT.ground);
    for (const sx of [-1, 1]) for (let z = Z0 + 3; z <= Z1 - 1; z += 4.5) Geo.obox(b, sx * (X - 0.6), z, 0, 0.28, 0.28, 0, 0.75, MAT.stone, MAT.ground);
    const mats = [MAT.board, MAT.metal, MAT.stone, MAT.board, MAT.stone, MAT.metal]; let k = 0;
    for (let x = -HL - 2; x < HL - 2; x += 6.6) {  // containers, some stacked two high
      Geo.obox(b, x + 3, -(HW + 6.2), Math.PI / 2, 3.03, 1.22, 0, 2.6, mats[k % 6]);
      if (k % 3 !== 1) Geo.obox(b, x + 3.6, -(HW + 6.2), Math.PI / 2, 3.03, 1.22, 2.6, 5.2, mats[(k + 2) % 6]);
      k++;
    }
    for (const sx of [-1, 1]) Geo.sheet(b, [sx * (HL + 5.5), -(HW + 9)], [sx * (HL + 5.5), -(HW + 4)], 0, 14, 10);   // crane legs
  }
  function park(b) {                            // grass, a white path round the cage, trees and bushes
    const { HL, HW } = A;
    Geo.floor(b, -400, -400, 400, 400, -0.1, 4);
    Geo.floor(b, -HL - 4.2, -HW - 4.6, HL + 4.2, HW + 4, -0.06, 11);
    Geo.floor(b, HL + 6, -HW - 2, HL + 13, HW - 6, -0.06, 14);
    let k = 0;
    for (let x = -HL - 9; x <= HL + 9; x += 4.6) {
      const z = -(HW + 6.6 + (k % 2) * 2.2), r = 1.5 + (k % 3) * 0.3;
      Geo.beam(b, [x, 0, z], [x, 2.6, z], 0.3, MAT.stone);
      Geo.obox(b, x, z, 0.4 * k, r, r, 2.1, 5.6, 18 + ((k * 17) % 60) / 100, 18 + ((k * 17) % 60) / 100, 18.3);
      if (k % 2) Geo.obox(b, x + 2.3, -(HW + 5.2), 0, 0.6, 1.1, 0, 1.0, 18 + ((k * 29) % 60) / 100);
      k++;
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const x = sx * (HL + 6.5 + (i % 2) * 2), z = -HW + 3 + i * 6; Geo.beam(b, [x, 0, z], [x, 2.6, z], 0.3, MAT.stone); Geo.obox(b, x, z, i, 1.6, 1.6, 2.1, 5.4, 18.2 + i * 0.1, 18.2 + i * 0.1, 18.3); }
  }

  A.build = () => {
    const b = new Geo.Buf(), { HL, HW, GOAL_W: G, GOAL_H: GH, BOARD, FENCE } = A;
    if (mesh) { R.gl.deleteBuffer(mesh.vbo); R.bound = null; }
    [tracks, rooftop, pier, park, tracks, pier, park][A.venue](b);
    if (A.venue > 3) lights(b);
    Geo.floor(b, -HL, -HW, HL, HW, 0, MAT.court);
    for (const s of sides()) {
      const y0 = s.goal ? GH : BOARD;
      if (!s.goal) Geo.wall(b, s.p, s.q, 0, BOARD, 0.16, MAT.board);
      if (!s.near) {
        Geo.sheet(b, s.p, s.q, y0, FENCE, MAT.fence);
        Geo.beam(b, [s.p[0], FENCE, s.p[1]], [s.q[0], FENCE, s.q[1]], 0.1, MAT.metal);
        const L = Math.hypot(s.q[0] - s.p[0], s.q[1] - s.p[1]), n = Math.max(1, Math.round(L / 3.25));
        for (let i = 0; i <= n; i++) { const t = i / n, x = s.p[0] + (s.q[0] - s.p[0]) * t, z = s.p[1] + (s.q[1] - s.p[1]) * t; if (!s.goal) Geo.beam(b, [x, 0, z], [x, FENCE, z], 0.1, MAT.metal); }
      }
    }
    for (const sx of [-1, 1]) {                               // goals: white frame, black net box behind
      const x = sx * HL, bx = sx * (HL + 1.3);
      Geo.floor(b, Math.min(x, bx), -G, Math.max(x, bx), G, 0, MAT.court);   // dark floor inside the goal so the frame stands out
      for (const z of [-G, G]) {
        Geo.beam(b, [x, 0, z], [x, GH, z], 0.14, WHITE);
        Geo.sheet(b, [x, z], [bx, z], 0, GH, MAT.net);
      }
      Geo.beam(b, [x, GH, -G - 0.07], [x, GH, G + 0.07], 0.14, WHITE);
      Geo.sheet(b, [bx, -G], [bx, G], 0, GH, MAT.net);
      Geo.quad(b, [x, GH, -G], [bx, GH, -G], [bx, GH, G], [x, GH, G], [0, 1, 0], [0, 0, 1.3, 0, 1.3, 2 * G, 0, 2 * G], MAT.net);
    }
    mesh = b.mesh();
  };
  A.draw = () => R.draw(mesh);

  // keep a circle of radius r inside the cage; returns true if it touched a wall
  A.keepIn = (o, r) => {
    const mx = A.HL - r, mz = A.HW - r, md = A.HL + A.HW - A.CUT - r * 1.4142; let hit = false;
    if (o.x > mx) { o.x = mx; if (o.vx > 0) o.vx = 0; hit = true; } else if (o.x < -mx) { o.x = -mx; if (o.vx < 0) o.vx = 0; hit = true; }
    if (o.z > mz) { o.z = mz; if (o.vz > 0) o.vz = 0; hit = true; } else if (o.z < -mz) { o.z = -mz; if (o.vz < 0) o.vz = 0; hit = true; }
    const d = Math.abs(o.x) + Math.abs(o.z) - md;
    if (d > 0) { const sx = Math.sign(o.x), sz = Math.sign(o.z); o.x -= sx * d / 2; o.z -= sz * d / 2; const vn = (o.vx * sx + o.vz * sz) / 2; if (vn > 0) { o.vx -= sx * vn; o.vz -= sz * vn; } hit = true; }
    return hit;
  };
  return A;
})();
