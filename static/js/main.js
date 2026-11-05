// Les Echo 2.0 client: input, camera, combat feel and the render pipeline (low-res canvas, integer upscale).
import { PX, VIEW_H, BLOOD_BY_KIND, TONES, clamp, lerp, expo, hash2 } from './config.js';
import { World } from './world.js';
import { mk, playerSprite, mobSprite, weaponSprite, decorSprites, nodeSprite, whiteOf } from './sprites.js';
import { FX, drawGlyphs } from './fx.js';
import { Net } from './net.js';
import { UI, NODE_NAMES } from './ui.js';
import { sfx } from './sfx.js';
import { music } from './music.js';

const $ = (id) => document.getElementById(id);
const cv = $('game'); let ctx = cv.getContext('2d', { alpha: false });
const V = { W: 640, H: 360, css: 3, vig: null, vigRed: null };
let init = null, world = null, net = null, ui = null, myName = '', running = false;
const fx = new FX();
const keys = new Set(), mouse = { cx: innerWidth / 2, cy: innerHeight / 2, down: false };
const cam = { x: 0, y: 0, ox: 0, oy: 0 };
const atk = { charging: false, t0: 0, lastRel: -1e9, lastCombo: 0, combo: 0, pending: 0 };
const me = { id: '', x: 0, y: 0, vx: 0, vy: 0, fx: 1, fy: 0, sk: [0, 0, 0, 0, 0, 0], w: 'fists', phase: 0, flash: 0, sq: 0, swing: null, swingDir: 1, trail: [], at: 0, kick: [0, 0], isMe: true };
let inv = null, row = null, stSm = 100, lastZone = '', tutStep = +(localStorage.getItem('echo_tut') || 0), openedInv = false, walked = 0, dead = false, frameId = 0, lastMini = 0, bigMapBase = null, miniBase = null;
const perf = { frames: 0, acc: 0, last: performance.now(), fps: 60, avg: 16, max: 0, slow: 0, show: false, since: 0 };
const mw = { x: 0, y: 0 }, aim = { x: 1, y: 0 };

// ------------------------------------------------------------------ view ----------------
function resize() {
  const dpr = window.devicePixelRatio || 1, S = Math.max(1, Math.round(innerHeight * dpr / VIEW_H));
  V.W = Math.ceil(innerWidth * dpr / S); V.H = Math.ceil(innerHeight * dpr / S); V.W += V.W & 1; V.H += V.H & 1; V.css = S / dpr;  // even size: the screen centre is a whole pixel
  cv.width = V.W; cv.height = V.H; cv.style.width = V.W * V.css + 'px'; cv.style.height = V.H * V.css + 'px';
  ctx = cv.getContext('2d', { alpha: false }); ctx.imageSmoothingEnabled = false;
  document.documentElement.style.setProperty('--u', V.css + 'px');
  // The pixel font (Tiny5) has an 8-px grid: keep every text size a multiple of 8 *device* pixels so glyphs stay crisp.
  for (const [k, n] of Object.entries({ xs: 4.4, sm: 5, md: 6, lg: 7, xl: 9, xxl: 12, title: 15 })) {
    const phys = Math.max(8, Math.round(n * V.css * dpr / 8) * 8); document.documentElement.style.setProperty('--fs-' + k, phys / dpr + 'px');
  }
  for (const [k, a] of [['vig', .5], ['vigRed', 1]]) {
    const c = mk(V.W, V.H), g = c.getContext('2d'), gr = g.createRadialGradient(V.W / 2, V.H / 2, V.H * .38, V.W / 2, V.H / 2, Math.hypot(V.W, V.H) * .55);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, k === 'vig' ? 'rgba(0,0,0,.55)' : 'rgba(190,20,20,.8)'); g.fillStyle = gr; g.fillRect(0, 0, V.W, V.H); V[k] = c;
  }
}
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ auth ----------------
const authMode = { m: 'login' };
document.querySelectorAll('#authForm .tabs button').forEach((b) => b.addEventListener('click', () => {
  authMode.m = b.dataset.mode; document.querySelectorAll('#authForm .tabs button').forEach((x) => x.classList.toggle('on', x === b));
  $('authPass2Wrap').classList.toggle('hidden', authMode.m !== 'register'); $('authGo').textContent = authMode.m === 'login' ? 'Войти в лес' : 'Создать героя'; $('authErr').textContent = '';
}));
$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const u = $('authUser').value.trim(), p = $('authPass').value;
  if (authMode.m === 'register' && p !== $('authPass2').value) { $('authErr').textContent = 'Пароли не совпадают.'; return; }
  try {
    const r = await fetch('/api/auth/' + authMode.m, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) { $('authErr').textContent = j.detail || 'Ошибка входа.'; return; }
    myName = j.username; start();
  } catch { $('authErr').textContent = 'Нет связи с сервером.'; }
});
fetch('/api/auth/me').then((r) => r.json()).then((j) => { if (j.authenticated) { myName = j.username; start(); } else $('authUser').focus(); }).catch(() => {});
document.body.classList.add('menu');
addEventListener('pointerdown', () => music.unlock(), { once: true, passive: true });
addEventListener('keydown', () => music.unlock(), { once: true });
addEventListener('pagehide', () => music.fadeOut(.5), { once: true });

