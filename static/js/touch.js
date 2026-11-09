// Touch controls for phones and tablets: floating move stick, aim+attack stick, action buttons and a menu row.
// Built on Pointer Events with pointer capture, so several fingers work at once (move + attack + dash).
const $ = (id) => document.getElementById(id);

// 12x12 pixel icons drawn with rectangles (the pixel font has no emoji)
function icon(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 12; const g = c.getContext('2d'); draw((col, x, y, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); }); return c.toDataURL();
}
const ICONS = {
  bag: () => icon((r) => { r('#14100c', 3, 0, 6, 2); r('#8a5a34', 4, 1, 4, 1); r('#14100c', 1, 2, 10, 9); r('#b07a44', 2, 3, 8, 7); r('#d6a064', 2, 3, 8, 2); r('#14100c', 5, 6, 2, 3); r('#f2c14e', 5, 6, 2, 2); }),
  map: () => icon((r) => { r('#14100c', 0, 1, 12, 10); r('#e8d9a8', 1, 2, 10, 8); r('#c4b07a', 4, 2, 1, 8); r('#c4b07a', 8, 2, 1, 8); r('#d6453d', 5, 4, 2, 2); r('#4f8a4a', 2, 6, 2, 2); r('#4a6fb0', 9, 3, 2, 2); }),
  chat: () => icon((r) => { r('#14100c', 0, 1, 12, 8); r('#f3ead2', 1, 2, 10, 6); r('#14100c', 2, 9, 3, 2); r('#f3ead2', 2, 9, 2, 1); r('#6a5a42', 3, 4, 6, 1); r('#6a5a42', 3, 6, 4, 1); }),
  menu: () => icon((r) => { for (const y of [2, 5, 8]) { r('#14100c', 1, y - 1, 10, 4); r('#f3ead2', 2, y, 8, 2); } }),
  dash: () => icon((r) => { r('#14100c', 0, 3, 11, 6); r('#9fd8ff', 1, 4, 9, 4); r('#fff', 1, 5, 6, 1); r('#14100c', 7, 2, 4, 8); r('#9fd8ff', 8, 3, 2, 6); r('#fff', 8, 5, 1, 2); }),
  hand: () => icon((r) => { r('#14100c', 2, 4, 8, 7); r('#f0b98e', 3, 5, 6, 5); r('#14100c', 2, 1, 2, 5); r('#f0b98e', 3, 2, 1, 4); r('#14100c', 5, 0, 2, 5); r('#f0b98e', 5, 1, 1, 4); r('#14100c', 8, 1, 2, 5); r('#f0b98e', 8, 2, 1, 3); }),
  full: () => icon((r) => { for (const [x, y, dx, dy] of [[0, 0, 1, 1], [8, 0, -1, 1], [0, 8, 1, -1], [8, 8, -1, -1]]) { r('#14100c', x, y, 4, 4); r('#f3ead2', x + (dx > 0 ? 1 : 0), y + (dy > 0 ? 1 : 0), 3, 1); r('#f3ead2', x + (dx > 0 ? 1 : 2), y + (dy > 0 ? 1 : 0), 1, 3); } }),
};

