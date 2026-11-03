/* ICAV SPI — "Hangar": interactive 3D view of the team's CAD (assets/models/icav-spi.glb).
   Self-contained WebGL2: no libraries. Orbit / zoom / presets, exploded view,
   hidden-line blueprint mode, a time-of-day sun, and solar cells on the wing. */
(() => {
  'use strict';
  const stage = document.querySelector('[data-hangar]');
  if (!stage) return;
  const canvas = stage.querySelector('canvas');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const NAMES = { 'part-1312': 'Wing', 'part-1311': 'Pod and boom', 'part-1309': 'Motor and spinner', 'part-1313': 'Payload fairing', 'part-1310': 'Tailplane', 'part-1314': 'Fin' };

  /* ---------- tiny mat4 helpers (column-major) ---------- */
  const M4 = {
    mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
    look(eye, at, up) {
      const z = norm(sub(eye, at)), x = norm(cross(up, z)), y = cross(z, x);
      return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
    },
    apply(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  /* ---------- GLB loader ---------- */
  async function loadGLB(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('not a GLB');
    const jsonLen = dv.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
    const binStart = 20 + jsonLen + 8;
    const read = i => {
      const a = json.accessors[i], v = json.bufferViews[a.bufferView];
      const n = { SCALAR: 1, VEC3: 3 }[a.type] * a.count;
      const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
      return { data: new T(buf, binStart + (v.byteOffset || 0) + (a.byteOffset || 0), n), min: a.min, max: a.max };
    };
    return { json, read };
  }

  /* ---------- shaders ---------- */
  const VS = `#version 300 es
  in vec3 aPos; in vec3 aNor;
  uniform mat4 uModel, uVP; uniform vec3 uOffset;
  out vec3 vWorld; out vec3 vNor; out vec3 vLocal;
  void main(){ vLocal = aPos; vec4 w = uModel * vec4(aPos, 1.0); w.xyz += uOffset; vWorld = w.xyz;
    vNor = mat3(uModel) * aNor; gl_Position = uVP * w; }`;
  const FS = `#version 300 es
  precision highp float;
  in vec3 vWorld; in vec3 vNor; in vec3 vLocal; out vec4 outColor;
  uniform vec3 uColor, uSun, uSunCol, uSky, uGround, uEye; uniform float uSolar, uDim, uFlat, uHi;
  vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
  void main(){
    if (uFlat > 0.5) { outColor = vec4(uColor, 1.0); return; }
    vec3 n = normalize(vNor); vec3 v = normalize(uEye - vWorld); if (dot(n, v) < 0.0) n = -n;
    vec3 base = lin(uColor); float spec = 0.18, shin = 36.0;
    if (uSolar > 0.5 && n.z > 0.3) {
      vec2 g = abs(fract(vLocal.xy / 0.125) - 0.5);
      float gap = smoothstep(0.465, 0.49, max(g.x, g.y));
      float finger = smoothstep(0.47, 0.5, abs(fract(vLocal.y / 0.0156) - 0.5)) * 0.25;
      base = mix(lin(vec3(0.04, 0.09, 0.22)) + finger * 0.04, lin(vec3(0.7, 0.74, 0.8)), gap * 0.55);
      spec = 1.1; shin = 120.0;
    }
    float ndl = max(dot(n, uSun), 0.0);
    vec3 h = normalize(uSun + v);
    vec3 amb = mix(uGround, uSky, n.z * 0.5 + 0.5);
    vec3 col = base * (amb * 0.62 + uSunCol * ndl * 1.05) + uSunCol * spec * pow(max(dot(n, h), 0.0), shin) * ndl;
    col += uSky * pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.22;
    col += vec3(1.0, 0.75, 0.3) * uHi * 0.18;
    col = mix(col, vec3(dot(col, vec3(0.33))) * 0.35, uDim);
    col = col / (col + 0.7) * 1.55;
    outColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
  }`;
  const GVS = `#version 300 es
  in vec2 aXY; uniform mat4 uVP; uniform vec3 uC; uniform float uS; out vec2 vXY;
  void main(){ vXY = aXY; gl_Position = uVP * vec4(uC + vec3(aXY * uS, 0.0), 1.0); }`;
  const GFS = `#version 300 es
  precision highp float; in vec2 vXY; out vec4 o; uniform float uBlue; uniform float uShadow; uniform vec2 uShift;
  void main(){
    float r = length(vXY);
    if (uBlue > 0.5) {
      vec2 g = abs(fract(vXY * 18.0) - 0.5); float line = 1.0 - smoothstep(0.0, 0.035, min(g.x, g.y));
      float a = line * 0.32 * (1.0 - smoothstep(0.35, 1.0, r));
      o = vec4(0.5, 0.84, 1.0, a); return;
    }
    vec2 q = (vXY - uShift) * vec2(0.55, 2.4);
    float s = exp(-dot(q, q) * 7.0) * 0.38 * uShadow;
    o = vec4(0.0, 0.0, 0.0, s);
  }`;

  function compile(gl, vs, fs) {
    const p = gl.createProgram();
    for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  }

  /* ---------- state ---------- */
  const ui = {
    status: stage.querySelector('[data-hangar-status]'),
    legend: stage.querySelector('[data-hangar-legend]'),
    span: stage.querySelector('[data-hangar-span]'),
    length: stage.querySelector('[data-hangar-length]'),
    sun: stage.querySelector('[data-hangar-sun]'),
    sunLabel: stage.querySelector('[data-hangar-time]'),
  };
  const cam = { yaw: 0.75, pitch: 0.36, dist: 9, tYaw: 0.75, tPitch: 0.36, tDist: 9, target: [0, 0, 0] };
  const VIEWS = { three: [0.75, 0.36], top: [Math.PI, 1.53], side: [Math.PI / 2, 0.04], front: [0, 0.08] };
  let gl, prog, ground, parts = [], instances = [], center = [0, 0, 0], radius = 3, groundZ = 0;
  let explode = 0, tExplode = 0, blueprint = 0, tBlueprint = 0, hover = null, hours = 13, autorotate = !reduced, idleAt = 0;
  let visible = false, raf = 0, ready = false;

  async function init() {
    gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
    if (!gl) { stage.classList.add('hangar-nogl'); if (ui.status) ui.status.textContent = 'Your browser does not support WebGL 2, so the 3D view is unavailable.'; return; }
    prog = compile(gl, VS, FS);
    ground = compile(gl, GVS, GFS);
    const { json, read } = await loadGLB(stage.dataset.hangar);
    const meshParts = json.meshes.map((m, mi) => {
      const mat = json.materials[m.primitives[0].material];
      const tri = m.primitives.find(p => p.mode === 4), lines = m.primitives.find(p => p.mode === 1);
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const pos = read(tri.attributes.POSITION), nor = read(tri.attributes.NORMAL), idx = read(tri.indices);
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, pos.data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, nor.data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx.data, gl.STATIC_DRAW);
      const lvao = gl.createVertexArray(); gl.bindVertexArray(lvao);
      const lp = read(lines.attributes.POSITION);
      const lb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lb); gl.bufferData(gl.ARRAY_BUFFER, lp.data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      return { name: NAMES[m.name] || m.name, key: m.name, color: mat.pbrMetallicRoughness.baseColorFactor.slice(0, 3),
        vao, count: idx.data.length, lvao, lcount: lp.data.length / 3, min: pos.min, max: pos.max, solar: m.name === 'part-1312' };
    });
    parts = meshParts;
    // instances: children of the root node (CAD frame, Z up)
    const root = json.nodes[json.scenes[0].nodes[0]];
    instances = root.children.map(i => {
      const n = json.nodes[i]; const part = parts[n.mesh]; const M = new Float32Array(n.matrix);
      const c = M4.apply(M, [(part.min[0] + part.max[0]) / 2, (part.min[1] + part.max[1]) / 2, (part.min[2] + part.max[2]) / 2]);
      return { part, M, c, off: [0, 0, 0] };
    });
    // assembly bounds
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    instances.forEach(({ part, M }) => {
      for (const x of [part.min[0], part.max[0]]) for (const y of [part.min[1], part.max[1]]) for (const z of [part.min[2], part.max[2]]) {
        const p = M4.apply(M, [x, y, z]); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
      }
    });
    center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    radius = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2; groundZ = lo[2] - 0.35;
    cam.target = center.slice(); cam.dist = cam.tDist = radius * 2.35;
    if (ui.span) ui.span.textContent = `${(hi[1] - lo[1]).toFixed(2)} m`;
    if (ui.length) ui.length.textContent = `${(hi[0] - lo[0]).toFixed(2)} m`;
    // exploded offsets: pull each part away along a direction that suits it
    instances.forEach(inst => {
      const d = sub(inst.c, center), side = Math.sign(d[1]) || 1;
      const o = { 'part-1312': [0, 0, -0.55], 'part-1311': [0, side * 0.9, 0.35], 'part-1309': [0.9, side * 0.25, 0.25],
        'part-1313': [0.35, 0, 0.9], 'part-1310': [-0.7, side * 0.25, 0.55], 'part-1314': [-0.55, side * 0.15, 1.05] }[inst.part.key] || norm(d);
      inst.off = o;
    });
    // gl ground quad
    ground.vao = gl.createVertexArray(); gl.bindVertexArray(ground.vao);
    const gb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, gb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    buildLegend();
    ready = true; stage.classList.add('hangar-ready');
    if (ui.status) ui.status.textContent = '';
    setSun(hours); resize(); kick();
  }

  function buildLegend() {
    if (!ui.legend) return;
    const counts = {}; instances.forEach(i => { counts[i.part.key] = (counts[i.part.key] || 0) + 1; });
    const order = ['part-1312', 'part-1311', 'part-1309', 'part-1313', 'part-1310', 'part-1314'];
    ui.legend.innerHTML = order.filter(k => counts[k]).map(k => {
      const p = parts.find(x => x.key === k); const c = p.color.map(v => Math.round(v * 255)).join(',');
      return `<li><button type="button" data-part="${k}"><i style="background:rgb(${c})"></i>${p.name}${counts[k] > 1 ? ` <small>×${counts[k]}</small>` : ''}</button></li>`;
    }).join('');
    ui.legend.querySelectorAll('button').forEach(b => {
      const on = () => { hover = b.dataset.part; kick(); }, off = () => { hover = null; kick(); };
      b.addEventListener('pointerenter', on); b.addEventListener('pointerleave', off);
      b.addEventListener('focus', on); b.addEventListener('blur', off);
    });
  }

  /* ---------- sun / sky ---------- */
  let sun = [0.4, -0.5, 0.75], sunCol = [1, 0.96, 0.9], sky = [0.55, 0.65, 0.8], groundCol = [0.25, 0.22, 0.2];
  function setSun(h) {
    hours = h;
    const t = (h - 6) / 12; const el = Math.sin(clamp(t, 0, 1) * Math.PI) * 1.05 + 0.08;
    const az = lerp(-2.2, 2.2, clamp(t, 0, 1));
    sun = norm([Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)]);
    const warm = clamp(1 - el / 0.6, 0, 1);
    sunCol = [1, lerp(0.97, 0.72, warm), lerp(0.92, 0.48, warm)].map(v => v * lerp(1.15, 0.9, warm));
    sky = [lerp(0.55, 0.62, warm), lerp(0.66, 0.5, warm), lerp(0.82, 0.55, warm)];
    groundCol = [lerp(0.3, 0.32, warm), lerp(0.27, 0.22, warm), lerp(0.24, 0.18, warm)];
    stage.style.setProperty('--hangar-warm', warm.toFixed(3));
    if (ui.sunLabel) ui.sunLabel.textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
    kick();
  }

  /* ---------- render ---------- */
  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    kick();
  }
  function frame(now) {
    raf = 0;
    if (!ready || !visible) return;
    const k = reduced ? 1 : 0.12;
    if (autorotate && now > idleAt) cam.tYaw += 0.0022;
    cam.yaw = lerp(cam.yaw, cam.tYaw, k); cam.pitch = lerp(cam.pitch, cam.tPitch, k); cam.dist = lerp(cam.dist, cam.tDist, k);
    explode = lerp(explode, tExplode, reduced ? 1 : 0.08); blueprint = lerp(blueprint, tBlueprint, reduced ? 1 : 0.15);
    draw();
    const settling = Math.abs(cam.yaw - cam.tYaw) + Math.abs(cam.pitch - cam.tPitch) + Math.abs(cam.dist - cam.tDist) / 10 + Math.abs(explode - tExplode) + Math.abs(blueprint - tBlueprint) > 0.0005;
    if (settling || (autorotate && now > idleAt) || dragging) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && visible) raf = requestAnimationFrame(frame); }

  function draw() {
    const w = canvas.width, h = canvas.height;
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const cp = Math.cos(cam.pitch);
    const eye = [cam.target[0] + cam.dist * cp * Math.cos(cam.yaw), cam.target[1] + cam.dist * cp * Math.sin(cam.yaw), cam.target[2] + cam.dist * Math.sin(cam.pitch)];
    const right = [-Math.sin(cam.yaw), Math.cos(cam.yaw), 0];
    const up = norm(cross(right, norm(sub(cam.target, eye))));
    const VP = M4.mul(M4.persp(0.52, w / h, 0.05, 200), M4.look(eye, cam.target, up));
    const bp = blueprint > 0.5;
    // ground: soft shadow, or blueprint grid
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.DEPTH_TEST);
    gl.useProgram(ground.p); gl.bindVertexArray(ground.vao);
    gl.uniformMatrix4fv(ground.u.uVP, false, VP);
    gl.uniform3f(ground.u.uC, center[0], center[1], groundZ - explode * 0.6);
    gl.uniform1f(ground.u.uS, radius * 1.6); gl.uniform1f(ground.u.uBlue, bp ? 1 : 0);
    gl.uniform1f(ground.u.uShadow, (1 - explode * 0.6) * clamp(sun[2] * 1.4, 0.25, 1));
    gl.uniform2f(ground.u.uShift, -sun[0] / Math.max(sun[2], 0.3) * 0.12, -sun[1] / Math.max(sun[2], 0.3) * 0.12);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST);
    gl.useProgram(prog.p);
    gl.uniformMatrix4fv(prog.u.uVP, false, VP);
    gl.uniform3fv(prog.u.uSun, sun); gl.uniform3fv(prog.u.uSunCol, sunCol);
    gl.uniform3fv(prog.u.uSky, sky); gl.uniform3fv(prog.u.uGround, groundCol); gl.uniform3fv(prog.u.uEye, eye);
    const bpBg = [0.027, 0.07, 0.14];
    if (bp) { gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 2); }
    for (const inst of instances) {
      const e = explode * radius * 0.42;
      gl.uniformMatrix4fv(prog.u.uModel, false, inst.M);
      gl.uniform3f(prog.u.uOffset, inst.off[0] * e, inst.off[1] * e, inst.off[2] * e);
      gl.uniform3fv(prog.u.uColor, bp ? bpBg : inst.part.color);
      gl.uniform1f(prog.u.uFlat, bp ? 1 : 0);
      gl.uniform1f(prog.u.uSolar, inst.part.solar ? 1 : 0);
      gl.uniform1f(prog.u.uDim, hover && hover !== inst.part.key ? 0.75 : 0);
      gl.uniform1f(prog.u.uHi, hover === inst.part.key ? 1 : 0);
      gl.bindVertexArray(inst.part.vao); gl.drawElements(gl.TRIANGLES, inst.part.count, gl.UNSIGNED_INT, 0);
    }
    if (bp) {
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.uniform1f(prog.u.uFlat, 1);
      for (const inst of instances) {
        const e = explode * radius * 0.42;
        gl.uniformMatrix4fv(prog.u.uModel, false, inst.M);
        gl.uniform3f(prog.u.uOffset, inst.off[0] * e, inst.off[1] * e, inst.off[2] * e);
        gl.uniform3fv(prog.u.uColor, hover && hover !== inst.part.key ? [0.2, 0.35, 0.5] : hover === inst.part.key ? [1, 0.78, 0.35] : [0.62, 0.88, 1]);
        gl.bindVertexArray(inst.part.lvao); gl.drawArrays(gl.LINES, 0, inst.part.lcount);
      }
    }
    gl.bindVertexArray(null);
  }

  /* ---------- interaction ---------- */
  let dragging = false; const pointers = new Map(); let pinch0 = 0, dist0 = 0;
  const touchIdle = () => { idleAt = performance.now() + 7000; };
  canvas.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, [e.clientX, e.clientY]); canvas.setPointerCapture(e.pointerId); dragging = true; touchIdle();
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); dist0 = cam.tDist; }
    stage.classList.add('hangar-grab'); kick();
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      cam.tDist = clamp(dist0 * pinch0 / Math.max(d, 1), radius * 1.1, radius * 5); kick(); return;
    }
    const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
    cam.tYaw -= dx * 0.008;
    if (e.pointerType === 'mouse' || Math.abs(dy) > Math.abs(dx)) cam.tPitch = clamp(cam.tPitch + dy * 0.006, -0.2, 1.54);
    touchIdle(); kick();
  });
  const end = e => { pointers.delete(e.pointerId); if (!pointers.size) { dragging = false; stage.classList.remove('hangar-grab'); } };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => {
    if (!stage.matches(':hover')) return;
    e.preventDefault(); cam.tDist = clamp(cam.tDist * Math.exp(e.deltaY * 0.0012), radius * 1.1, radius * 5); touchIdle(); kick();
  }, { passive: false });
  canvas.addEventListener('dblclick', () => { setView('three'); });
  canvas.addEventListener('keydown', e => {
    const step = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, 0.08], ArrowDown: [0, -0.08] }[e.key];
    if (step) { e.preventDefault(); cam.tYaw += step[0]; cam.tPitch = clamp(cam.tPitch + step[1], -0.2, 1.54); touchIdle(); kick(); }
    if (e.key === '+' || e.key === '=') { cam.tDist = clamp(cam.tDist * 0.85, radius * 1.1, radius * 5); kick(); }
    if (e.key === '-') { cam.tDist = clamp(cam.tDist * 1.18, radius * 1.1, radius * 5); kick(); }
  });
  function setView(name) {
    const [y, p] = VIEWS[name];
    // take the short way round
    const twoPi = Math.PI * 2; let ty = y; while (ty - cam.tYaw > Math.PI) ty -= twoPi; while (cam.tYaw - ty > Math.PI) ty += twoPi;
    cam.tYaw = ty; cam.tPitch = p; cam.tDist = radius * (name === 'three' ? 2.35 : 2.55);
    stage.querySelectorAll('[data-hangar-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hangarView === name)));
    touchIdle(); kick();
  }
  stage.querySelectorAll('[data-hangar-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.hangarView)));
  stage.querySelector('[data-hangar-explode]')?.addEventListener('click', e => {
    tExplode = tExplode ? 0 : 1; e.currentTarget.setAttribute('aria-pressed', String(!!tExplode)); touchIdle(); kick();
  });
  stage.querySelector('[data-hangar-blueprint]')?.addEventListener('click', e => {
    tBlueprint = tBlueprint ? 0 : 1; stage.classList.toggle('hangar-bp', !!tBlueprint);
    e.currentTarget.setAttribute('aria-pressed', String(!!tBlueprint)); kick();
  });
  stage.querySelector('[data-hangar-spin]')?.addEventListener('click', e => {
    autorotate = !autorotate; idleAt = 0; e.currentTarget.setAttribute('aria-pressed', String(autorotate)); kick();
  });
  ui.sun?.addEventListener('input', () => setSun(parseFloat(ui.sun.value)));
  if (reduced) stage.querySelector('[data-hangar-spin]')?.setAttribute('aria-pressed', 'false');
  if (matchMedia('(pointer: coarse)').matches) { const hint = stage.querySelector('.hangar-hint'); if (hint) hint.textContent = 'Swipe to orbit · Pinch to zoom'; }

  addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  let started = false;
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible && !started) { started = true; init().catch(err => { console.error(err); if (ui.status) ui.status.textContent = 'The 3D model could not be loaded.'; }); }
    if (visible) kick();
  }, { rootMargin: '300px 0px' }).observe(stage);
})();
