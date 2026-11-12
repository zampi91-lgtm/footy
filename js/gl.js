'use strict';
// ---------- tiny matrix library (column-major 4x4) ----------
const M = {
  ident() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },
  chain(...m) { let o = m[0]; for (let i = 1; i < m.length; i++) o = M.mul(o, m[i]); return o; },
  T(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; },
  S(x, y, z) { return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]; },
  RX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
  RY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
  RZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  persp(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2);
    return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
  },
  look(e, t) {
    let fx = t[0] - e[0], fy = t[1] - e[1], fz = t[2] - e[2];
    let l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
    let sx = -fz, sy = 0, sz = fx;                 // f x up(0,1,0)
    l = Math.hypot(sx, sz) || 1; sx /= l; sz /= l;
    const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
    return [sx, ux, -fx, 0, sy, uy, -fy, 0, sz, uz, -fz, 0,
      -(sx * e[0] + sy * e[1] + sz * e[2]), -(ux * e[0] + uy * e[1] + uz * e[2]), fx * e[0] + fy * e[1] + fz * e[2], 1];
  },
  // box stretched between two points (a limb): unit cube -> from a to b with thickness th
  limb(a, b, th, th2) {
    let yx = b[0] - a[0], yy = b[1] - a[1], yz = b[2] - a[2];
    const len = Math.hypot(yx, yy, yz) || 1e-4; yx /= len; yy /= len; yz /= len;
    let rx = 1, ry = 0, rz = 0; if (Math.abs(yx) > 0.9) { rx = 0; rz = 1; }
    let zx = rx === 1 ? 0 : yy * rz - yz * ry, zy = 0, zz = 0;   // z = r x y ... computed generally below
    zx = ry * yz - rz * yy; zy = rz * yx - rx * yz; zz = rx * yy - ry * yx;
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    const xx = yy * zz - yz * zy, xy = yz * zx - yx * zz, xz = yx * zy - yy * zx;
    const t2 = th2 || th;
    return [xx * th, xy * th, xz * th, 0, yx * len, yy * len, yz * len, 0, zx * t2, zy * t2, zz * t2, 0,
      (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 1];
  },
};

// ---------- 1-bit WebGL renderer ----------
const R = {
  init(canvas) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: true });
    if (!gl) throw new Error('WebGL not available');
    R.gl = gl;
    const vs = `
attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aUvm;
uniform mat4 uVP, uModel; uniform float uMat;
varying vec3 vW, vN; varying vec2 vUv; varying float vMat, vDist;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz; vN = mat3(uModel) * aNrm; vUv = aUvm.xy;
  vMat = uMat >= 0.0 ? uMat : aUvm.z;
  gl_Position = uVP * w; vDist = gl_Position.w;
}`;
    const fs = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vW, vN; varying vec2 vUv; varying float vMat, vDist;