function start() {
  if (running) return; running = true;
  ui = new UI({
    select: (i) => net.send({ type: 'select_slot', slot: i }), use: (i) => net.send({ type: 'use_slot', slot: i }), move: (a, b) => net.send({ type: 'inv_move', a, b }),
    craft: (id) => net.send({ type: 'craft2', id }), unequip: () => net.send({ type: 'unequip_gear' }), upgrade: (stat) => net.send({ type: 'upgrade', stat }),
    chat: (text) => net.send({ type: 'chat', text }), name: () => myName, menuChanged: (n) => { if (n === 'inv') openedInv = true; if (n) releaseInputs(); },
  });
  net = new Net({
    onInit: (m) => { init = m; world = new World(m); ui.setInit(m); $('auth').classList.add('hidden'); document.body.classList.remove('menu'); me.id = m.you; miniBase = world.mapBase(252, 144); ui.conn(null); },
    onInv: (m) => { inv = m; ui.setInv(m); },
    onSnap: onSnap, onEvent: onEvent,
    onClose: () => { ui.conn('Соединение потеряно.<br><small>Обнови страницу, чтобы вернуться в лес.</small>'); },
  });
  window.__echo = { net, fx, ui, cam, me, atk, startSwing }; // debug handle: inspect in the browser console
  document.fonts?.load('8px Pix', 'Лес Эхо 0123');
  net.connect(); requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ net callbacks ----------
function onSnap(m, r) {
  const first = !row; row = r;
  if (first || r.sk.join() !== me.sk.join()) { me.sk = r.sk; ui.setSkin(r.sk); if (!first) { ui.addChat('Ты возродился с новым обликом.', 'sys'); } }
  if (first) { cam.x = r.x; cam.y = r.y; ui.addChat(`Добро пожаловать, ${myName}! Нажми H — все клавиши.`, 'sys'); }
  if (r.rs && !dead) { dead = true; ui.banner('Ты пал', 'возрождение в лагере…'); fx.shake(.8); } else if (!r.rs && dead) { dead = false; }
  const z = world.zoneAt(r.x);
  if (z.id !== lastZone) { lastZone = z.id; ui.setZone(z); if (!first) ui.banner(z.name, z.level); }
  music.setZone(z.id);
  let nearbyBoss = null;
  for (const mob of (m?.m || [])) {
    const monster = init.monsters[mob.k];
    if (mob.k !== 'echo_dragon' && !monster?.boss) continue;
    if (Math.hypot(mob.x - r.x, mob.y - r.y) <= 640) { nearbyBoss = mob.k; break; }
  }
  music.setBoss(nearbyBoss);
}
function onEvent(m) {
  switch (m.type) {
    case 'hit': return onHit(m);
    case 'hit_player': return onHitPlayer(m);
    case 'pvp_hit': { const e = net.players.get(m.id) || (m.id === net.you ? me : null); fx.blood(m.x, m.y, m.nx || 0, m.ny || 0, .6); if (m.id === net.you) { ui.hurt(); fx.shake(.4, m.nx, m.ny); } else if (e) e.flash = .1; return sfx.hit(.8); }
    case 'weapon_action': return onWeaponAction(m);
    case 'dash': { if (m.id !== net.you) { const e = net.players.get(m.id); if (e) e.dashT = .22; } fx.dust(m.x, m.y, m.dx * 200, m.dy * 200, 8); return; }
    case 'craft_result': return ui.craftResult(m);
    case 'chat': return ui.addChat(m.text, '', m.name);
    case 'notice': { ui.addChat(m.text, 'sys'); if (/уровня/.test(m.text)) { sfx.level(); fx.burst(me.x, me.y, ['#ffe28a', '#fff6c0', '#ffffff'], 40, 220, 160, 1.1); fx.ring(me.x, me.y, 70, '#ffe28a', .6); } else if (/Найдено оружие|Добыча|добыча/.test(m.text)) sfx.pick(); return; }
    case 'error': return ui.addChat(m.text || m.message || 'Ошибка', 'bad');
    case 'spell_fx': case 'ability_impact': case 'ground_pulse': return;
  }
}
function onHit(m) {
  const e = net.mobs.get(m.mob), info = init.monsters[m.kind] || {}, x = e ? e.x : m.x, y = e ? e.y : m.y;
  let nx = m.nx, ny = m.ny; if (nx === undefined) { const a = Math.random() * 6.283; nx = Math.cos(a); ny = Math.sin(a); }
  const force = m.force || 150, mine = m.by === net.you, power = clamp(force / 500 + m.damage / 70, .35, 1.5), r = info.r || 20;
  fx.blood(x, y - r * .3, nx, ny, power, BLOOD_BY_KIND[m.kind] || 'flesh', m.killed);
  fx.sparks(x, y - r * .4, m.critical ? '#ffe28a' : '#fff6c0', m.critical ? 10 : 5, 200);
  fx.text(x, y - r - 10, m.damage, m.critical ? '#ffd24a' : mine ? '#ffffff' : '#c8d0d8', m.critical);
  if (e) { e.flash = .09; e.kx = nx * (6 + power * 5); e.ky = ny * (6 + power * 5); e.sq = 2; if (m.killed) { e.dead = performance.now(); } }
  if (mine) { fx.stop(m.killed ? 95 : m.critical ? 70 : 42); fx.shake(.12 + power * .22 + (m.killed ? .2 : 0), nx, ny); const c = $('cursor'); c.classList.add('hit'); setTimeout(() => c.classList.remove('hit'), 90); }
  if (m.killed) { fx.burst(x, y - r * .4, ['#ffffff', '#ffe28a'], 10, 160, 90, .5); sfx.kill(); } else if (m.critical) sfx.crit(); else sfx.hit(clamp(power, .5, 1.2));
}
function onHitPlayer(m) {
  const mineHit = m.id === net.you, tx = mineHit ? me.x : (net.players.get(m.id)?.x ?? m.x), ty = mineHit ? me.y : (net.players.get(m.id)?.y ?? m.y);
  fx.blood(tx, ty - 10, m.nx || 0, m.ny || 0, clamp(m.damage / 30, .4, 1.2)); fx.text(tx, ty - 34, '-' + m.damage, mineHit ? '#ff6a5a' : '#c8d0d8');
  if (mineHit) { ui.hurt(); fx.shake(.45, m.nx, m.ny); fx.stop(55); sfx.hurt(); me.flash = .12; me.sq = 2; const kb = Math.min(520, 150 + m.damage * 6); net.me.kx += (m.nx || 0) * kb; net.me.ky += (m.ny || 0) * kb; }
  else { const e = net.players.get(m.id); if (e) e.flash = .1; }
}
function onWeaponAction(m) {
  if (m.id === net.you) return; const e = net.players.get(m.id); if (!e) return;
  startSwing(e, m.weapon, m.weapon_kind, m.charge, m.combo, Math.atan2(m.aim_y, m.aim_x), m.x, m.y);
}

// ------------------------------------------------------------------ swings / attacks -------
function startSwing(e, wid, kind, charge, combo, ang, wx, wy) {
  const w = init.weapons[wid] || init.weapons.fists, heavy = combo === 2;
  if (kind === 'bow') { e.swing = { t: 0, dur: .14, kind: 'bow', dir: 1, arc: 0 }; fx.dust(wx, wy, Math.cos(ang) * -100, Math.sin(ang) * -100, 2); if (e === me) sfx.bow(); return; }
  e.swingDir = (e.swingDir || 1) * -1; if (heavy) e.swingDir = 1;
  const arc = (w.shape === 'spear' ? .35 : w.shape === 'axe' ? 2.6 : w.shape === 'dagger' ? 1.7 : 2.1) * (heavy ? 1.25 : 1), dur = w.shape === 'dagger' ? .12 : heavy ? .22 : .17;
  e.swing = { t: 0, dur, kind: w.shape, dir: e.swingDir, arc, heavy };
  const reach = (w.range || 40) + 8 + charge * 14;
  // the blade is flipped when aiming left (drawWeapon: flipY), so its sweep direction is swingDir * flipY: the trail must follow it
  fx.slash(wx, wy - 6, ang, arc * (w.shape === 'spear' ? 1 : .95), reach, w.shape === 'fists' ? '#f6e6c8' : w.color, dur + .05, heavy ? 5 : 3, e.swingDir * (Math.cos(ang) < 0 ? -1 : 1));
  if (e === me) { sfx.swing(heavy ? 1 : 0); me.kick = [Math.cos(ang) * 3, Math.sin(ang) * 2]; }
}
const curWeapon = () => init.weapons[inv?.weapon] || init.weapons.fists;
const canAct = () => !dead && !ui.anyOpen && !ui.typing && row && !row.rs;
function attackStart(now) {
  if (!canAct() || atk.charging) return; const w = curWeapon();
  if (now - atk.lastRel < w.cooldown * 1000) return;
  if (stSm < 5) { sfx.deny(); return; }
  if (w.kind === 'bow' && !(inv.inventory.arrows > 0)) { ui.addChat('Колчан пуст — изготовь стрелы: Ё, вкладка «Расходники».', 'bad'); sfx.deny(); return; }
  atk.charging = true; atk.t0 = now; atk.pending = 0; net.send({ type: 'attack_start', aim_x: aim.x, aim_y: aim.y });
}
function attackRelease(now) {
  if (!atk.charging) return; const held = (now - atk.t0) / 1000;
  if (held < .15) { if (!atk.pending) atk.pending = setTimeout(() => { atk.pending = 0; attackRelease(performance.now()); }, (.16 - held) * 1000); return; }
  atk.charging = false; const w = curWeapon(), charge = clamp(held / w.charge, 0, 1);
  net.send({ type: 'attack_release', aim_x: aim.x, aim_y: aim.y }); atk.lastRel = now;
  if (w.kind !== 'bow') { atk.combo = now - atk.lastCombo <= 750 ? (atk.combo + 1) % 3 : 0; atk.lastCombo = now; } else atk.combo = 0;
  const ang = Math.atan2(aim.y, aim.x), cost = w.stamina * (.62 + .38 * charge);
  if (stSm >= cost) {
    startSwing(me, inv.weapon, w.kind, charge, atk.combo, ang, net.me.x, net.me.y);
    if (w.kind === 'melee') { const l = (95 + 45 * charge) * (atk.combo === 2 ? 1.4 : 1); net.me.kx += aim.x * l; net.me.ky += aim.y * l; }
    else if (w.kind === 'bow' && inv.inventory.arrows > 0) { const rc = 60 + 90 * charge; net.me.kx -= aim.x * rc; net.me.ky -= aim.y * rc; }
    stSm -= cost; ui.combo(w.kind === 'bow' ? 0 : atk.combo);
  }
}
function tryDash() {
  if (!canAct() || !row.dr || stSm < init.phys.dash_cost) { if (canAct()) sfx.deny(); return; }
  let dx = input().x, dy = input().y; if (Math.hypot(dx, dy) < .1) { dx = aim.x; dy = aim.y; } const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  net.me.kx = dx * init.phys.dash; net.me.ky = dy * init.phys.dash; stSm -= init.phys.dash_cost; row.dr = 0; net.send({ type: 'dodge' }); me.dashT = .22; sfx.dash(); fx.dust(net.me.x, net.me.y, dx * 300, dy * 300, 8);
}
function releaseInputs() { keys.clear(); if (atk.charging) { atk.charging = false; net.send({ type: 'attack_release', aim_x: aim.x, aim_y: aim.y }); } net.send({ type: 'gather_stop' }); net.sendInput({ x: 0, y: 0, sprint: 0 }, aim, performance.now(), true); }

// ------------------------------------------------------------------ input ---------------
const K = (c) => keys.has(c);
function input() {
  if (ui?.anyOpen || ui?.typing || dead) return { x: 0, y: 0, sprint: 0 };
  let x = (K('KeyD') || K('ArrowRight') ? 1 : 0) - (K('KeyA') || K('ArrowLeft') ? 1 : 0), y = (K('KeyS') || K('ArrowDown') ? 1 : 0) - (K('KeyW') || K('ArrowUp') ? 1 : 0);
  if (x && y) { x *= .7071; y *= .7071; } return { x, y, sprint: K('ShiftLeft') || K('ShiftRight') ? 1 : 0 };
}
addEventListener('keydown', (e) => {
  if (!ui) return; if (ui.typing) return;
  if (e.code === 'Backquote') { e.preventDefault(); if (!ui.open || ui.open === 'inv') ui.toggle('inv'); return; }
  if (e.code === 'Escape') { if (ui.open) ui.close(); return; }
  if (e.code === 'KeyH') { if (!ui.open || ui.open === 'help') ui.toggle('help'); return; }
  if (e.code === 'KeyM') { if (!ui.open || ui.open === 'map') { ui.toggle('map'); if (ui.open) drawBigMap(); } return; }
  if (e.code === 'F3') { e.preventDefault(); perf.show = !perf.show; if (!perf.show) ui.perf(null); return; }
  if (e.code === 'KeyN') { const muted = sfx.toggle(); music.setMuted(muted); ui.addChat(muted ? 'Звук выключен.' : 'Звук включён.', 'sys'); return; }
  if (e.code === 'Enter') { e.preventDefault(); ui.openChat(); releaseInputs(); return; }
  if (ui.open) return;
  if (e.repeat) { if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); return; }
  if (e.code === 'Space') { e.preventDefault(); tryDash(); return; }
  if (e.code === 'KeyE') { net.send({ type: 'gather_start' }); return; }
  if (e.code === 'KeyF') { net.send({ type: 'interact' }); return; }
  if (e.code === 'KeyQ') { net.send({ type: 'use_potion' }); return; }
  if (/^Digit[1-9]$/.test(e.code)) { net.send({ type: 'select_slot', slot: +e.code[5] - 1 }); sfx.click(); return; }
  keys.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'KeyE' && net) net.send({ type: 'gather_stop' }); });
