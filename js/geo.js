'use strict';
// Geometry helpers shared by the arena builder (taken from the skate game's world.js).
const Geo = (() => {
  class Buf {                                  // growable vertex buffer: pos3, normal3, uv2, material
    constructor() { this.a = new Float32Array(4096); this.n = 0; }
    v(x, y, z, nx, ny, nz, u, v, m) {
      if (this.n + 9 > this.a.length) { const b = new Float32Array(this.a.length * 2); b.set(this.a); this.a = b; }
      const a = this.a, n = this.n; a[n] = x; a[n + 1] = y; a[n + 2] = z; a[n + 3] = nx; a[n + 4] = ny; a[n + 5] = nz; a[n + 6] = u; a[n + 7] = v; a[n + 8] = m; this.n = n + 9;
    }
    mesh() { const m = R.mesh(this.a.subarray(0, this.n)); this.a = null; return m; }
  }
  function quad(b, p0, p1, p2, p3, n, uv, m) {   // uv = [u0,v0,u1,v1,u2,v2,u3,v3]
    const P = [p0, p1, p2, p0, p2, p3], U = [0, 1, 2, 0, 2, 3];
    for (let i = 0; i < 6; i++) b.v(P[i][0], P[i][1], P[i][2], n[0], n[1], n[2], uv[U[i] * 2], uv[U[i] * 2 + 1], m);
  }
  // flat rectangle on the ground, uv = world metres (u along x from x0, v along z from zc)
  function floor(b, x0, z0, x1, z1, y, m, zc = 0) {
    quad(b, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0], [0, z0 - zc, x1 - x0, z0 - zc, x1 - x0, z1 - zc, 0, z1 - zc], m);
  }
  // oriented box: axis = (sin a, cos a), from y0 to y1. sides get uv = (metres along, metres below top)
  function obox(b, cx, cz, ang, hl, hw, y0, y1, m, top = m, bottom) {
    const ax = Math.sin(ang), az = Math.cos(ang), lx = az, lz = -ax;
    const c = (l, w) => [cx + ax * l + lx * w, cz + az * l + lz * w];
    const k = [c(-hl, -hw), c(hl, -hw), c(hl, hw), c(-hl, hw)], h = y1 - y0;
    quad(b, [k[0][0], y1, k[0][1]], [k[1][0], y1, k[1][1]], [k[2][0], y1, k[2][1]], [k[3][0], y1, k[3][1]], [0, 1, 0], [0, 0, 2 * hl, 0, 2 * hl, 2 * hw, 0, 2 * hw], top);
    if (bottom !== undefined) quad(b, [k[0][0], y0, k[0][1]], [k[1][0], y0, k[1][1]], [k[2][0], y0, k[2][1]], [k[3][0], y0, k[3][1]], [0, -1, 0], [0, 0, 2 * hl, 0, 2 * hl, 2 * hw, 0, 2 * hw], bottom);
    for (let i = 0; i < 4; i++) {
      const p = k[i], q = k[(i + 1) % 4], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1;
      quad(b, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], [-dz / L, 0, dx / L], [0, h, L, h, L, 0, 0, 0], m);
    }
  }
  // wall box between two ground points
  function wall(b, p, q, y0, y1, th, m, top) {
    const dx = q[0] - p[0], dz = q[1] - p[1];
    obox(b, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, Math.atan2(dx, dz), Math.hypot(dx, dz) / 2, th / 2, y0, y1, m, top);
  }
  // thin upright sheet between two ground points, uv = (metres along, metres up)
  function sheet(b, p, q, y0, y1, m) {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    quad(b, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], [0, 1, 0], [0, y0, L, y0, L, y1, 0, y1], m);
  }
  // arbitrary beam between two 3D points
  let CUBE;
  function beam(b, p, q, th, m, th2) {
    CUBE = CUBE || R.cubeData();
    const M4 = M.limb(p, q, th, th2);
    for (let i = 0; i < CUBE.length; i += 9) {
      const x = CUBE[i], y = CUBE[i + 1], z = CUBE[i + 2], nx = CUBE[i + 3], ny = CUBE[i + 4], nz = CUBE[i + 5];
      const wx = M4[0] * nx + M4[4] * ny + M4[8] * nz, wy = M4[1] * nx + M4[5] * ny + M4[9] * nz, wz = M4[2] * nx + M4[6] * ny + M4[10] * nz;
      const l = Math.hypot(wx, wy, wz) || 1;
      b.v(M4[0] * x + M4[4] * y + M4[8] * z + M4[12], M4[1] * x + M4[5] * y + M4[9] * z + M4[13], M4[2] * x + M4[6] * y + M4[10] * z + M4[14], wx / l, wy / l, wz / l, CUBE[i + 6], CUBE[i + 7], m);
    }
  }
  return { Buf, quad, floor, obox, wall, sheet, beam };
})();
