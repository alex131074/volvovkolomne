/* Руль с пузырьковым уровнем встаёт ровно. Чистый WebGL, без библиотек, открывается двойным кликом. */
(function () {
  var cv = document.getElementById('gl3d');
  var gl = cv && (cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }) || cv.getContext('experimental-webgl'));
  if (!gl) { document.documentElement.classList.add('no-gl'); window.G3 = { set: function () {}, scroll: function () {}, live: function () {} }; return; }
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PI = Math.PI;

  /* ---------- математика ---------- */
  function mul(a, b) { var o = new Float32Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
  function ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function trans(x, y, z) { var m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; }
  function scl(x, y, z) { var m = ident(); m[0] = x; m[5] = y; m[10] = z; return m; }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
  function rotZ(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
  function persp(fov, asp, n, f) { var t = 1 / Math.tan(fov / 2), m = new Float32Array(16); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function lookAt(e, t) { var z = norm([e[0] - t[0], e[1] - t[1], e[2] - t[2]]), x = norm(cross([0, 1, 0], z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]); }
  function basis(d) { var y = norm(d), up = Math.abs(y[2]) < .9 ? [0, 0, 1] : [1, 0, 0], x = norm(cross(up, y)), z = cross(x, y); return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1]); }
  function chain() { var m = arguments[0]; for (var i = 1; i < arguments.length; i++) m = mul(m, arguments[i]); return m; }

  /* ---------- геометрия ---------- */
  function Geo() { this.d = []; }
  Geo.prototype.surf = function (F, nu, nv, M) { // F(u,v) -> [x,y,z,m], нормали по разностям
    M = M || ident(); var P = [], i, j, e = 1e-3;
    for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
      var u = i / nu, v = j / nv, p = F(u, v), pu = F(Math.min(1, u + e), v), pu2 = F(Math.max(0, u - e), v), pv = F(u, Math.min(1, v + e)), pv2 = F(u, Math.max(0, v - e));
      var n = cross([pu[0] - pu2[0], pu[1] - pu2[1], pu[2] - pu2[2]], [pv[0] - pv2[0], pv[1] - pv2[1], pv[2] - pv2[2]]);
      if (!(n[0] || n[1] || n[2])) n = [0, 1, 0];
      P.push([p, norm(n)]);
    }
    var w = nu + 1;
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = P[j * w + i], b = P[j * w + i + 1], c = P[(j + 1) * w + i + 1], d = P[(j + 1) * w + i];
      this.tri(a, b, c, M); this.tri(a, c, d, M);
    }
  };
  Geo.prototype.tri = function () {
    var M = arguments[3], self = this;
    for (var k = 0; k < 3; k++) {
      var q = arguments[k], p = q[0], n = q[1];
      self.d.push(M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14],
        M[0] * n[0] + M[4] * n[1] + M[8] * n[2], M[1] * n[0] + M[5] * n[1] + M[9] * n[2], M[2] * n[0] + M[6] * n[1] + M[10] * n[2], p[3]);
    }
  };
  Geo.prototype.upload = function () {
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.d), gl.STATIC_DRAW);
    var n = this.d.length / 7; this.d = null; return { b: b, n: n };
  };


  /* ---------- общие детали: коробка, тело вращения, тор ---------- */
  Geo.prototype.box = function (w, h, d, m, M) {
    M = M || ident(); var x = w / 2, y = h / 2, z = d / 2, self = this;
    [[[1, 0, 0], [x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]], [[-1, 0, 0], [-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]],
     [[0, 1, 0], [-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]], [[0, -1, 0], [-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]],
     [[0, 0, 1], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], [[0, 0, -1], [x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]]].forEach(function (f) {
      var n = f[0], q = f.slice(1).map(function (p) { return [[p[0], p[1], p[2], m], n]; });
      self.tri(q[0], q[1], q[2], M); self.tri(q[0], q[2], q[3], M);
    });
    return this;
  };
  function profAt(prof, v) {
    var f = v * (prof.length - 1), i = Math.min(prof.length - 2, Math.floor(f)), t = f - i;
    return [prof[i][0] + (prof[i + 1][0] - prof[i][0]) * t, prof[i][1] + (prof[i + 1][1] - prof[i][1]) * t];
  }
  Geo.prototype.lathe = function (prof, seg, m, M, a0, a1) {
    a0 = a0 || 0; a1 = a1 === undefined ? 2 * PI : a1;
    this.surf(function (u, v) { var a = a0 + u * (a1 - a0), p = profAt(prof, v); return [Math.cos(a) * p[0], p[1], Math.sin(a) * p[0], typeof m === 'function' ? m(u, v) : m]; }, seg, (prof.length - 1) * 2, M);
    return this;
  };
  Geo.prototype.torus = function (R, r, nu, nv, m, M) {
    this.surf(function (u, v) { var a = u * 2 * PI, b = v * 2 * PI, k = R + r * Math.cos(b); return [Math.cos(a) * k, r * Math.sin(b), Math.sin(a) * k, m]; }, nu, nv, M);
    return this;
  };
  Geo.prototype.tube = function (path, r, nu, nv, m, M) { // path(t) -> [x,y,z]
    this.surf(function (u, v) {
      var p = path(v), q = path(Math.min(1, v + .01)), p0 = path(Math.max(0, v - .01)), t = norm([q[0] - p0[0], q[1] - p0[1], q[2] - p0[2]]);
      var up = Math.abs(t[1]) < .9 ? [0, 1, 0] : [1, 0, 0], a = norm(cross(t, up)), b = cross(t, a), w = u * 2 * PI, rr = typeof r === 'function' ? r(v) : r;
      return [p[0] + (a[0] * Math.cos(w) + b[0] * Math.sin(w)) * rr, p[1] + (a[1] * Math.cos(w) + b[1] * Math.sin(w)) * rr, p[2] + (a[2] * Math.cos(w) + b[2] * Math.sin(w)) * rr, m];
    }, nu, nv, M);
    return this;
  };
  function geo() { return new Geo(); }

  /* ---------- свет: рассеянный, блик, отражение неба для металла, кромка ---------- */
  var VS = 'attribute vec3 aP;attribute vec3 aN;attribute float aM;uniform mat4 uVP;uniform mat4 uW;varying vec3 vW;varying vec3 vN;varying float vM;' +
    'void main(){vec4 w=uW*vec4(aP,1.);vW=w.xyz;vN=mat3(uW[0].xyz,uW[1].xyz,uW[2].xyz)*aN;vM=aM;gl_Position=uVP*w;}';
  var FS = 'precision mediump float;varying vec3 vW;varying vec3 vN;varying float vM;' +
    'uniform vec3 uE;uniform vec3 uC1;uniform vec3 uC2;uniform vec3 uGlow;uniform vec3 uL;uniform vec3 uSky;uniform vec3 uGnd;uniform float uFade;uniform float uMet;uniform float uRough;uniform float uA;' +
    'void main(){vec3 N=normalize(vN);vec3 V=normalize(uE-vW);if(dot(N,V)<0.)N=-N;vec3 L=normalize(uL);vec3 H=normalize(L+V);' +
    'vec3 base=mix(uC1,uC2,clamp(vM,0.,1.));float d=max(dot(N,L),0.);float fill=max(dot(N,normalize(vec3(-.7,.25,.55))),0.)*.28;' +
    'float sp=pow(max(dot(N,H),0.),mix(140.,10.,uRough));vec3 R=reflect(-V,N);' +
    'vec3 env=mix(uGnd,uSky,smoothstep(-.35,.65,R.y))+vec3(pow(max(dot(R,L),0.),30.))*.9;float fr=pow(1.-max(dot(N,V),0.),3.);' +
    'vec3 dif=base*(.2+d*.82+fill)+vec3(sp)*.3*(1.-uRough);vec3 met=base*(env*1.05+.08)+vec3(sp)*(1.3-uRough);' +
    'vec3 c=mix(dif,met,uMet)+fr*mix(uSky,base,.4)*.3+uGlow;gl_FragColor=vec4(min(c,vec3(1.2))*uFade*uA,uFade*uA);}';
  function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; }
  var pg = gl.createProgram(); gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pg);
  var A = { p: gl.getAttribLocation(pg, 'aP'), n: gl.getAttribLocation(pg, 'aN'), m: gl.getAttribLocation(pg, 'aM') };
  var U = {}; ['uVP', 'uW', 'uE', 'uC1', 'uC2', 'uGlow', 'uL', 'uSky', 'uGnd', 'uFade', 'uMet', 'uRough', 'uA'].forEach(function (n) { U[n] = gl.getUniformLocation(pg, n); });
  gl.useProgram(pg); gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  [A.p, A.n, A.m].forEach(function (l) { gl.enableVertexAttribArray(l); });
  var ZERO = [0, 0, 0];
  /* mat: {c1, c2, met, rough, glow, a} */
  function draw(buf, W, mat) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.b);
    gl.vertexAttribPointer(A.p, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(A.n, 3, gl.FLOAT, false, 28, 12); gl.vertexAttribPointer(A.m, 1, gl.FLOAT, false, 28, 24);
    gl.uniformMatrix4fv(U.uW, false, W); gl.uniform3fv(U.uC1, mat.c1); gl.uniform3fv(U.uC2, mat.c2 || mat.c1);
    gl.uniform1f(U.uMet, mat.met || 0); gl.uniform1f(U.uRough, mat.rough === undefined ? .5 : mat.rough); gl.uniform3fv(U.uGlow, mat.glow || ZERO);
    gl.uniform1f(U.uA, mat.a === undefined ? 1 : mat.a);
    gl.drawArrays(gl.TRIANGLES, 0, buf.n);
  }
  function hex(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }

  /* ---------- холст, указатель, камера, цикл кадров ---------- */
  var W = 0, H = 0, mx = 0, my = 0, tmx = 0, tmy = 0, drag = false, lx = 0, spin = 0, spinV = 0;
  function resize() {
    var r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    gl.viewport(0, 0, W, H);
  }
  if (matchMedia('(hover:hover)').matches) addEventListener('pointermove', function (e) { tmx = e.clientX / innerWidth - .5; tmy = e.clientY / innerHeight - .5; }, { passive: true });
  cv.addEventListener('pointerdown', function (e) { drag = true; lx = e.clientX; try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
  cv.addEventListener('pointermove', function (e) { if (!drag) return; var dx = e.clientX - lx; lx = e.clientX; spin += dx * .01; spinV = dx * .6; kick(); });
  function up() { drag = false; }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  function camera(az, el, dist, tg, fov, light, sky, gnd) {
    var asp = W / H, eye = [tg[0] + Math.sin(az) * Math.cos(el) * dist, tg[1] + Math.sin(el) * dist, tg[2] + Math.cos(az) * Math.cos(el) * dist];
    var VP = mul(persp(fov || .6, asp, .1, 80), lookAt(eye, tg));
    gl.uniformMatrix4fv(U.uVP, false, VP); gl.uniform3fv(U.uE, eye); gl.uniform3fv(U.uL, light || [.5, .8, .6]);
    gl.uniform3fv(U.uSky, sky || [.85, .88, .95]); gl.uniform3fv(U.uGnd, gnd || [.12, .12, .14]);
    return { VP: VP, eye: eye, asp: asp };
  }
  var live = true, last = 0, fade = 0, time = 0, pending = false, STEP = null, RENDER = null;
  function begin(alpha) { if (!W) resize(); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.uniform1f(U.uFade, fade); }
  function stepAll(dt) {
    var k = 1 - Math.exp(-dt * 5);
    fade += (1 - fade) * (1 - Math.exp(-dt * 2.5));
    mx += (tmx - mx) * k; my += (tmy - my) * k;
    if (!drag) { spinV *= Math.exp(-dt * 2.5); spin += spinV * dt; }
    if (STEP) STEP(dt);
  }
  function frame(now) {
    var dt = Math.min(.05, (now - last) / 1000 || .016); last = now; time += dt;
    stepAll(dt); RENDER();
    if (live) requestAnimationFrame(frame);
  }
  function kick() {
    if (!reduce || pending || !RENDER) return; pending = true;
    requestAnimationFrame(function () { pending = false; for (var i = 0; i < 40; i++) stepAll(.05); RENDER(); });
  }
  addEventListener('resize', function () { resize(); kick(); });
  function run(step, render, api) {
    STEP = step; RENDER = render;
    api.live = function (v) { if (reduce || v === live) return; live = v; if (v) { last = performance.now(); requestAnimationFrame(frame); } };
    window.G3 = api; resize();
    if (reduce) { fade = 1; kick(); live = false; } else requestAnimationFrame(frame);
  }

  /* ---------- руль с пузырьковым уровнем на ободе; «Выставить руль» – руль встаёт ровно, пузырёк уходит в центр, шкала загорается ---------- */
  var rim = geo(); rim.torus(1.22, .14, 96, 20, 0); rim = rim.upload();
  var hubG = geo(); hubG.lathe([[0, .2], [.3, .19], [.42, .12], [.46, 0], [.4, -.12], [0, -.14]], 48, 0); hubG = hubG.upload();
  var cube = geo().box(1, 1, 1, 0).upload();
  var vial = geo(); vial.lathe([[0, -.3], [.05, -.295], [.068, -.26], [.07, -.2], [.07, .2], [.068, .26], [.05, .295], [0, .3]], 32, 0); vial = vial.upload();
  var ball = geo(); ball.lathe((function () { var p = []; for (var i = 0; i <= 12; i++) { var a = -PI / 2 + PI * i / 12; p.push([Math.cos(a) * .05 + 1e-4, Math.sin(a) * .05]); } return p; })(), 20, 0); ball = ball.upload();
  var col = geo(); col.lathe([[.16, 0], [.16, 1], [.22, 1.05], [.22, 1.3]], 32, 0); col = col.upload();
  var disc = geo(); disc.lathe([[0, 0], [1, 0]], 72, 0); disc = disc.upload();

  var LEATHER = { c1: hex('#26313d'), c2: hex('#0e141b'), rough: .75, met: 0 };
  var STEEL = { c1: hex('#aab4bf'), rough: .22, met: .9 };
  var SLATE = { c1: hex('#1c2733'), rough: .4, met: .3 };
  var GOLD = { c1: hex('#c8963e'), rough: .25, met: .85 };
  var T = 0, scr = 0, scrT = 0, v = 0, vt = 0, bx = .2;
  function sm(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }

  function step(dt) {
    scr += (scrT - scr) * (1 - Math.exp(-dt * 6));
    if (v !== vt) { var sp = reduce ? 10 : .5, d = vt - v; v = Math.abs(d) < sp * dt ? vt : v + Math.sign(d) * sp * dt; }
    if (!reduce) T += dt;
    var tl = tilt(), target = Math.max(-.2, Math.min(.2, tl * 1.4));
    bx += (target - bx) * (reduce ? 1 : 1 - Math.exp(-dt * 3));
  }
  function tilt() { var k = 1 - sm(v); return (-.22 + Math.sin(T * .7) * .04) * k; }
  function render() {
    if (!W) resize();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.uniform1f(U.uFade, fade);
    var wide = W / H > 1.1, ok = sm(v), tl = tilt();
    camera(-.32 + mx * .45 + spin + Math.sin(T * .2) * .06, .14 + my * .12 + scr * .1, (wide ? 6.4 : 8) + scr * .8, [0, .05, 0], .6, [.35, .8, .75], [.93, .95, .97], [.45, .5, .56]);
    /* шкала: риски по кругу, центральная – золотая */
    for (var i = -9; i <= 9; i++) {
      var a = PI / 2 + i * PI / 36, big = i % 3 === 0, r0 = 1.72;
      var on = i === 0 ? GOLD : { c1: hex(big ? '#2f4f6f' : '#9fb0c2'), rough: .5 };
      draw(cube, chain(trans(Math.cos(a) * r0, Math.sin(a) * r0, -.25), rotZ(a), scl(big ? .22 : .12, i === 0 ? .06 : .025, .03)), i === 0 ? { c1: GOLD.c1, rough: .3, met: .6, glow: [.25 * ok, .17 * ok, .05 * ok] } : on);
    }
    /* колонка */
    draw(col, chain(trans(0, 0, -1.55), rotX(PI / 2)), SLATE);
    var M = rotZ(tl);
    draw(rim, chain(M, rotX(PI / 2)), LEATHER);
    draw(hubG, chain(M, rotX(PI / 2)), SLATE);
    draw(cube, chain(M, trans(0, 0, .2), scl(.34, .34, .02)), { c1: hex('#2f4f6f'), rough: .3, met: .5 });
    /* три спицы */
    draw(cube, chain(M, trans(-.78, -.05, 0), scl(.78, .2, .1)), STEEL);
    draw(cube, chain(M, trans(.78, -.05, 0), scl(.78, .2, .1)), STEEL);
    draw(cube, chain(M, trans(0, -.72, 0), scl(.2, .66, .1)), STEEL);
    /* уровень сверху на ободе */
    var L = chain(M, trans(0, 1.22, .17));
    draw(cube, chain(L, scl(.82, .16, .14)), GOLD);
    draw(cube, chain(L, trans(-.07, 0, .072), scl(.012, .14, .01)), SLATE);
    draw(cube, chain(L, trans(.07, 0, .072), scl(.012, .14, .01)), SLATE);
    draw(ball, chain(L, trans(bx, .02, .09), scl(1.1, .9, .9)), { c1: hex('#ffffff'), rough: .1, glow: [.3, .3, .28] });
    gl.enable(gl.BLEND); gl.depthMask(false);
    draw(vial, chain(L, trans(0, 0, .09), rotZ(PI / 2)), { c1: hex('#d9e7a8'), rough: .05, met: .2, a: .55 });
    draw(disc, chain(trans(0, 0, -.32), rotX(PI / 2), scl(1.95, 1, 1.95)), { c1: hex('#2f4f6f'), a: .06 + ok * .04 });
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  run(step, render, {
    scroll: function (p) { scrT = p; kick(); },
    set: function (k, val) { if (k === 'level') { vt = val ? 1 : 0; kick(); } }
  });
})();