addEventListener('blur', () => { if (net?.connected) releaseInputs(); });
addEventListener('mousemove', (e) => { mouse.cx = e.clientX; mouse.cy = e.clientY; });
addEventListener('mousedown', (e) => { if (!ui || ui.anyOpen || ui.typing || e.target.closest?.('#hotbar')) return; if (e.button === 0) { mouse.down = true; attackStart(performance.now()); } else if (e.button === 2) net.send({ type: 'use_slot', slot: inv.sel }); });
addEventListener('mouseup', (e) => { if (e.button === 0 && mouse.down) { mouse.down = false; if (net) attackRelease(performance.now()); } });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { if (!ui || ui.open || !inv) return; const d = e.deltaY > 0 ? 1 : -1; net.send({ type: 'select_slot', slot: (inv.sel + d + 9) % 9 }); sfx.click(); }, { passive: true });

// ------------------------------------------------------------------ frame -----------------
let tPrev = performance.now(), tClock = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(.05, (now - tPrev) / 1000); tPrev = now; if (!row || !init) return;
  frameId++; tClock += raw; perfTick(now, raw);
  const inp = input(), dt = raw;
  // physics prediction for the local player
  const mobile = net.me;
  net.predict(dt, inp, init.phys, { agility: inv?.stats.agility || 1, exhausted: !!row.ex, stamina: stSm, charging: atk.charging, W: init.world.w, H: init.world.h });
  stSm = lerp(stSm, row.st, expo(10, dt)); if (row.st > stSm + 8 || row.ex) stSm = row.st;
  // aim + camera
  const aimWx = cam.x + ((mouse.cx - (innerWidth - V.W * V.css) / 2) / V.css - V.W / 2) / PX, aimWy = cam.y + ((mouse.cy - (innerHeight - V.H * V.css) / 2) / V.css - V.H / 2) / PX;
  mw.x = aimWx; mw.y = aimWy; let ax = aimWx - mobile.x, ay = aimWy - (mobile.y - 10); const al = Math.hypot(ax, ay) || 1; aim.x = ax / al; aim.y = ay / al;
  const peek = K('KeyZ') && !ui.anyOpen, look = peek ? .85 : .33, maxLook = peek ? 440 : 170;
  let lx = (aimWx - mobile.x) * look + (mobile.vx + mobile.kx * .3) * .2, ly = (aimWy - mobile.y) * look + (mobile.vy + mobile.ky * .3) * .2; const ll = Math.hypot(lx, ly);
  if (ll > maxLook) { lx *= maxLook / ll; ly *= maxLook / ll; } if (ui.anyOpen) { lx = ly = 0; }
  cam.ox += (lx - cam.ox) * expo(peek ? 7 : 12, dt); cam.oy += (ly - cam.oy) * expo(peek ? 7 : 12, dt);
  cam.x += (mobile.x + cam.ox - cam.x) * expo(20, dt); cam.y += (mobile.y + cam.oy - cam.y) * expo(20, dt);
  // networking
  net.sendInput(inp, aim, now);
  // local entity mirror
  Object.assign(me, { x: mobile.x, y: mobile.y, vx: mobile.vx + mobile.kx, vy: mobile.vy + mobile.ky, w: inv?.weapon || 'fists', g: row.g, hp: row.hp, mh: row.mh, fx: aim.x, fy: aim.y, dg: me.dashT > 0 ? 1 : 0, sp: mobile.sprinting ? 1 : 0, lv: row.lv });
  me.at = atk.charging ? clamp((now - atk.t0) / 1000 / curWeapon().charge, 0, 1) : 0; if (me.dashT > 0) me.dashT -= dt;
  walked += Math.hypot(mobile.vx, mobile.vy) * dt;
  // remote clock honours hit-stop
  net.sample(now, frameId, fx.stopDebt);
  fx.update(dt);
  ambient(dt, mobile); ui.setStatus(row, stSm); hudLogic(now);
  render(now, dt);
}

