// WebSocket client: snapshot buffer + entity interpolation for everyone else,
// client-side prediction (same motion model as the server) with gentle reconciliation for the local player.
import { INTERP_DELAY, clamp, lerp, expo } from './config.js';

export function stepMotion(s, inp, dt, P, o) {
  const base = 178 + (o.agility - 1) * 3.2, moving = inp.x * inp.x + inp.y * inp.y > .0025;
  const sprint = !!inp.sprint && moving && !o.exhausted && o.stamina > 1;
  const maxv = base * (sprint ? P.sprint : 1) * (o.charging ? P.charge_slow : 1);
  if (moving) { const a = expo(P.accel, dt); s.vx += (inp.x * maxv - s.vx) * a; s.vy += (inp.y * maxv - s.vy) * a; }
  else { const f = Math.exp(-P.friction * dt); s.vx *= f; s.vy *= f; }
  const kd = Math.exp(-P.kdecay * dt); s.kx *= kd; s.ky *= kd;
  s.x += (s.vx + s.kx) * dt; s.y += (s.vy + s.ky) * dt;
  if (s.x < 25 || s.x > o.W - 25) { s.x = clamp(s.x, 25, o.W - 25); s.vx = s.kx = 0; }
  if (s.y < 25 || s.y > o.H - 25) { s.y = clamp(s.y, 25, o.H - 25); s.vy = s.ky = 0; }
  s.sprinting = sprint;
}