export class TouchUI {
  /** actions: attackStart/attackEnd/dash/potion/action/inventory/map/chat/menu; layout() is called when the mode changes */
  constructor(actions) {
    this.a = actions; this.enabled = false; this.u = 2.5;
    this.move = { x: 0, y: 0, sprint: false, active: false };
    this.aim = { x: 0, y: 0, active: false, pressing: false };
    this.pref = localStorage.getItem('echo_touch') || 'auto';
    this.auto = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0;
    this.shown = {}; this.lastTouch = -1e9; this.lastMouse = -1e9; this.build();
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.lastTouch = performance.now(); }, true);
    addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') this.lastMouse = performance.now(); }, true);
    this.set(this.pref === 'on' || (this.pref === 'auto' && this.auto));
    // a hybrid device switches on the first time it is touched
    addEventListener('touchstart', () => { if (this.pref === 'auto' && !this.enabled) this.set(true); }, { passive: true });
    for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault());   // no pinch-zoom on iOS
    this.orient();
    if (window.matchMedia) { const mq = matchMedia('(orientation: portrait)'); (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(() => this.orient()); }
  }
  /** the browser echoes every tap as mouse events; those must never trigger attacks */
  recentTouch() { return performance.now() - this.lastTouch < 800; }
  /** a hybrid device whose mouse was moved after the last touch keeps aiming with the mouse */
  recentMouse() { return this.lastMouse > this.lastTouch && performance.now() - this.lastMouse < 4000; }
  setPref(p) { this.pref = p; localStorage.setItem('echo_touch', p); this.set(p === 'on' || (p === 'auto' && this.auto)); }
  set(on) { this.enabled = on; document.body.classList.toggle('touch', on); $('touch').classList.toggle('hidden', !on); this.reset(); this.a.layout?.(); this.orient(); }
  reset() { Object.assign(this.move, { x: 0, y: 0, sprint: false, active: false }); Object.assign(this.aim, { active: false, pressing: false }); if ($('joyBase')) { $('joyBase').classList.add('hidden'); $('joyHint').classList.remove('hidden'); } }
  hide(b) { $('touch').classList.toggle('off', !!b); if (b) this.reset(); }       // covered by a menu / chat
  orient() {   // portrait works, but landscape is far better: say so once for a few seconds, then get out of the way
    const portrait = innerHeight > innerWidth, h = $('rotateHint'), show = this.enabled && portrait; clearTimeout(this._rt);
    h.classList.toggle('hidden', !show); h.classList.remove('fade'); if (show) this._rt = setTimeout(() => { h.classList.add('fade'); this._rt = setTimeout(() => h.classList.add('hidden'), 700); }, 5000);
  }
  // ------------------------------------------------------------------ DOM ------------------------------------------
  build() {
    const root = document.createElement('div'); root.id = 'touch'; root.className = 'hidden';
    root.innerHTML = `
      <div id="joyZone"></div>
      <div id="joyHint"></div><div id="joyBase" class="hidden"><i id="joyKnob"></i></div>
      <div id="menuRow">
        <button class="tb sm" data-act="inventory"><img alt=""><span>Рюкзак</span></button>
        <button class="tb sm" data-act="map"><img alt=""><span>Карта</span></button>
        <button class="tb sm" data-act="chat"><img alt=""><span>Чат</span></button>
        <button class="tb sm" data-act="menu"><img alt=""><span>Меню</span></button>
      </div>
      <div id="actCluster">
        <button id="btnAtk" class="tb xl"><img alt=""><span>Удар</span><i id="aimArrow"></i></button>
        <button id="btnDash" class="tb md" data-act="dash"><img alt=""><span>Рывок</span></button>
        <button id="btnAct" class="tb md dim" data-act="action"><img alt=""><span id="actLbl">Действие</span></button>
        <button id="btnPot" class="tb md" data-act="potion"><img alt=""><span>Лечение</span><b id="potN">0</b></button>
      </div>`;
    document.body.appendChild(root);
    const set = (sel, src) => { const i = root.querySelector(sel + ' img'); if (i) i.src = src; };
    set('[data-act="inventory"]', ICONS.bag()); set('[data-act="map"]', ICONS.map()); set('[data-act="chat"]', ICONS.chat()); set('[data-act="menu"]', ICONS.menu());
    set('#btnDash', ICONS.dash()); set('#btnAct', ICONS.hand());
    this.fullIcon = ICONS.full();
    for (const b of root.querySelectorAll('button[data-act]')) {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('press'); const f = this.a[b.dataset.act]; f && f(); });
      for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, () => b.classList.remove('press'));
    }
    this.bindStick(); this.bindAttack();
  }
  px(n) { return n * this.u; }   // `n` units -> css pixels (the UI unit --u)
  bindStick() {
    const zone = $('joyZone'), base = $('joyBase'), knob = $('joyKnob'); let id = null, cx = 0, cy = 0;
    const apply = (e) => {
      const R = this.px(17); let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy) || 1e-6, mag = Math.min(1, l / R), dead = .14;
      const k = Math.min(l, R) / l; knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      if (mag < dead) { this.move.x = this.move.y = 0; this.move.sprint = false; return; }
      const s = (mag - dead) / (1 - dead); this.move.x = dx / l * s; this.move.y = dy / l * s; this.move.sprint = l > R * 1.3;   // push the thumb past the ring to sprint
      base.classList.toggle('run', this.move.sprint);
    };
    zone.addEventListener('pointerdown', (e) => { if (id !== null) return; e.preventDefault(); id = e.pointerId; try { zone.setPointerCapture(id); } catch { /* old browsers: moves outside the zone just stop updating */ } cx = e.clientX; cy = e.clientY; this.move.active = true;
      base.style.left = cx + 'px'; base.style.top = cy + 'px'; base.classList.remove('hidden', 'run'); $('joyHint').classList.add('hidden'); knob.style.transform = 'translate(0,0)'; });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === id) apply(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; this.move.x = this.move.y = 0; this.move.sprint = false; this.move.active = false; base.classList.add('hidden'); $('joyHint').classList.remove('hidden'); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  }
  bindAttack() {
    const btn = $('btnAtk'), arrow = $('aimArrow'); let id = null, ox = 0, oy = 0;
    const apply = (e) => {
      const R = this.px(24); const dx = e.clientX - ox, dy = e.clientY - oy, l = Math.hypot(dx, dy);
      if (l > this.px(5)) { this.aim.x = dx / l; this.aim.y = dy / l; this.aim.active = true; arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`; arrow.classList.add('on'); }
      else { this.aim.active = false; arrow.classList.remove('on'); }
    };
    btn.addEventListener('pointerdown', (e) => { if (id !== null) return; e.preventDefault(); id = e.pointerId; try { btn.setPointerCapture(id); } catch { /* see above */ } const r = btn.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2;
      btn.classList.add('press'); this.aim.pressing = true; this.aim.active = false; apply(e); this.a.attackStart && this.a.attackStart(); });
    btn.addEventListener('pointermove', (e) => { if (e.pointerId === id) apply(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; btn.classList.remove('press'); arrow.classList.remove('on'); this.aim.pressing = false; this.a.attackEnd && this.a.attackEnd(); this.aim.active = false; };
    btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end);
  }
  // ------------------------------------------------------------------ per-frame state --------------------------------
  /** s = { weaponIcon, potions, dashReady, actKind, actLabel } — only touches the DOM when something changed */
  update(s) {
    const sh = this.shown, put = (k, v, fn) => { if (sh[k] !== v) { sh[k] = v; fn(v); } };
    put('w', s.weaponIcon, (v) => { $('btnAtk').querySelector('img').src = v; });
    put('p', s.potions, (v) => { $('potN').textContent = v; $('btnPot').classList.toggle('dim', !v); });
    put('d', s.dashReady, (v) => $('btnDash').classList.toggle('dim', !v));
    put('a', s.actKind + '|' + s.actLabel, () => { $('actLbl').textContent = s.actKind ? s.actLabel : 'Действие'; $('btnAct').classList.toggle('dim', !s.actKind); $('btnAct').classList.toggle('glow', !!s.actKind); });
  }
}