function ambient(dt, m) {
  const sp = Math.hypot(m.vx, m.vy);
  if (m.sprinting && Math.random() < dt * 30) fx.dust(m.x, m.y, m.vx, m.vy, 1);
  else if (sp > 120 && Math.random() < dt * 9) fx.dust(m.x, m.y, m.vx, m.vy, 1);
  const z = world.zoneAt(m.x).id; if (Math.random() < dt * 2.2 && (z === 'forest' || z === 'garden' || z === 'marsh')) { fx.add(cam.x + (Math.random() - .5) * V.W / PX, cam.y + (Math.random() - .5) * V.H / PX, 10 + Math.random() * 10, 0, 0, 0, 3, 1, z === 'garden' ? '#ffd6ec' : '#e8ff9a', 2); }
  if ((z === 'rift' || z === 'abyss' || z === 'obsidian') && Math.random() < dt * 3) fx.add(cam.x + (Math.random() - .5) * V.W / PX, cam.y + (Math.random() - .5) * V.H / PX, 8, 0, -10, 0, 2.5, 1, z === 'obsidian' ? '#ff8a3a' : '#c88aff', 2);
}

// ------------------------------------------------------------------ HUD logic --------------
function hudLogic(now) {
  const m = net.me; let html = '', prog = 0;
  if (canAct()) {
    let best = null, bd = 64;
    for (let i = 0; i < world.nodes.length; i++) { if (net.off.has(i)) continue; const n = world.nodes[i], d = Math.hypot(n[1] - m.x, n[2] - m.y); if (d < bd) { bd = d; best = n; } }
    const kp = world.stations.keeper;
    if (best) { html = `<kbd>E</kbd> собрать ${NODE_NAMES[best[0]] || best[0]}${row.ga ? ' — держи позицию' : ''}`; prog = row.ga || 0; }
    else if (Math.hypot(kp[0] - m.x, kp[1] - m.y) < 120) html = '<kbd>F</kbd> поговорить с Хранителем';
    else if (row.hp / row.mh < .5 && inv?.inventory.potion > 0) html = '<kbd>Q</kbd> выпить настойку';
  }
  ui.prompt(html, prog);
  if (!ui._tt || now - ui._tt > 250) {
    ui._tt = now;
    if (tutStep < 6 && inv) {
      const wc = inv.inventory.wood || 0, hasW = inv.weapons.length > 0;
      if (inv.kills > 0 || (hasW && inv.weapon !== 'fists' && tutStep >= 4)) tutStep = 6;
      else if (tutStep === 0 && walked > 400) tutStep = 1; else if (tutStep === 1 && (wc >= 6 || hasW)) tutStep = 2;
      else if (tutStep === 2 && (openedInv || hasW)) tutStep = 3; else if (tutStep === 3 && hasW) tutStep = 4; else if (tutStep === 4 && inv.weapon !== 'fists') tutStep = 5;
      localStorage.setItem('echo_tut', tutStep); ui.tutorial(tutStep < 6 ? tutStep : null);
    } else if (tutStep >= 6) ui.tutorial(null);
    if (perf.show) ui.perf(`${perf.fps.toFixed(0)} FPS · кадр ${perf.avg.toFixed(1)} мс (макс ${perf.max.toFixed(0)})\nпинг ${net.rtt.toFixed(0)} мс · сеть ${(net.bytes / 1024 / Math.max(1, (now - perf.since) / 1000)).toFixed(1)} КБ/с\nмобов ${net.mobs.size} · частиц ${fx.n} · качество ${fx.quality.toFixed(1)}`);
    if (!perf.since) perf.since = now; if (now - perf.since > 5000) { perf.since = now; net.bytes = 0; }
    $('legend').classList.toggle('min', tutStep >= 6 && !ui.open && now - (ui._legT || (ui._legT = now)) > 15000);
  }
  if (now - lastMini > 120) { lastMini = now; drawMini(); if (ui.open === 'map') drawBigMap(); }
}
function perfTick(now, raw) {
  perf.frames++; perf.acc += raw * 1000; perf.max = Math.max(perf.max * .995, raw * 1000);
  if (now - perf.last > 500) { perf.fps = perf.frames * 1000 / (now - perf.last); perf.avg = perf.acc / perf.frames; perf.frames = 0; perf.acc = 0; perf.last = now;
    if (perf.avg > 19.5) perf.slow++; else perf.slow = Math.max(0, perf.slow - 1);
    if (perf.slow >= 4 && fx.quality > .35) { fx.quality = Math.max(.35, fx.quality - .25); fx.cap = Math.round(2200 * fx.quality); perf.slow = 0; }
  }
}