export class Net {
  constructor(cb) {
    this.cb = cb; this.ws = null; this.snaps = []; this.rtt = 30; this.you = null; this.init = null;
    this.me = { x: 0, y: 0, vx: 0, vy: 0, kx: 0, ky: 0, sprinting: false }; this.srv = null; this.row = null;
    this.mobs = new Map(); this.players = new Map(); this.arrows = []; this.off = new Set(); this.ground = []; this.thorns = [];
    this.seq = 0; this.lastSend = 0; this.lastKey = ''; this.connected = false; this.bytes = 0; this.snapCount = 0; this.stopDebt = 0;
  }
  connect() {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = this.ws = new WebSocket(`${scheme}//${location.host}/ws?v=2`);
    ws.onopen = () => { this.connected = true; this.pingLoop(); };
    ws.onclose = (e) => { this.connected = false; this.cb.onClose?.(e); };
    ws.onmessage = (ev) => this.onMessage(ev.data);
  }
  pingLoop() { clearInterval(this._ping); this._ping = setInterval(() => this.send({ type: 'ping', c: performance.now() }), 1000); }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  onMessage(raw) {
    this.bytes += raw.length; let m; try { m = JSON.parse(raw); } catch { return; }
    switch (m.type) {
      case 'init': this.init = m; this.you = m.you; this.cb.onInit(m); break;
      case 'snap': this.pushSnap(m); break;
      case 'inv': this.cb.onInv(m); break;
      case 'pong': this.rtt = lerp(this.rtt, performance.now() - m.c, .3); break;
      case 'error': this.cb.onEvent(m); break;
      default: if (!m.target || m.target === this.you) this.cb.onEvent(m);
    }
  }
  pushSnap(m) {
    m.r = performance.now(); m.mm = new Map(m.m.map((e) => [e.i, e])); m.pm = new Map(m.p.map((e) => [e.i, e]));
    this.snaps.push(m); if (this.snaps.length > 24) this.snaps.shift(); this.snapCount++;
    const row = m.pm.get(this.you); if (!row) return;
    this.row = row; this.srv = { x: row.x, y: row.y, vx: row.vx, vy: row.vy, kx: row.kx, ky: row.ky, t: m.r, rs: row.rs };
    if (!this.me.init) { Object.assign(this.me, { x: row.x, y: row.y, vx: row.vx, vy: row.vy, kx: row.kx, ky: row.ky, init: true }); }
    this.off = new Set(m.off); this.ground = m.g; this.thorns = m.th; this.cb.onSnap(m, row);
  }
  // advance prediction + reconcile; called every frame
  predict(dt, inp, P, o) {
    const me = this.me; if (!this.srv) return;
    if (this.srv.rs) { Object.assign(me, { x: this.srv.x, y: this.srv.y, vx: 0, vy: 0, kx: 0, ky: 0 }); return; }
    stepMotion(me, inp, dt, P, o);
    const s = this.srv, L = (performance.now() - s.t) / 1000 + this.rtt / 2000 + .02 + this.rtt / 2000, kdc = (1 - Math.exp(-P.kdecay * L)) / P.kdecay;
    const ex = s.x + s.vx * L + s.kx * kdc, ey = s.y + s.vy * L + s.ky * kdc, ox = ex - me.x, oy = ey - me.y, d = Math.hypot(ox, oy);
    if (d > 220) { Object.assign(me, { x: ex, y: ey, vx: s.vx, vy: s.vy, kx: s.kx, ky: s.ky }); }
    else if (d > 6) { const f = expo(8, dt) * (1 - 6 / d); me.x += ox * f; me.y += oy * f; }
    else if (!(inp.x || inp.y)) { const f = expo(3, dt); me.vx += (s.vx - me.vx) * f; me.vy += (s.vy - me.vy) * f; }
  }
  sendInput(inp, aim, now, force = false) {
    const key = inp.x + ',' + inp.y + ',' + inp.sprint;
    if (!force && key === this.lastKey && now - this.lastSend < 33) return;
    if (now - this.lastSend < 16 && !force) return;
    this.lastKey = key; this.lastSend = now; this.seq++;
    this.send({ type: 'input', x: inp.x, y: inp.y, sprint: inp.sprint ? 1 : 0, aim_x: +aim.x.toFixed(3), aim_y: +aim.y.toFixed(3), seq: this.seq });
  }
  // Fill persistent entity maps with interpolated state for the current render clock.
  sample(now, frame, hitstopDebt) {
    const s = this.snaps; if (!s.length) return;
    const rt = now - INTERP_DELAY - hitstopDebt; let i = s.length - 1; while (i > 0 && s[i].r > rt) i--;
    const a = s[i], b = s[i + 1], k = b ? clamp((rt - a.r) / Math.max(1, b.r - a.r), 0, 1) : 0, t = b || a;
    for (const m of t.m) {
      const am = b ? a.mm.get(m.i) : null; let e = this.mobs.get(m.i);
      if (!e) { e = { id: m.i, kind: m.k, x: m.x, y: m.y, vx: 0, vy: 0, flash: 0, kx: 0, ky: 0, sq: 0, anim: Math.random() * 6, face: 1, dead: 0, spawn: now }; this.mobs.set(m.i, e); }
      const nx = am ? lerp(am.x, m.x, k) : m.x, ny = am ? lerp(am.y, m.y, k) : m.y;
      e.vx = lerp(e.vx, (nx - e.x) * 40, .4); e.vy = lerp(e.vy, (ny - e.y) * 40, .4); e.x = nx; e.y = ny;
      e.hp = m.h; e.max = m.H; e.level = m.l; e.f = m.f; e.seen = frame; if (Math.abs(e.vx) > 8) e.face = e.vx > 0 ? 1 : -1;
    }
    for (const [id, e] of this.mobs) if (e.seen !== frame && !e.dead) this.mobs.delete(id); else if (e.dead && now - e.dead > 700) this.mobs.delete(id);
    for (const p of t.p) {
      if (p.i === this.you) continue; const ap = b ? a.pm.get(p.i) : null; let e = this.players.get(p.i);
      if (!e) { e = { id: p.i, x: p.x, y: p.y, vx: 0, vy: 0, anim: 0, flash: 0, swing: 0, swingDir: 1, dist: 0 }; this.players.set(p.i, e); }
      const nx = ap ? lerp(ap.x, p.x, k) : p.x, ny = ap ? lerp(ap.y, p.y, k) : p.y;
      e.vx = lerp(e.vx, (nx - e.x) * 40, .4); e.vy = lerp(e.vy, (ny - e.y) * 40, .4); e.dist += Math.hypot(nx - e.x, ny - e.y); e.x = nx; e.y = ny;
      e.name = p.n; e.sk = p.sk; e.w = p.w; e.g = p.g; e.hp = p.hp; e.mh = p.mh; e.fx = p.fx; e.fy = p.fy; e.at = p.at; e.rs = p.rs; e.dg = p.dg; e.sp = p.sp; e.lv = p.lv; e.seen = frame;
    }
    for (const [id, e] of this.players) if (e.seen !== frame) this.players.delete(id);
    const n = this.snaps[this.snaps.length - 1], age = (now - n.r) / 1000; this.arrows = n.a.map((r) => ({ ...r, x: r.x + r.vx * age, y: r.y + r.vy * age }));
  }
}
