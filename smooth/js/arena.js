'use strict';
// Ten venues around the same cage: Under the Tracks, Rooftop Nights (night), Pier 9, Parkside, night versions of the three day courts,
// then La Playa (beach), Schoolyard and El Barrio (night, houses stacked up a hill).
// The cage size follows the match size (Arena.set).
// Court axes: x runs goal to goal (home attacks +x), z runs across (camera sits on the +z side).
const Arena = (() => {
  const A = { HL: 16.5, HW: 9.9, CUT: 2, GOAL_W: 1.5, GOAL_H: 1.8, BOARD: 1.0, FENCE: 4.2, scale: 1, venue: 0,
    VENUES: ['UNDER THE TRACKS', 'ROOFTOP NIGHTS', 'PIER 9', 'PARKSIDE', 'TRACKS AFTER DARK', 'PIER 9 MIDNIGHT', 'PARKSIDE LATE', 'LA PLAYA', 'SCHOOLYARD', 'EL BARRIO'], NIGHT: [1, 4, 5, 6, 9] };   // 4-6 are the night versions of 0, 2, 3
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
    R.court = A.HL; R.night = A.NIGHT.includes(venue) ? 1 : 0;
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

  function playa(b) {                           // a cage on the sand: the sea behind, palms, a boardwalk and a lifeguard tower
    const { HL, HW } = A, SEA = -(HW + 10.5);
    Geo.floor(b, -400, -400, 400, 400, -0.1, 14);
    Geo.floor(b, -400, -400, 400, SEA, -0.08, 5);
    Geo.floor(b, -HL - 30, -(HW + 9.6), HL + 30, -(HW + 7.6), -0.05, 16);              // boardwalk along the far fence
    let k = 0;
    for (let x = -HL - 10; x <= HL + 10; x += 5.8) {                                     // palms: a leaning trunk and a flat crown
      const z = -(HW + 2.6 + (k % 3) * 1.5), h = 3.1 + (k % 2) * 0.8, lx = x + ((k % 3) - 1) * 0.9;
      Geo.beam(b, [x, 0, z], [lx, h, z], 0.26, MAT.stone);
      for (const a of [0, 0.8, 1.6, 2.4]) Geo.obox(b, lx, z, a + k, 1.9, 0.3, h - 0.15, h + 0.3, 18 + ((k * 17) % 60) / 100, 18.3);
      k++;
    }
    const tx = HL * 0.45, tz = -(HW + 5.6);                                              // lifeguard tower
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) Geo.beam(b, [tx + dx, 0, tz + dz], [tx + dx, 2.2, tz + dz], 0.14, MAT.metal);
    Geo.obox(b, tx, tz, 0, 1.3, 1.3, 2.2, 2.4, MAT.board); Geo.obox(b, tx, tz, 0, 1.0, 1.0, 2.4, 3.9, WHITE, MAT.metal);
    for (let i = 0; i < 6; i++) {                                                        // parasols on the sand
      const x = -HL - 6 + i * 7.3 + (i % 2) * 1.5, z = -(HW + 4.4 + (i % 2) * 1.6);
      Geo.beam(b, [x, 0, z], [x, 1.9, z], 0.07, MAT.metal); Geo.obox(b, x, z, i, 1.15, 1.15, 1.85, 2.05, 17, i % 2 ? WHITE : MAT.metal);
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const x = sx * (HL + 6 + (i % 2) * 2.4), z = -HW + 2 + i * 6.5, h = 4.8 + i * 0.5; Geo.beam(b, [x, 0, z], [x - sx * 0.8, h, z], 0.26, MAT.stone); for (const a of [0.3, 1.1, 1.9, 2.7]) Geo.obox(b, x - sx * 0.8, z, a, 2.2, 0.34, h - 0.15, h + 0.3, 18.2 + i * 0.1, 18.3); }
  }
  function school(b) {                          // a schoolyard: the school building behind, a running track, bleachers and hoops
    const { HL, HW } = A, BZ = -(HW + 15);
    Geo.floor(b, -400, -400, 400, 400, -0.1, MAT.ground);
    Geo.floor(b, -HL - 30, -(HW + 5.6), HL + 30, -(HW + 2.4), -0.06, 13);              // running track along the far side
    Geo.obox(b, -HL * 0.3, BZ, Math.PI / 2, HL * 1.25, 5, 0, 9.5, 2.35, 3.4);            // main block and a lower gym wing
    Geo.obox(b, HL * 1.25, BZ + 1.5, Math.PI / 2, HL * 0.42, 6.5, 0, 6.5, 2.7, 3.7);
    Geo.obox(b, -HL * 0.3, BZ + 5.4, Math.PI / 2, 2.2, 0.6, 0, 3.2, MAT.board, MAT.stone);   // entrance porch
    for (const sx of [-1, 1]) {                                                          // bleachers either side of the door
      const cx = -HL * 0.3 + sx * HL * 0.62;
      for (let i = 0; i < 4; i++) Geo.obox(b, cx, -(HW + 7.4 + i * 0.75), Math.PI / 2, HL * 0.3, 0.38, 0, 0.45 + i * 0.45, MAT.board);
    }
    for (const sx of [-1, 1]) {                                                          // basketball hoops beside the cage
      const x = sx * (HL + 5.5);
      for (const z of [-HW + 2.5, HW - 6.5]) { Geo.beam(b, [x, 0, z], [x, 3.3, z], 0.14, MAT.metal); Geo.beam(b, [x, 3.3, z], [x - sx * 0.9, 3.3, z], 0.1, MAT.metal); Geo.obox(b, x - sx * 0.95, z, 0, 0.05, 0.9, 2.9, 3.95, WHITE, WHITE, WHITE); }
    }
    Geo.beam(b, [HL + 9, 0, -(HW + 7)], [HL + 9, 7.5, -(HW + 7)], 0.1, MAT.metal); Geo.obox(b, HL + 9.75, -(HW + 7), Math.PI / 2, 0.75, 0.03, 6.4, 7.4, 17);   // flag pole
    for (let i = 0; i < 4; i++) { const x = -HL - 16 + i * 4.4, z = -(HW + 8.5); Geo.beam(b, [x, 0, z], [x, 2.4, z], 0.28, MAT.stone); Geo.obox(b, x, z, i, 1.5, 1.5, 2.0, 5.0, 18 + i * 0.13, 18 + i * 0.13, 18.3); }
  }
  function barrio(b) {                          // night: small houses stacked up a hillside, steps between them, lit windows
    const { HL, HW } = A;
    Geo.floor(b, -400, -400, 400, 400, -0.1, MAT.ground);
    for (let row = 0; row < 5; row++) {                                                  // each row sits higher and further back
      const z = -(HW + 6.5 + row * 5.2), base = row * 2.5; let k = row * 3;
      Geo.obox(b, 0, z - 2.6, Math.PI / 2, 120, 2.7, -1, base, MAT.stone);               // terrace the row stands on
      for (let x = -HL - 26 + (row % 2) * 2.6; x < HL + 26;) {
        const w = 3.6 + (k * 7) % 4, h = 2.7 + ((k * 5) % 3) * 1.25;
        if (k % 6 === 4) { Geo.obox(b, x + 0.7, z - 0.4, Math.PI / 2, 0.7, 2.3, base - 2.5, base + 0.12, MAT.board); x += 1.6; }   // steps up to the next row
        else { Geo.obox(b, x + w / 2, z - 2.3, Math.PI / 2, w / 2, 2.1, base, base + h, 2 + ((k * 37) % 90) / 100, 3 + ((k * 53) % 90) / 100); if (k % 4 === 1) Geo.obox(b, x + w / 2, z - 2.3, 0, 0.5, 0.5, base + h, base + h + 0.9, MAT.metal); x += w + 0.25; }
        k++;
      }
    }
    for (let i = 0; i < 6; i++) { const x = -HL - 7 + i * (HL * 2 + 14) / 5, z = -(HW + 3.6); Geo.beam(b, [x, 0, z], [x, 5.6, z], 0.12, MAT.metal); if (i < 5) Geo.beam(b, [x, 5.3, z], [x + (HL * 2 + 14) / 5, 5.3, z], 0.04, MAT.metal); }   // poles and wires
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) Geo.obox(b, sx * (HL + 8.5 + i * 0.8), -HW + 3 + i * 6.2, 0, 2.6, 2.6, 0, 3.4 + ((i + (sx > 0 ? 1 : 0)) % 3) * 1.3, 2.3 + i * 0.2, 3.5);
    lights(b);
  }

  A.build = () => {
    const b = new Geo.Buf(), { HL, HW, GOAL_W: G, GOAL_H: GH, BOARD, FENCE } = A;
    if (mesh) { R.gl.deleteBuffer(mesh.vbo); R.bound = null; }
    [tracks, rooftop, pier, park, tracks, pier, park, playa, school, barrio][A.venue](b);
    if (A.venue > 3 && A.venue < 7) lights(b);
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