// ------------------------------------------------------------------ minimap --------------
function drawMini() {
  const c = $('miniCv'); if (c.width !== 112) { c.width = 112; c.height = 64; } const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const m = net.me, W = 3000, H = 1700, sx = (m.x - W / 2) / world.w * 252, sy = (m.y - H / 2) / world.h * 144, sw = W / world.w * 252, sh = H / world.h * 144;
  g.fillStyle = '#0c0e0c'; g.fillRect(0, 0, 112, 64); g.drawImage(miniBase, sx, sy, sw, sh, 0, 0, 112, 64);
  const to = (x, y) => [(x - (m.x - W / 2)) / W * 112, (y - (m.y - H / 2)) / H * 64];
  for (const e of net.mobs.values()) { if (e.dead) continue; const [x, y] = to(e.x, e.y), boss = init.monsters[e.kind]?.boss; g.fillStyle = boss ? '#ffd24a' : '#ff5a4a'; g.fillRect(x - 1, y - 1, boss ? 3 : 2, boss ? 3 : 2); }
  for (const e of net.players.values()) { const [x, y] = to(e.x, e.y); g.fillStyle = '#6ad8ff'; g.fillRect(x - 1, y - 1, 3, 3); }
  const [kx, ky] = to(...world.stations.keeper); g.fillStyle = '#ffe28a'; g.fillRect(kx - 1, ky - 1, 3, 3);
  g.fillStyle = Math.floor(tClock * 3) % 2 ? '#fff' : '#9fd8ff'; g.fillRect(55, 31, 3, 3);
}
function drawBigMap() {
  const c = $('bigMap'); if (c.width !== 252) { c.width = 252; c.height = 144; } const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(miniBase, 0, 0);
  const k = 252 / world.w; g.font = '7px Pix, monospace'; g.textBaseline = 'top';
  for (const z of world.zones) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(z.x0 * k, 0, 1, 144); g.fillStyle = '#fff'; g.fillText(z.name.split(' ')[0], z.x0 * k + 2, 2); g.fillStyle = '#ffe28a'; g.fillText(z.level.replace('Уровень ', 'Ур.').replace('Безопасная зона', 'Дом'), z.x0 * k + 2, 11); }
  for (const s of init.power_sites) { g.fillStyle = '#9fffc8'; g.fillRect(s.x * k - 1, s.y * k - 1, 3, 3); }
  g.fillStyle = '#ffe28a'; g.fillRect(world.stations.keeper[0] * k - 1, world.stations.keeper[1] * k - 1, 3, 3);
  for (const e of net.players.values()) { g.fillStyle = '#6ad8ff'; g.fillRect(e.x * k - 1, e.y * k - 1, 3, 3); }
  g.fillStyle = Math.floor(tClock * 3) % 2 ? '#fff' : '#ff6a5a'; g.fillRect(net.me.x * k - 2, net.me.y * k - 2, 4, 4);
}

