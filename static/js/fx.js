// Particles (struct-of-arrays, no per-particle allocation), ground decals, slashes, damage numbers, shake, hit-stop.
import { PX, BLOOD, clamp } from './config.js';

const N = 2200, DN = 640, GRAV = 430;
const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
const SYM = { '-': '000000111000000', '+': '000010111010000', '!': '010010010000010' };

export class FX {
  constructor() {
    this.n = 0; this.cap = N; this.quality = 1;
    this.x = new Float32Array(N); this.y = new Float32Array(N); this.z = new Float32Array(N);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N); this.vz = new Float32Array(N);
    this.life = new Float32Array(N); this.max = new Float32Array(N); this.size = new Uint8Array(N);
    this.flag = new Uint8Array(N); this.col = new Array(N).fill('#fff');
    this.dx = new Float32Array(DN); this.dy = new Float32Array(DN); this.dsz = new Uint8Array(DN); this.dt = new Float32Array(DN);
    this.dcol = new Array(DN).fill('#000'); this.dn = 0; this.dhead = 0;
    this.slashes = []; this.texts = []; this.rings = [];
    this.trauma = 0; this.kx = 0; this.ky = 0; this.stopLeft = 0; this.stopDebt = 0; this.time = 0;
  }
  // ---- core spawn ----------------------------------------------------------------------
  add(x, y, z, vx, vy, vz, life, size, col, flag = 0) {
    if (this.n >= this.cap) return; const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.col[i] = col; this.flag[i] = flag;
  }
  decal(x, y, size, col, life = 28) {
    const i = this.dhead; this.dhead = (this.dhead + 1) % DN; if (this.dn < DN) this.dn++;
    this.dx[i] = x; this.dy[i] = y; this.dsz[i] = size; this.dcol[i] = col; this.dt[i] = life;
  }
  // ---- gameplay effects ------------------------------------------------------------------
  blood(x, y, nx, ny, power, pal = 'flesh', kill = false) {
    const c = BLOOD[pal] || BLOOD.flesh, q = this.quality, n = Math.round((7 + power * 16 + (kill ? 20 : 0)) * q);
    const base = Math.atan2(ny, nx);
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - .5) * (kill ? 2.6 : 1.3), sp = (60 + Math.random() * 300) * (.5 + power * .7), big = Math.random() < (kill ? .35 : .15);
      this.add(x, y, 4 + Math.random() * 8, Math.cos(a) * sp, Math.sin(a) * sp, 60 + Math.random() * 170, .45 + Math.random() * .6, big ? 2 : 1, c[(Math.random() * 3) | 0], 1);
    }
    for (let i = 0; i < Math.round(4 * q); i++) { const a = base + (Math.random() - .5) * 2; this.add(x, y, 6, Math.cos(a) * 150, Math.sin(a) * 150, 20, .12 + Math.random() * .08, 2, c[3], 0); }
    this.decal(x + nx * 8, y + ny * 8, kill ? 3 : 2, c[2], 22);
    if (kill) { for (let i = 0; i < 6; i++) this.decal(x + (Math.random() - .5) * 46 + nx * 14, y + (Math.random() - .5) * 46 + ny * 14, 2 + (Math.random() * 2 | 0), c[i % 3], 36); }
  }
  dust(x, y, vx, vy, n = 3) { for (let i = 0; i < n; i++) this.add(x + (Math.random() - .5) * 8, y, 1, -vx * .12 + (Math.random() - .5) * 40, -vy * .12 + (Math.random() - .5) * 30, 14 + Math.random() * 20, .25 + Math.random() * .2, 1 + (Math.random() < .3), Math.random() < .5 ? '#cfc8a8' : '#a89f82', 3); }
  sparks(x, y, col, n = 8, speed = 220) { for (let i = 0; i < n * this.quality; i++) { const a = Math.random() * 6.283, s = speed * (.3 + Math.random()); this.add(x, y, 6, Math.cos(a) * s, Math.sin(a) * s, 40 + Math.random() * 90, .2 + Math.random() * .3, 1, col, 0); } }
  burst(x, y, cols, n, speed, up = 120, life = .8) { for (let i = 0; i < n * this.quality; i++) { const a = Math.random() * 6.283, s = speed * Math.random(); this.add(x, y, 4, Math.cos(a) * s, Math.sin(a) * s, up * Math.random(), life * (.5 + Math.random() * .5), 1 + (Math.random() < .25), cols[(Math.random() * cols.length) | 0], 0); } }
  slash(x, y, ang, span, r, col, dur = .16, thick = 3, dir = 1) { this.slashes.push({ x, y, a: ang, s: span, r, t: 0, d: dur, col, th: thick, dir }); if (this.slashes.length > 24) this.slashes.shift(); }
  ring(x, y, r, col, dur = .35) { this.rings.push({ x, y, r, t: 0, d: dur, col }); if (this.rings.length > 16) this.rings.shift(); }
  text(x, y, str, col, big = false) { this.texts.push({ x: x + (Math.random() - .5) * 10, y, s: String(str), col, big, t: 0, vy: -60 - (big ? 20 : 0) }); if (this.texts.length > 36) this.texts.shift(); }
  shake(p, dx = 0, dy = 0) { this.trauma = Math.min(1, this.trauma + p); this.kx += dx * p * 5; this.ky += dy * p * 5; }
  stop(ms) { this.stopLeft = Math.max(this.stopLeft, Math.min(ms, 120)); }
  get frozen() { return this.stopLeft > 0; }
  // ---- simulation ----------------------------------------------------------------------
  update(rawDt) {
    let dt = rawDt;
    if (this.stopLeft > 0) { this.stopLeft -= rawDt * 1000; this.stopDebt = Math.min(140, this.stopDebt + rawDt * 1000); dt = rawDt * .06; }
    else this.stopDebt = Math.max(0, this.stopDebt - rawDt * 1000 * .4);
    this.time += rawDt;
    const drag = Math.exp(-3 * dt), g = GRAV * dt;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt; if (this.life[i] <= 0) { this.kill(i); continue; }
      const f = this.flag[i];
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      if (f < 2) { this.vz[i] -= g; this.z[i] += this.vz[i] * dt; } else { this.z[i] += 8 * dt; }
      this.vx[i] *= drag; this.vy[i] *= drag;
      if (this.z[i] <= 0 && f < 2) {
        if (f === 1) { if (Math.random() < .55) this.decal(this.x[i], this.y[i], this.size[i], this.col[i], 20 + Math.random() * 12); this.kill(i); continue; }
        this.z[i] = 0; this.vz[i] *= -.35; this.vx[i] *= .5; this.vy[i] *= .5; if (Math.abs(this.vz[i]) < 8) this.vz[i] = 0;
      }
    }
    for (let i = 0; i < this.dn; i++) if (this.dt[i] > 0) this.dt[i] -= rawDt;
    for (let i = this.slashes.length - 1; i >= 0; i--) { this.slashes[i].t += dt; if (this.slashes[i].t >= this.slashes[i].d) this.slashes.splice(i, 1); }
    for (let i = this.rings.length - 1; i >= 0; i--) { this.rings[i].t += dt; if (this.rings[i].t >= this.rings[i].d) this.rings.splice(i, 1); }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.t += rawDt; t.y += t.vy * rawDt; t.vy *= Math.exp(-2.5 * rawDt); if (t.t > .9) this.texts.splice(i, 1); }
    this.trauma = Math.max(0, this.trauma - rawDt * 2.4); const kd = Math.exp(-14 * rawDt); this.kx *= kd; this.ky *= kd;
  }
  kill(i) { const l = --this.n; if (i !== l) { this.x[i] = this.x[l]; this.y[i] = this.y[l]; this.z[i] = this.z[l]; this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l]; this.vz[i] = this.vz[l]; this.life[i] = this.life[l]; this.max[i] = this.max[l]; this.size[i] = this.size[l]; this.flag[i] = this.flag[l]; this.col[i] = this.col[l]; } }
  shakeOffset() { const t = this.trauma * this.trauma * 5; return [Math.round((Math.random() - .5) * 2 * t + this.kx), Math.round((Math.random() - .5) * 2 * t + this.ky)]; }
  // ---- drawing -------------------------------------------------------------------------
  drawDecals(ctx, cx, cy, W, H) {
    const hw = W / 2 / PX + 20, hh = H / 2 / PX + 20; let last = '';
    for (let i = 0; i < this.dn; i++) {
      const life = this.dt[i]; if (life <= 0) continue;
      const x = this.dx[i] - cx, y = this.dy[i] - cy; if (x < -hw || x > hw || y < -hh || y > hh) continue;
      ctx.globalAlpha = life < 5 ? life / 5 : 1; if (this.dcol[i] !== last) { ctx.fillStyle = last = this.dcol[i]; }
      const s = this.dsz[i]; ctx.fillRect(Math.floor(x * PX + W / 2), Math.floor(y * PX + H / 2), s + 1, s);
    }
    ctx.globalAlpha = 1;
  }
  // pass 0 = ground dust (drawn under characters), pass 1 = everything else
  drawParticles(ctx, cx, cy, W, H, pass = 1) {
    let last = '';
    for (let i = 0; i < this.n; i++) {
      if ((this.flag[i] === 3) !== (pass === 0)) continue;
      const sx = Math.floor((this.x[i] - cx) * PX + W / 2), sy = Math.floor((this.y[i] - cy) * PX + H / 2 - this.z[i] * .5);
      if (sx < -4 || sx > W + 4 || sy < -4 || sy > H + 4) continue;
      const a = this.life[i] / this.max[i]; ctx.globalAlpha = a < .3 ? a / .3 : 1;
      if (this.col[i] !== last) ctx.fillStyle = last = this.col[i]; const s = this.size[i]; ctx.fillRect(sx, sy, s, s);
    }
    ctx.globalAlpha = 1;
  }
  drawSlashes(ctx, cx, cy, W, H) {
    for (const s of this.slashes) {
      const p = s.t / s.d, sx = (s.x - cx) * PX + W / 2, sy = (s.y - cy) * PX + H / 2, r = s.r * PX, steps = 16;
      for (let k = 0; k <= steps; k++) {
        const u = k / steps, a = s.a + (s.dir < 0 ? (.5 - u) : (u - .5)) * s.s, head = clamp(p * 1.4, 0, 1);
        if (u > head || u < head - .6) continue;
        const fade = 1 - (head - u) / .6, th = Math.max(1, Math.round(s.th * fade));
        ctx.globalAlpha = (1 - p * .7) * fade; ctx.fillStyle = k % 3 === 0 ? '#ffffff' : s.col;
        ctx.fillRect(Math.floor(sx + Math.cos(a) * r), Math.floor(sy + Math.sin(a) * r * .9), th, th);
      }
    }
    for (const g of this.rings) {
      const p = g.t / g.d, r = g.r * PX * (.4 + p * .6), sx = (g.x - cx) * PX + W / 2, sy = (g.y - cy) * PX + H / 2; ctx.globalAlpha = 1 - p; ctx.fillStyle = g.col;
      for (let k = 0; k < 28; k++) { const a = k / 28 * 6.283; ctx.fillRect(Math.floor(sx + Math.cos(a) * r), Math.floor(sy + Math.sin(a) * r * .75), 1, 1); }
    }
    ctx.globalAlpha = 1;
  }
  drawTexts(ctx, cx, cy, W, H) {
    for (const t of this.texts) {
      const sx = Math.floor((t.x - cx) * PX + W / 2), sy = Math.floor((t.y - cy) * PX + H / 2), sc = t.big ? 2 : 1, a = t.t > .6 ? 1 - (t.t - .6) / .3 : 1;
      ctx.globalAlpha = Math.max(0, a); drawGlyphs(ctx, t.s, sx - Math.floor(t.s.length * 2 * sc), sy, '#120c0c', sc, 1); drawGlyphs(ctx, t.s, sx - Math.floor(t.s.length * 2 * sc), sy, t.col, sc, 0);
    }
    ctx.globalAlpha = 1;
  }
}
export function drawGlyphs(ctx, str, x, y, col, sc = 1, outline = 0) {
  ctx.fillStyle = col;
  for (let k = 0; k < str.length; k++) {
    const pat = SYM[str[k]] || DIG[+str[k]]; if (!pat) continue;
    for (let i = 0; i < 15; i++) if (pat[i] === '1') {
      const px = x + (k * 4 + (i % 3)) * sc, py = y + ((i / 3) | 0) * sc;
      if (outline) { ctx.fillRect(px - 1, py, sc + 2, sc); ctx.fillRect(px, py - 1, sc, sc + 2); } else ctx.fillRect(px, py, sc, sc);
    }
  }
}