uniform vec3 uSun, uCam; uniform vec2 uFog; uniform float uTime, uInvert, uCourt, uNight;
float b2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer(vec2 a){ return b2(0.5 * a) * 0.25 + b2(a); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
// Every surface resolves to one of five flat tones (0, 1/4, 1/2, 3/4, 1). Each is a regular, calm dither
// pattern; detail is drawn as solid black / white marks anchored to the world, and only close to the camera.
void main(){
  float m = floor(vMat + 0.005), fr = fract(vMat + 0.005);
  vec3 n = normalize(vN);
  float l = 0.6 + 0.4 * max(dot(n, uSun), 0.0);
  float t = 0.5, fog = 1.0;
  float near = step(vDist, 26.0), mid = step(vDist, 70.0);
  if (m < 0.5) {                       // open ground between buildings: plain white (black at night)
    t = 1.0 - uNight;
  } else if (m < 1.5) {                // asphalt. uv = (metres along, metres from centre), fr*100 = half width
    float hw = fr * 100.0;
    t = 0.25;
    if (hw > 3.2 && abs(vUv.y) < 0.13 && mod(vUv.x, 8.0) < 4.0) t = 1.0;
  } else if (m < 2.5) {                // building wall. uv = (metres along wall, metres below roof line)
    t = clamp(floor((0.3 + 0.62 * fr) * l * 4.0 + 0.5) / 4.0, 0.25, 0.75);
    vec2 c = vec2(mod(vUv.x, 3.0), mod(vUv.y, 3.2));
    bool win = vDist < 150.0 && c.x > 0.9 && c.x < 2.3 && c.y > 0.9 && c.y < 2.4;
    float lit = hash(floor(vUv / vec2(3.0, 3.2)) + fr * 71.0);
    if (win) t = t > 0.6 ? 0.0 : (lit > 0.7 ? 1.0 : 0.0);
    if (vUv.y < 0.4 || vUv.x < 0.2) t = 0.0;
    if (uNight > 0.5) t = win && lit > 0.5 ? 1.0 : (vUv.y < 0.4 ? 0.25 : 0.0);   // night: dark walls, lit windows
  } else if (m < 3.5) {                // roof: light, with a few dark roof units
    t = fr > 0.45 ? 1.0 : 0.75;
    vec2 c = fract(vUv / 6.0 + fr * 13.0);
    if (mid > 0.5 && hash(floor(vUv / 6.0 + fr * 13.0)) > 0.74 && c.x > 0.3 && c.x < 0.56 && c.y > 0.3 && c.y < 0.56) t = 0.0;
    if (uNight > 0.5 && t > 0.1) t = 0.25;
  } else if (m < 4.5) {                // grass: light tone with small blade marks up close
    t = 0.75;
    vec2 c = vW.xz * 2.2, f = fract(c) - 0.5; float h = hash(floor(c));
    if (near > 0.5 && h > 0.62 && abs(f.x + (h - 0.8) * 1.2) < 0.045 && abs(f.y + (h - 0.8)) < 0.16) t = 0.0;
  } else if (m < 5.5) {                // water: black with drifting white wave dashes
    t = 0.0;
    if (sin(vW.z * 0.9 + uTime * 1.2 + sin(vW.x * 0.21 + uTime * 0.35) * 2.2) > 0.93) t = 1.0;
    fog = 0.5;
  } else if (m < 6.5) { t = n.y > 0.5 ? 0.25 : 0.0;             // dark metal
  } else if (m < 7.5) { t = n.y > 0.5 ? 1.0 : (l > 0.8 ? 0.25 : 0.0);   // skate concrete: white tops, dark sides
  } else if (m < 8.5) {                // far skyline, no fog
    t = 0.5; fog = 0.0;
    vec2 c = vec2(mod(vUv.x, 14.0), mod(vUv.y, 12.0));
    if (c.x > 5.0 && c.y > 5.0 && hash(floor(vUv / vec2(14.0, 12.0))) > 0.5) t = 1.0;
    if (vUv.x < 2.5) t = 0.0;
  } else if (m < 9.5) { t = fr * 1.02; fog = 0.0;               // flat tone (skater)
  } else if (m < 10.5) {               // steel truss lattice (see-through)
    vec2 c = fract(vUv / 4.0);
    float d = min(abs(c.x - c.y), abs(c.x + c.y - 1.0));
    if (d > 0.1 && c.y > 0.07 && c.y < 0.93 && c.x > 0.06) discard;
    t = 0.0;
  } else if (m < 11.5) { t = 1.0;       // park path
  } else if (m < 12.5) {               // court / skatepark slab: white with a dot grid up close
    t = 1.0;
    vec2 g = abs(fract(vW.xz / 1.5) - 0.5);
    if (near > 0.5 && max(g.x, g.y) < 0.014) t = 0.0;
  } else if (m < 13.5) { t = 0.5;       // running track
  } else if (m < 14.5) {               // sand
    t = 1.0; if (near > 0.5 && hash(floor(vW.xz * 4.0)) > 0.9) t = 0.0;
  } else if (m < 15.5) {               // blob shadow
    if (length(vUv) > 1.0 || mod(gl_FragCoord.x + gl_FragCoord.y, 2.0) < 1.0) discard;
    t = 0.0; fog = 0.0;
  } else if (m < 16.5) {               // pier planks
    t = 0.75; if (mid > 0.5 && mod(vW.x + vW.z * 0.3, 1.4) < 0.12) t = 0.0;
  } else if (m < 17.5) {               // beacon stripes
    t = step(0.5, fract(vW.y * 0.25 - uTime * 0.6)); fog = 0.0;
  } else if (m < 18.5) {               // foliage: leaf clumps fixed to the tree
    float base = n.y > 0.5 ? 0.5 : (l > 0.8 ? 0.5 : 0.25);
    t = base;
    float h = hash(floor(vUv * 5.5) + floor(fr * 40.0));
    if (vDist < 45.0) t = h > 0.8 ? 1.0 : (h < 0.2 ? 0.0 : base);
  } else if (m < 19.5) { t = l > 0.8 ? 0.5 : 0.25;              // stone / concrete piers
  } else if (m > 25.5) {               // chain-link fence (see-through). uv = metres
    vec2 c = fract(vUv / 0.85);
    if (min(abs(c.x - c.y), abs(c.x + c.y - 1.0)) > 0.075 - 0.02 * uNight) discard;
    t = uNight; fog = 0.0;
  } else if (m > 24.5) {               // graffiti wall panel. uv = metres
    float g = vnoise(vUv * 1.3 + fr * 50.0);
    t = g > 0.62 ? 1.0 : (g < 0.3 ? 0.0 : 0.5);
  } else if (m > 23.5) {               // goal net (see-through). uv = metres
    vec2 c = fract(vUv / 0.3);
    if (c.x > 0.2 && c.y > 0.2) discard;
    t = uNight; fog = 0.0;
  } else if (m > 22.5) {               // futbol court: dark slab with painted white lines (world-anchored, centre at origin)
    t = 0.25; fog = 0.0;
    float r = length(vW.xz), gr = length(vec2(abs(vW.x) - uCourt, vW.z));
    if (abs(vW.x) < 0.08 || abs(r - 3.0) < 0.08 || r < 0.22 || abs(gr - 4.5) < 0.08) t = 1.0;
  } else if (m > 21.5) {               // sidewalk. uv = (metres along, metres from road centre), fr*100 = outer edge
    float outer = fr * 100.0, e = abs(vUv.y);
    t = 1.0;
    if (mid > 0.5 && (e > outer - 0.16 || e < outer - 2.6)) t = 0.0;            // lot line and curb
    else if (near > 0.5 && mod(vUv.x, 1.8) < 0.07 && mod(gl_FragCoord.x + gl_FragCoord.y, 2.0) < 1.0) t = 0.0;   // slab joints
  } else if (m > 20.5) {               // elevated train deck: an open ladder of ties, rails and edge girders. uv = metres, fr*100 = width
    float w = fr * 100.0, v = abs(vUv.y - w * 0.5);
    bool tie = mod(vUv.x, 1.3) < 0.45, rail = abs(v - 0.8) < 0.13, girder = v > w * 0.5 - 0.4;
    if (!tie && !rail && !girder) discard;                 // open deck: you see through between the ties
    t = n.y > 0.0 && tie && !rail && !girder ? 1.0 : 0.0;   // white ties from above, a black ladder from below
  } else {                             // sky: white, hatched clouds, low sun
    vec3 d = normalize(vW - uCam);
    t = 1.0; fog = 0.0;
    if (d.y > 0.015) {
      vec2 p = d.xz / (d.y + 0.14) * 1.7 + vec2(uTime * 0.012, 0.0);
      float c = vnoise(p * vec2(0.8, 1.7)) + 0.5 * vnoise(p * vec2(1.9, 3.6) + 7.0);
      if (c > 1.0) t = mod(gl_FragCoord.y, 3.0) < 1.0 ? 0.0 : 1.0;
      if (c > 1.0 && c < 1.025) t = 0.0;
      float s = dot(d, normalize(vec3(-0.86, 0.2, 0.18)));
      if (s > 0.9965) t = s < 0.9972 ? 0.0 : 1.0;
    }
    if (uNight > 0.5) {                // night sky: black, stars and a moon
      t = 0.0;
      if (d.y > 0.0 && hash(floor(d.xz / (d.y + 0.25) * 70.0)) > 0.993) t = 1.0;
      if (dot(d, normalize(vec3(0.5, 0.42, -0.75))) > 0.9975) t = 1.0;
    }
  }
  if (uNight > 0.5 && ((m > 3.5 && m < 4.5) || (m > 10.5 && m < 11.5) || (m > 12.5 && m < 14.5) || (m > 15.5 && m < 16.5))) t = min(t, 0.25);   // grass, paths, sand and planks go dark at night
  t = mix(t, 1.0 - uNight, smoothstep(uFog.x, uFog.y, vDist) * fog);
  t = floor(t * 4.0 + 0.5) / 4.0;
  float o = step(bayer(gl_FragCoord.xy) + 0.03, t);
  gl_FragColor = vec4(vec3(abs(uInvert - o)), 1.0);
}`;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aNrm'); gl.bindAttribLocation(p, 2, 'aUvm');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    R.u = {};
    for (const n of ['uVP', 'uModel', 'uMat', 'uSun', 'uCam', 'uFog', 'uTime', 'uInvert', 'uCourt', 'uNight']) R.u[n] = gl.getUniformLocation(p, n);
    gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
    const s = [0.45, 0.8, 0.4], sl = Math.hypot(...s);
    gl.uniform3f(R.u.uSun, s[0] / sl, s[1] / sl, s[2] / sl);
    gl.clearColor(1, 1, 1, 1);
    R.identity = new Float32Array(M.ident());
    R.cube = R.mesh(R.cubeData());
    R.bound = null;
  },
  mesh(f32) {
    const gl = R.gl, vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, f32, gl.STATIC_DRAW);
    R.bound = null;
    return { vbo, n: f32.length / 9 };
  },
  cubeData() {                          // unit cube centred on origin, uv in 0..1 per face
    const o = [], F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const n of F) {
      const u = n[1] ? [1, 0, 0] : [0, 1, 0], v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]])
        o.push((n[0] + a * u[0] + b * v[0]) / 2, (n[1] + a * u[1] + b * v[1]) / 2, (n[2] + a * u[2] + b * v[2]) / 2, n[0], n[1], n[2], a, b, 9);
    }
    return new Float32Array(o);
  },
  begin(vp, time, fogA, fogB, invert, eye) {
    const gl = R.gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(R.u.uVP, false, new Float32Array(vp));
    gl.uniform1f(R.u.uTime, time); gl.uniform2f(R.u.uFog, fogA, fogB); gl.uniform1f(R.u.uInvert, invert ? 1 : 0);
    gl.uniform3f(R.u.uCam, eye[0], eye[1], eye[2]);
    gl.uniform1f(R.u.uCourt, R.court || 16.5); gl.uniform1f(R.u.uNight, R.night || 0);
    R.depth(false); R.box(M.mul(M.T(eye[0], eye[1], eye[2]), M.S(3000, 3000, 3000)), 20);   // sky
  },
  depth(on) { const gl = R.gl; if (on) { gl.enable(gl.DEPTH_TEST); gl.depthMask(true); } else { gl.disable(gl.DEPTH_TEST); gl.depthMask(false); } },
  draw(mesh, model, mat) {
    const gl = R.gl; if (!mesh || !mesh.n) return;
    if (R.bound !== mesh) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
      R.bound = mesh;
    }
    gl.uniformMatrix4fv(R.u.uModel, false, model ? new Float32Array(model) : R.identity);
    gl.uniform1f(R.u.uMat, mat === undefined ? -1 : mat);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
  },
  box(model, mat) { R.draw(R.cube, model, mat); },
};

// ---------- 5x7 pixel font ----------
const FONT = (() => {
  const src = {
    A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110', C: '01110 10001 10000 10000 10000 10001 01110',
    D: '11110 10001 10001 10001 10001 10001 11110', E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
    G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001', I: '01110 00100 00100 00100 00100 00100 01110',
    J: '00111 00010 00010 00010 00010 10010 01100', K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
    M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 11001 10101 10011 10001 10001 10001', O: '01110 10001 10001 10001 10001 10001 01110',
    P: '11110 10001 10001 11110 10000 10000 10000', Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
    S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100', U: '10001 10001 10001 10001 10001 10001 01110',
    V: '10001 10001 10001 10001 10001 01010 00100', W: '10001 10001 10001 10101 10101 11011 10001', X: '10001 10001 01010 00100 01010 10001 10001',
    Y: '10001 10001 01010 00100 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
    0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110', 2: '01110 10001 00001 00010 00100 01000 11111',
    3: '11110 00001 00001 01110 00001 00001 11110', 4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
    6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000', 8: '01110 10001 10001 01110 10001 10001 01110',
    9: '01110 10001 10001 01111 00001 00010 01100', ' ': '00000 00000 00000 00000 00000 00000 00000', '.': '00000 00000 00000 00000 00000 00000 00100',
    ',': '00000 00000 00000 00000 00000 00100 01000', '!': '00100 00100 00100 00100 00100 00000 00100', '?': '01110 10001 00001 00010 00100 00000 00100',
    '-': '00000 00000 00000 11111 00000 00000 00000', '+': '00000 00100 00100 11111 00100 00100 00000', ':': '00000 00100 00000 00000 00000 00100 00000',
    "'": '00100 00100 00000 00000 00000 00000 00000', '/': '00001 00001 00010 00100 01000 10000 10000', '&': '01100 10010 10100 01000 10101 10010 01101',
    '>': '01000 00100 00010 00001 00010 00100 01000', '<': '00010 00100 01000 10000 01000 00100 00010', '*': '00000 10101 01110 11111 01110 10101 00000',
    '(': '00010 00100 01000 01000 01000 00100 00010', ')': '01000 00100 00010 00010 00010 00100 01000', '=': '00000 00000 11111 00000 11111 00000 00000',
  };
  const g = {};
  for (const k in src) g[k] = src[k].split(' ').map(r => parseInt(r, 2));
  return {
    width(s, sc = 1) { return s.length * 6 * sc - sc; },
    draw(ctx, s, x, y, sc = 1) {         // uses current fillStyle
      s = String(s).toUpperCase();
      for (let i = 0; i < s.length; i++) {
        const gl = g[s[i]] || g['?'];
        for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++)
          if (gl[r] & (16 >> c)) ctx.fillRect(x + (i * 6 + c) * sc, y + r * sc, sc, sc);
      }
    },
  };
})();