// ------------------------------------------------------------------ rendering --------------
const flipCache = new WeakMap();
const flipOf = (c) => { let f = flipCache.get(c); if (!f) { f = mk(c.width, c.height); const g = f.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); flipCache.set(c, f); } return f; };
const draws = []; let drawN = 0;
const push = (y, k, a, b) => { let o = draws[drawN]; if (!o) o = draws[drawN] = { y: 0, k: 0, a: null, b: null }; o.y = y; o.k = k; o.a = a; o.b = b; drawN++; };
const tmpDecor = [];
function render(now, dt) {
  const [shx, shy] = fx.shakeOffset(), W = V.W, H = V.H;
  CPX = Math.round(cam.x * PX); CPY = Math.round(cam.y * PX); const cx = CPX / PX, cy = CPY / PX;  // camera snapped to whole art pixels: no relative jitter
  ctx.setTransform(1, 0, 0, 1, shx, shy);
  const range = world.draw(ctx, cx, cy, W, H, PX);
  fx.drawDecals(ctx, cx, cy, W, H);
  fx.drawParticles(ctx, cx, cy, W, H, 0);  // footstep dust lies on the ground, under every character
  const x0 = cx - W / 2 / PX, x1 = cx + W / 2 / PX, y0 = cy - H / 2 / PX, y1 = cy + H / 2 / PX;
  groundLayer(now, x0, y0, x1, y1);
  drawN = 0; tmpDecor.length = 0; world.collectDecor(range, tmpDecor, x0, y0, x1, y1);
  for (const d of tmpDecor) push(d.y, 0, d);
  for (let i = 0; i < world.nodes.length; i++) { const n = world.nodes[i]; if (n[1] > x0 - 30 && n[1] < x1 + 30 && n[2] > y0 - 10 && n[2] < y1 + 60 && !net.off.has(i)) push(n[2], 1, n); }
  const kp = world.stations.keeper; if (kp[0] > x0 - 60 && kp[0] < x1 + 60 && kp[1] > y0 - 60 && kp[1] < y1 + 60) { push(kp[1], 2); push(kp[1] + 30, 6); }
  for (const e of net.mobs.values()) if (e.x > x0 - 90 && e.x < x1 + 90 && e.y > y0 - 60 && e.y < y1 + 120) push(e.y, 3, e);
  for (const e of net.players.values()) push(e.y, 4, e);
  push(me.y, 5, me);
  const list = draws; list.length = drawN; list.sort((a, b) => a.y - b.y);
  for (let i = 0; i < drawN; i++) { const o = list[i]; switch (o.k) { case 0: drawDecor(o.a); break; case 1: drawNode(o.a, now); break; case 2: drawKeeper(now); break; case 6: drawLabel(kp[0], kp[1] + 6, 'Хранитель', '#ffe28a'); break; case 3: drawMob(o.a, now, dt); break; default: drawPlayer(o.a, now, dt); } }
  draws.length = 0;
  drawArrows(now); fx.drawParticles(ctx, cx, cy, W, H); fx.drawSlashes(ctx, cx, cy, W, H); fx.drawTexts(ctx, cx, cy, W, H);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(V.vig, 0, 0);
  if (row.hp / row.mh < .3) { ctx.globalAlpha = .25 + .25 * Math.sin(tClock * 5); ctx.drawImage(V.vigRed, 0, 0); ctx.globalAlpha = 1; }
  edgeMarkers();
  const z = world.zoneAt(net.me.x).id; if (z === 'glacier') { ctx.fillStyle = 'rgba(200,240,255,.06)'; ctx.fillRect(0, 0, W, H); } else if (z === 'abyss' || z === 'obsidian') { ctx.fillStyle = 'rgba(30,10,50,.12)'; ctx.fillRect(0, 0, W, H); }
}
let CPX = 0, CPY = 0;
const sxOf = (wx) => Math.floor(wx * PX) - CPX + (V.W >> 1), syOf = (wy) => Math.floor(wy * PX) - CPY + (V.H >> 1);
function dotRing(cx, cy, r, col, n = 36, ry = .75, a = 1) { ctx.fillStyle = col; ctx.globalAlpha = a; for (let k = 0; k < n; k++) { const t = k / n * 6.283; ctx.fillRect(Math.floor(cx + Math.cos(t) * r), Math.floor(cy + Math.sin(t) * r * ry), 1, 1); } ctx.globalAlpha = 1; }
function groundLayer(now, x0, y0, x1, y1) {
  for (const s of init.power_sites) if (s.x > x0 - s.radius && s.x < x1 + s.radius && s.y > y0 - s.radius && s.y < y1 + s.radius) { const px = sxOf(s.x), py = syOf(s.y); dotRing(px, py, s.radius * PX, '#9fffc8', 60, .75, .45); dotRing(px, py, s.radius * PX * .6, '#9fffc8', 36, .75, .25 + .2 * Math.sin(tClock * 2)); if (Math.hypot(s.x - net.me.x, s.y - net.me.y) < s.radius) drawLabel(s.x, s.y - 4, s.name, '#9fffc8'); }
  for (const g of net.ground) { const px = sxOf(g.x), py = syOf(g.y); if (g.tl > 0) { dotRing(px, py, g.r * PX, '#ff4a3a', 40, .75, .6 + .4 * Math.sin(tClock * 18)); ctx.fillStyle = 'rgba(255,60,40,.14)'; ctx.fillRect(px - g.r * PX * .5, py - 2, g.r * PX, 4); } else { dotRing(px, py, g.r * PX, '#ff8a2a', 40, .75, .8); ctx.fillStyle = 'rgba(255,120,30,.18)'; for (let i = 0; i < 5; i++) ctx.fillRect(px + (hash2(i, g.x | 0) - .5) * g.r * PX, py + (hash2(i + 9, g.y | 0) - .5) * g.r * PX * .7, 3, 2); } }
  for (const t of net.thorns) dotRing(sxOf(t.x), syOf(t.y), t.r * PX, '#7ad85a', 28, .75, .7);
  // charge preview: range + hit arc so the player always sees what will be hit
  if (atk.charging && canAct()) {
    const w = curWeapon(), c = me.at, px = sxOf(net.me.x), py = syOf(net.me.y - 6), ang = Math.atan2(aim.y, aim.x);
    if (w.kind === 'bow') { const len = (180 + 620 * c) * PX; ctx.fillStyle = c >= 1 ? '#ffe28a' : '#ffffff'; ctx.globalAlpha = .55; for (let d = 14; d < len; d += 9) ctx.fillRect(Math.floor(px + aim.x * d), Math.floor(py + aim.y * d * .9), 1, 1); ctx.globalAlpha = 1; }
    else { const r = ((w.range || 44) + 12 * c) * PX, half = (w.arc ?? .28) * 3.1416 / 1.1 + .3; ctx.fillStyle = c >= 1 ? '#ffe28a' : '#ffffff'; ctx.globalAlpha = .35 + .3 * c; for (let k = -6; k <= 6; k++) { const a = ang + k / 6 * half; ctx.fillRect(Math.floor(px + Math.cos(a) * r), Math.floor(py + Math.sin(a) * r * .9), 1, 1); } ctx.globalAlpha = 1; }
  }
}
function drawLabel(wx, wy, text, col) { const px = sxOf(wx), py = syOf(wy); ctx.font = '8px Pix, monospace'; ctx.textBaseline = 'top'; ctx.textAlign = 'center'; ctx.fillStyle = '#000'; ctx.fillText(text, px + 1, py + 1); ctx.fillStyle = col; ctx.fillText(text, px, py); ctx.textAlign = 'left'; }
function shadow(sx, sy, w) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(sx - w, sy - 1, w * 2, 3); ctx.fillRect(sx - w + 2, sy - 2, w * 2 - 4, 5); }
function drawDecor(d) { const s = d.s, px = sxOf(d.x), py = syOf(d.y); const near = s.tall && Math.abs(net.me.x - d.x) < 26 && net.me.y < d.y && net.me.y > d.y - 60; if (near) ctx.globalAlpha = .55; ctx.drawImage(s.c, px - s.ax, py - s.ay); ctx.globalAlpha = 1; }
function drawNode(n, now) {
  const s = nodeSprite(n[0]), px = sxOf(n[1]), py = syOf(n[2]), d = Math.hypot(n[1] - net.me.x, n[2] - net.me.y), near = d < 64; shadow(px, py, 6); ctx.drawImage(s.c, px - s.ax, py - s.ay);
  if (near) { const b = Math.round(Math.sin(tClock * 6) * 1.5); ctx.fillStyle = '#ffe28a'; ctx.fillRect(px - 1, py - 26 + b, 3, 3); ctx.fillRect(px - 2, py - 27 + b, 5, 1); dotRing(px, py - 6, 11, '#ffe28a', 20, .75, .5); }
  else if (d < 360) { ctx.globalAlpha = .6; ctx.fillStyle = '#fff'; if ((tClock * 2 + n[1]) % 2 < .15) ctx.fillRect(px + 3, py - 14, 1, 1); ctx.globalAlpha = 1; }
}
function drawKeeper(now) {
  const kp = world.stations.keeper, px = sxOf(kp[0]), py = syOf(kp[1]);
  // campfire
  const fx0 = sxOf(kp[0] + 50), fy0 = syOf(kp[1] + 40); shadow(fx0, fy0, 7); ctx.fillStyle = '#5e3a20'; ctx.fillRect(fx0 - 6, fy0 - 3, 12, 3); ctx.fillStyle = '#8a5a34'; ctx.fillRect(fx0 - 5, fy0 - 5, 10, 2);
  const f = Math.sin(tClock * 14) * 1; ctx.fillStyle = '#d6451d'; ctx.fillRect(fx0 - 3, fy0 - 9 + f, 6, 5); ctx.fillStyle = '#ff9a2a'; ctx.fillRect(fx0 - 2, fy0 - 11 + f, 4, 6); ctx.fillStyle = '#ffe28a'; ctx.fillRect(fx0 - 1, fy0 - 9 + f, 2, 4);
  ctx.globalAlpha = .1; ctx.fillStyle = '#ffb040'; for (let r = 40; r > 10; r -= 10) { ctx.fillRect(fx0 - r, fy0 - r * .6, r * 2, r * 1.2); } ctx.globalAlpha = 1;
  if (Math.random() < .12) fx.add(kp[0] + 50 + (Math.random() - .5) * 8, kp[1] + 40, 8, (Math.random() - .5) * 20, -5, 0, .8, 1, '#ffb040', 2);
  // keeper
  shadow(px, py, 7); const spr = playerSprite([2, 5, 1, 3, 0, 2], 'd', Math.floor(now / 200) % 5, 'idle'); ctx.drawImage(spr, px - 13, py - 35 + Math.round(Math.sin(tClock * 2) * .6));
  const d = Math.hypot(kp[0] - net.me.x, kp[1] - net.me.y); if (d < 120) { ctx.fillStyle = '#ffe28a'; ctx.fillRect(px - 1, py - 32 + Math.round(Math.sin(tClock * 6)), 3, 5); ctx.fillRect(px - 1, py - 25 + Math.round(Math.sin(tClock * 6)), 3, 2); }
}
function drawMob(e, now, dt) {
  const info = init.monsters[e.kind] || {}, sp = Math.hypot(e.vx, e.vy); e.anim += dt * (sp > 20 ? 9 : 2.5);
  const spr = mobSprite(e.kind, info, e.id, Math.floor(e.anim) & 1); let img = spr.c; if (e.face < 0) img = flipOf(img);
  e.kx *= Math.exp(-14 * dt); e.ky *= Math.exp(-14 * dt); e.flash = Math.max(0, e.flash - dt); e.sq = Math.max(0, e.sq - dt * 14);
  let px = sxOf(e.x) + Math.round(e.kx), py = syOf(e.y) + Math.round(e.ky); shadow(px, py, Math.max(5, spr.S * .35));
  let alpha = 1, rise = 0; if (e.dead) { const t = (now - e.dead) / 700; if (t > 1) return; alpha = 1 - t * t; rise = Math.round(t * 6); }
  if (e.f & 1) { const tel = Math.sin(tClock * 22) > 0; dotRing(px, py - 2, (info.range || 40) * PX, tel ? '#ff3a2a' : '#ff9a5a', 28, .75, .9); ctx.fillStyle = '#ff3a2a'; ctx.fillRect(px - 1, py - spr.S - 12, 3, 5); ctx.fillRect(px - 1, py - spr.S - 5, 3, 2); }
  const sq = Math.round(e.sq), dw = img.width + sq, dh = img.height - sq, dx = px - (spr.ax) - (sq >> 1) * (e.face < 0 ? -1 : 1), dy = py - spr.ay + sq - rise;
  if (sp > 200 && !e.dead) { ctx.globalAlpha = .25; ctx.drawImage(img, dx - Math.sign(e.vx) * 3, dy - Math.sign(e.vy), dw, dh); ctx.globalAlpha = 1; }
  ctx.globalAlpha = alpha; ctx.drawImage(e.flash > 0 || (e.dead && (now - e.dead) < 90) ? whiteOf(img) : img, dx, dy, dw, dh); ctx.globalAlpha = 1;
  if (e.f & 2 && Math.random() < dt * 10) fx.add(e.x, e.y, 8, 0, 0, 20, .4, 1, '#ff8a2a', 0); if (e.f & 4 && Math.random() < dt * 6) fx.add(e.x, e.y, 8, 0, 0, 10, .5, 1, '#6ad8ff', 0);
  if (!e.dead && (info.boss || e.hp < e.max)) { const bw = info.boss ? 32 : 14, bx = px - (bw >> 1), by = py - spr.S - 5; ctx.fillStyle = '#120d0a'; ctx.fillRect(bx - 1, by - 1, bw + 2, 4); ctx.fillStyle = info.boss ? '#e0a030' : '#d6453d'; ctx.fillRect(bx, by, Math.max(1, Math.round(bw * e.hp / e.max)), 2); if (info.boss) drawLabel(e.x, e.y - spr.S / PX * 1 - 24, info.name, '#ffd27a'); }
}
function drawPlayer(e, now, dt) {
  const isMe = e.isMe; if (!isMe && e.rs) return; if (isMe && dead) return;
  const px = sxOf(e.x), py = syOf(e.y), sp = Math.hypot(e.vx, e.vy), moving = sp > 28;
  e.phase = (e.phase || 0) + sp * dt * .05;
  const fxv = e.fx ?? 1, fyv = e.fy ?? 0, angle = Math.atan2(fyv, fxv);
  // Eight directions clockwise: right, down-right, down, down-left, left, up-left, up, up-right.
  const dir = (Math.round(angle / (Math.PI / 4)) + 8) % 8, sk = e.sk || [0, 0, 0, 0, 0, 0];
  const mode = moving ? 'walk' : 'idle';
  const frame = moving ? Math.floor(e.phase) % 6 : 0;
  const img = playerSprite(sk, dir, frame, mode);
  e.flash = Math.max(0, (e.flash || 0) - dt); e.sq = Math.max(0, (e.sq || 0) - dt * 12);
  if (e.swing) { e.swing.t += dt; if (e.swing.t >= e.swing.dur + .08) e.swing = null; }
  if (e.dg || e.dashT > 0) { e.trail = e.trail || []; if (!e.trail.length || now - e.trail[e.trail.length - 1].t > 30) e.trail.push({ x: e.x, y: e.y, t: now, img }); if (e.trail.length > 6) e.trail.shift(); } else if (e.trail?.length) e.trail.shift();
  if (e.trail) for (const g of e.trail) { const a = Math.max(0, .5 - (now - g.t) / 260); if (a > 0) { ctx.globalAlpha = a; ctx.drawImage(whiteOf(g.img), sxOf(g.x) - 13, syOf(g.y) - 35); } } ctx.globalAlpha = 1;
  shadow(px, py, 7);
  const bob = moving ? ((Math.floor(e.phase * 2) & 1) ? -1 : 0) : (Math.sin(tClock * 3 + (e.x | 0)) > .8 ? -1 : 0), sq = Math.round(e.sq || 0) + (moving && sp > 230 ? 0 : 0);
  const kick = e.kick || [0, 0]; if (e.kick) { e.kick[0] *= Math.exp(-16 * dt); e.kick[1] *= Math.exp(-16 * dt); }
  const bx = px - 13 + Math.round(kick[0]) + (moving ? Math.round(Math.sign(e.vx) * Math.min(1, Math.abs(e.vx) / 200)) : 0) - (sq >> 1), by = py - 35 + bob + Math.round(kick[1]) + sq;
  const behind = dir >= 5; if (behind) drawWeapon(e, px, py, dir, now);
  const lean = img; ctx.drawImage(e.flash > 0 ? whiteOf(lean) : lean, bx, by, 27 + sq, 38 - sq);
  if (!behind) drawWeapon(e, px, py, dir, now);
  // overhead: name, health (others), charge bar (self)
  if (!isMe) { const nm = e.name || '?'; drawLabel(e.x, e.y - 36, nm, '#cfe8ff'); const hw = 16, bx2 = px - 8, by2 = py - 29; ctx.fillStyle = '#120d0a'; ctx.fillRect(bx2 - 1, by2 - 1, hw + 2, 4); ctx.fillStyle = '#d6453d'; ctx.fillRect(bx2, by2, Math.round(hw * (e.hp || 0) / (e.mh || 1)), 2); }
  const ch = isMe ? e.at : e.at || 0; if (ch > 0.04) { ctx.fillStyle = '#120d0a'; ctx.fillRect(px - 8, py + 3, 17, 4); ctx.fillStyle = ch >= 1 ? ((Math.floor(tClock * 14) & 1) ? '#fff6c0' : '#ffd24a') : '#e0a030'; ctx.fillRect(px - 7, py + 4, Math.round(15 * ch), 2); }
  if (isMe && row.ga) { ctx.fillStyle = '#120d0a'; ctx.fillRect(px - 8, py + 3, 17, 4); ctx.fillStyle = '#6fd06a'; ctx.fillRect(px - 7, py + 4, Math.round(15 * row.ga), 2); }
}
function drawWeapon(e, px, py, dir, now) {
  const w = init.weapons[e.w] || init.weapons.fists, a = Math.atan2(e.fy ?? 0, e.fx ?? 1), c = e.at || 0, sw = e.swing, hx = px + Math.round(Math.cos(a) * 3), hy = py - 9 + Math.round(Math.sin(a) * 3);
  const swinging = sw && sw.t < sw.dur, p = swinging ? sw.t / sw.dur : 0, ease = 1 - (1 - p) * (1 - p) * (1 - p);
  if (w.shape === 'fists') {
    const tone = TONES[(e.sk?.[0] || 0) % 6]; let reach = 0; if (swinging) reach = Math.sin(p * 3.1416) * 11; else if (c > 0) reach = -2 * c; else return;
    const fxp = Math.round(hx + Math.cos(a) * (4 + reach)), fyp = Math.round(hy + Math.sin(a) * (3 + reach * .8)); ctx.fillStyle = '#14100c'; ctx.fillRect(fxp - 3, fyp - 3, 6, 6); ctx.fillStyle = tone; ctx.fillRect(fxp - 2, fyp - 2, 4, 4); ctx.fillStyle = '#fff'; ctx.globalAlpha = .35; ctx.fillRect(fxp - 2, fyp - 2, 2, 1); ctx.globalAlpha = 1; return;
  }
  const spr = weaponSprite(w.shape, w.color), flipY = Math.cos(a) < 0 ? -1 : 1; let off = 0, reach = 0, scale = 1;
  if (w.kind === 'bow') { off = 0; reach = 2 - (swinging ? Math.sin(p * 3.14) * -2 : 0); }
  else if (swinging) { const dirS = sw.dir * flipY; off = (-sw.arc / 2 + ease * sw.arc) * dirS - (sw.kind === 'spear' ? 0 : 0); if (w.shape === 'spear') { off = 0; reach = Math.sin(p * 3.1416) * 12; } if (sw.heavy) scale = 1.15; }
  else if (c > 0) { off = -(.25 + 1.05 * c) * (e.swingDir || 1) * flipY; reach = -2.5 * c; if (c >= 1) { off += Math.sin(now * .05) * .06; } }
  else { off = .55 * flipY * (e.swingDir || 1) * -1; reach = -1; }
  ctx.save(); ctx.translate(hx + Math.round(Math.cos(a) * reach), hy + Math.round(Math.sin(a) * reach)); ctx.rotate(a + off); if (flipY < 0) ctx.scale(1, -1); if (scale !== 1) ctx.scale(scale, scale);
  if (w.kind === 'bow') { ctx.drawImage(spr, -9, -9); if (c > 0) { const pull = Math.round(c * 7); ctx.fillStyle = '#e8e4d0'; ctx.fillRect(3 - pull, -1, pull, 1); ctx.fillStyle = '#b8a47a'; ctx.fillRect(3 - pull, 0, 14 + pull, 1); } }
  else ctx.drawImage(spr, -5, -9);
  ctx.restore();
  if (w.kind === 'staff' && c > .3 && Math.random() < .5) fx.add(e.x + Math.cos(a) * 36, e.y - 14 + Math.sin(a) * 24, 10, 0, 0, 20, .3, 1, w.color, 2);
}
function drawArrows(now) {
  for (const a of net.arrows) {
    const px = sxOf(a.x), py = syOf(a.y), l = Math.hypot(a.vx, a.vy) || 1, dx = a.vx / l, dy = a.vy / l, ef = init.elements[a.el];
    if (a.kd === 'arrow' && !a.el) { ctx.fillStyle = '#c8b890'; for (let i = 0; i < 6; i++) ctx.fillRect(Math.floor(px - dx * i), Math.floor(py - dy * i), 1, 1); ctx.fillStyle = '#e8e8f0'; ctx.fillRect(Math.floor(px + dx), Math.floor(py + dy), 2, 2); if (Math.random() < .5) fx.add(a.x, a.y, 7, 0, 0, 0, .18, 1, '#e8e4d0', 2); }
    else { const col = ef?.colors || ['#9fd8ff', '#fff', '#fff']; ctx.fillStyle = col[0]; ctx.fillRect(px - 2, py - 2, 4, 4); ctx.fillStyle = col[1]; ctx.fillRect(px - 1, py - 1, 2, 2); if (Math.random() < .8) fx.add(a.x, a.y, 7, (Math.random() - .5) * 30, (Math.random() - .5) * 30, 0, .3, 1, col[(Math.random() * 3) | 0], 2); }
  }
}
function edgeMarkers() {
  const W = V.W, H = V.H, m = net.me; let n = 0;
  for (const e of net.mobs.values()) {
    if (e.dead || n > 10) continue; const dx = (e.x - cam.x) * PX, dy = (e.y - cam.y) * PX, hw = W / 2 - 8, hh = H / 2 - 8; if (Math.abs(dx) < hw + 8 && Math.abs(dy) < hh + 8) continue;
    if (Math.hypot(e.x - m.x, e.y - m.y) > 1500) continue; const s = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6)), mx = W / 2 + dx * s, my = H / 2 + dy * s, ang = Math.atan2(dy, dx), boss = init.monsters[e.kind]?.boss;
    ctx.fillStyle = boss ? '#ffd24a' : '#ff5a4a'; ctx.globalAlpha = .85; for (let i = 0; i < 4; i++) { const bx = mx - Math.cos(ang) * i * 1.3, by = my - Math.sin(ang) * i * 1.3, wd = 4 - i; ctx.fillRect(Math.round(bx - wd / 2), Math.round(by - wd / 2), wd, wd); } ctx.globalAlpha = 1; n++;
  }
}
