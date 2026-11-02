// DOM user interface: HUD, hotbar, Minecraft-style inventory, in-inventory crafting, tooltips, chat, tutorial.
import { RARITY, RARITY_RU, SHAPE_NAMES, clamp } from './config.js';
import { iconURL, playerSprite, portrait, mk } from './sprites.js';
import { sfx } from './sfx.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STAT_RU = { might: 'Сила', vitality: 'Живучесть', agility: 'Ловкость', precision: 'Точность', fortune: 'Удача' };
const RES_DESC = { wood: 'Из дерева делают рукояти и простое оружие.', herb: 'Целебная трава. Нужна для настоек.', ore: 'Металл для клинков и брони.', hide: 'Шкура: тетивы, рукояти, лёгкая броня.',
  slime: 'Липкая основа для настоек.', crystal: 'Хрусталь: оружие редкого качества.', shard: 'Осколок разлома: лучшее оружие.', potion: 'ПКМ или Q — восстановить 48 здоровья.', arrows: 'Боеприпасы для луков. Тратятся при выстреле.' };
const NEAR_NAMES = { wood: 'дерево', herb: 'траву', ore: 'руду', crystal: 'кристалл', shard: 'осколок' };
export const NODE_NAMES = NEAR_NAMES;

export class UI {
  constructor(cb) {
    this.cb = cb; this.init = null; this.inv = null; this.open = null; this.held = null; this.sel = 0;
    this.craft = { tab: 'weapon', type: 'sword', mat: 'wood', gear: 'hide_vest', item: 'arrows' };
    this.hot = []; this.gridHot = []; this.gridMain = []; this.lastStatus = {}; this.chatTimer = 0; this.skin = null;
    this.bindStatic();
  }
  get anyOpen() { return !!this.open; }
  bindStatic() {
    document.addEventListener('mousemove', (e) => { const c = $('cursor'); c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; const hd = $('held'); hd.style.left = e.clientX + 8 + 'px'; hd.style.top = e.clientY + 8 + 'px'; const t = $('tip'); if (!t.classList.contains('hidden')) this.placeTip(e.clientX, e.clientY); });
    $('chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) this.cb.chat(v); this.closeChat(); e.preventDefault(); }
      else if (e.key === 'Escape') { this.closeChat(); e.preventDefault(); }
      e.stopPropagation();
    });
  }
  // ------------------------------------------------------------------ setup --------
  setInit(init) {
    this.init = init; this.buildLegend(); this.buildHelp(); this.buildHotbar();
    $('hud').classList.remove('hidden'); $('cursor').classList.remove('hidden');
  }
  setSkin(skin) {
    this.skin = skin; const pc = $('portraitCv'), g = pc.getContext('2d'); g.clearRect(0, 0, 16, 16); g.drawImage(portrait(skin), 0, 0);
    const cc = $('charCv').getContext('2d'); cc.clearRect(0, 0, 18, 26); cc.drawImage(playerSprite(skin, 'd', 0), 0, 0);
  }
  buildLegend() {
    const rows = [['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', 'движение'], ['<kbd>Shift</kbd>', 'бег (тратит стамину)'], ['<kbd>Пробел</kbd>', 'рывок-уклонение'],
      ['<kbd>ЛКМ</kbd>', 'удар · держи = замах'], ['<kbd>ПКМ</kbd>', 'использовать предмет'], ['<kbd>E</kbd>', 'собрать ресурс'], ['<kbd>F</kbd>', 'говорить с Хранителем'],
      ['<kbd>Q</kbd>', 'выпить настойку'], ['<kbd>Ё</kbd>', 'инвентарь и крафт'], ['<kbd>1</kbd>–<kbd>9</kbd>', 'слот · колесо мыши'], ['<kbd>Z</kbd>', 'держать: дальний обзор'],
      ['<kbd>M</kbd>', 'карта'], ['<kbd>Enter</kbd>', 'чат'], ['<kbd>H</kbd>', 'все подсказки']];
    $('legend').innerHTML = rows.map(([k, t]) => `<div>${k}<span>${t}</span></div>`).join('');
  }
  buildHelp() {
    const sec = (t, rows) => `<h3>${t}</h3>` + rows.map(([k, d]) => `<div><span>${d}</span><span>${k}</span></div>`).join('');
    $('helpBody').innerHTML = sec('Движение и бой', [['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / стрелки', 'Идти (с разгоном и скольжением)'], ['<kbd>Shift</kbd> (удерживать)', 'Бег — тратит выносливость'], ['<kbd>Пробел</kbd>', 'Рывок: короткая неуязвимость, 24 стамины'],
      ['<kbd>ЛКМ</kbd> (удерживать → отпустить)', 'Замах и удар; чем дольше — тем сильнее и дальше отбрасывает'], ['Серия из 3 ударов', 'Третий удар — тяжёлый, с мощным отбрасыванием'], ['<kbd>Z</kbd> (удерживать)', 'Дальний обзор в сторону курсора']])
      + sec('Предметы', [['<kbd>Ё</kbd>', 'Инвентарь + крафт (верстак не нужен)'], ['<kbd>1</kbd>–<kbd>9</kbd> / колесо', 'Выбрать предмет в быстрой панели'], ['<kbd>ПКМ</kbd>', 'Надеть броню / выпить настойку'], ['<kbd>Q</kbd>', 'Выпить настойку'], ['<kbd>E</kbd>', 'Собрать ресурс рядом (стой на месте)']])
      + sec('Мир', [['<kbd>F</kbd>', 'Поговорить с Хранителем у костра (задания)'], ['<kbd>M</kbd>', 'Карта мира'], ['<kbd>Enter</kbd>', 'Чат'], ['<kbd>H</kbd>', 'Эта справка'], ['<kbd>F3</kbd>', 'FPS и пинг'], ['<kbd>N</kbd>', 'Звук вкл/выкл']])
      + `<h3>Подсказка</h3><div style="grid-column:1/-1;display:block">Без оружия ты дерёшься кулаками. Собери дерево (<kbd>E</kbd>), открой <kbd>Ё</kbd>, выбери в «Крафте» тип оружия и материал — ингредиент определяет урон, редкость и отбрасывание.</div>`;
  }
  // ------------------------------------------------------------------ items --------
  info(key) {
    if (!key) return null; const [t, id] = key.split(':'), I = this.init;
    if (t === 'w') { const w = I.weapons[id]; if (!w) return null; return { name: w.name, rarity: w.rarity, icon: iconURL('w:' + id, { color: w.color, shape: w.shape }), lines: this.weaponLines(w), act: 'ЛКМ — бить · выбери слот 1–9' }; }
    if (t === 'g') { const g = I.gear[id]; if (!g) return null; return { name: g.name, rarity: g.rarity, icon: iconURL('g:' + id, { color: g.color }), lines: [`Защита: +${g.defense}`, g.lore], act: 'ПКМ — надеть' }; }
    return { name: I.items[id] || id, rarity: 'common', icon: iconURL('r:' + id), lines: [RES_DESC[id] || ''], count: this.inv?.inventory[id] || 0, act: id === 'potion' ? 'ПКМ / Q — выпить' : '' };
  }
  weaponLines(w) {
    const L = [`${SHAPE_NAMES[w.shape] || 'Оружие'} · ${w.kind === 'bow' ? 'дальний бой' : w.kind === 'staff' ? 'посох' : 'ближний бой'}`, `Урон: ${w.damage}–${w.damage + w.bonus}`, `Отбрасывание: ${w.knock}`,
      `Замах: ${w.charge.toFixed(2)} с · пауза ${w.cooldown.toFixed(2)} с`, `Выносливость на удар: ${w.stamina}`];
    if (w.kind === 'melee' || w.kind === 'staff') L.push(`Дальность: ${w.range}`); else L.push('Тратит стрелы');
    return L;
  }
  fill(el, key) {
    const img = el.firstElementChild, cnt = el.querySelector('.cnt'); el.className = el.className.replace(/\br-\w+\b/g, '').trim();
    if (!key) { img.removeAttribute('src'); img.style.visibility = 'hidden'; if (cnt) cnt.textContent = ''; el.dataset.key = ''; return; }
    const inf = this.info(key); if (!inf) return; img.src = inf.icon; img.style.visibility = 'visible'; el.dataset.key = key;
    if (key[0] !== 'r' && inf.rarity !== 'common') el.classList.add('r-' + inf.rarity); if (cnt) cnt.textContent = key[0] === 'r' ? (inf.count > 1 ? inf.count : '') : '';
  }
  slotEl(i, withNum) {
    const el = document.createElement('div'); el.className = 'slot'; el.dataset.i = i;
    el.innerHTML = '<img alt=""><span class="cnt"></span>' + (withNum ? `<i class="num">${i + 1}</i>` : ''); return el;
  }
  buildHotbar() {
    const hb = $('hotbar'); hb.innerHTML = ''; this.hot = [];
    for (let i = 0; i < 9; i++) {
      const el = this.slotEl(i, true); hb.appendChild(el); this.hot.push(el);
      el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); if (e.button === 0) { this.cb.select(i); sfx.click(); } else if (e.button === 2) this.cb.use(i); });
      this.hoverTip(el);
    }
  }
  hoverTip(el) {
    el.addEventListener('mouseenter', (e) => { const k = el.dataset.key; if (k) this.showTip(k, e.clientX, e.clientY); });
    el.addEventListener('mouseleave', () => $('tip').classList.add('hidden'));
  }
  showTip(key, x, y) {
    const inf = this.info(key); if (!inf) return; const t = $('tip');
    t.innerHTML = `<b style="color:${RARITY[inf.rarity]}">${esc(inf.name)}</b><div class="l">${inf.rarity !== 'common' || key[0] !== 'r' ? RARITY_RU[inf.rarity] : ''}</div>` + inf.lines.map((l) => `<div>${esc(l)}</div>`).join('') + (inf.act ? `<div class="a">${esc(inf.act)}</div>` : '');
    t.classList.remove('hidden'); this.placeTip(x, y);
  }
  placeTip(x, y) { const t = $('tip'); const w = t.offsetWidth, h = t.offsetHeight; t.style.left = Math.min(innerWidth - w - 8, x + 18) + 'px'; t.style.top = Math.max(4, Math.min(innerHeight - h - 8, y + 18)) + 'px'; }
  // ------------------------------------------------------------------ inventory sync ---
  setInv(m) {
    const prevSel = this.sel; this.inv = m; this.sel = m.sel;
    const slots = m.slots; for (let i = 0; i < 9; i++) this.fill(this.hot[i], slots[i]);
    this.hot.forEach((el, i) => el.classList.toggle('sel', i === m.sel));
    if (prevSel !== m.sel || !this._nameInit) { this.flashName(); this._nameInit = true; }
    $('gold').textContent = '⛁ ' + m.gold; $('lvl').textContent = m.level; this.renderQuest();
    if (this.open === 'inv') this.renderInv();
  }
  flashName() {
    const key = this.inv.slots[this.inv.sel], inf = key ? this.info(key) : null, n = $('itemName');
    n.textContent = inf ? inf.name : 'Кулаки'; n.style.color = inf ? RARITY[inf.rarity] : '#e8c9a0'; n.style.opacity = 1; clearTimeout(this._nt); this._nt = setTimeout(() => (n.style.opacity = 0), 1800);
  }
  buildGrid(count) {
    const mg = $('mainGrid'), hg = $('hotGrid'); mg.innerHTML = ''; hg.innerHTML = ''; this.gridMain = []; this.gridHot = [];
    for (let i = 9; i < count; i++) { const el = this.slotEl(i); mg.appendChild(el); this.gridMain[i] = el; this.bindGridSlot(el, i); }
    for (let i = 0; i < 9; i++) { const el = this.slotEl(i, true); hg.appendChild(el); this.gridHot[i] = el; this.bindGridSlot(el, i); }
    this._gridCount = count;
  }
  bindGridSlot(el, i) {
    this.hoverTip(el);
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (e.button === 2) { this.cb.use(i); sfx.click(); return; }
      const slots = this.inv.slots;
      if (e.shiftKey && slots[i]) { const range = i < 9 ? [9, slots.length] : [0, 9]; for (let j = range[0]; j < range[1]; j++) if (!slots[j]) { this.cb.move(i, j); sfx.click(); return; } return; }
      if (this.held === null) { if (slots[i]) { this.held = i; sfx.click(); this.updateHeld(); } }
      else { if (this.held !== i) this.cb.move(this.held, i); this.held = null; sfx.click(); this.updateHeld(); }
    });
  }
  updateHeld() {
    const hd = $('held'), key = this.held !== null ? this.inv.slots[this.held] : null; const inf = key && this.info(key);
    if (inf) { hd.querySelector('img').src = inf.icon; hd.classList.remove('hidden'); } else hd.classList.add('hidden');
    [...this.gridHot, ...this.gridMain].forEach((el, k) => el && el.classList.toggle('held', this.held !== null && +el.dataset.i === this.held));
  }
  renderInv() {
    const I = this.inv, count = Math.max(45, Math.ceil(I.slots.length / 9) * 9);
    if (this._gridCount !== count) this.buildGrid(count);
    for (let i = 9; i < count; i++) this.fill(this.gridMain[i], I.slots[i]);
    for (let i = 0; i < 9; i++) { this.fill(this.gridHot[i], I.slots[i]); this.gridHot[i].classList.toggle('sel', i === I.sel); }
    const g = this.init.gear[I.gear], a = $('armorSlot'); a.firstElementChild.src = iconURL('g:' + I.gear, { color: g.color }); a.firstElementChild.style.visibility = 'visible';
    a.onmouseenter = (e) => this.showTip('g:' + I.gear, e.clientX, e.clientY); a.onmouseleave = () => $('tip').classList.add('hidden'); a.onmousedown = () => this.cb.unequip();
    const wk = I.slots[I.sel], hs = $('handSlot'); if (wk && wk[0] === 'w') { const w = this.init.weapons[wk.slice(2)]; hs.firstElementChild.src = iconURL(wk, { color: w.color, shape: w.shape }); } else hs.firstElementChild.src = iconURL('w:fists', { color: '#e8c9a0', shape: 'fists' });
    $('charName').textContent = this.cb.name(); $('charLv').textContent = `Уровень ${I.level} · убийств ${I.kills}`; $('charDef').textContent = `Защита: ${I.defense}`;
    $('spPts').textContent = I.skill_points > 0 ? `(очков: ${I.skill_points})` : '';
    $('statsBox').innerHTML = Object.keys(STAT_RU).map((k) => `<div class="st"><span>${STAT_RU[k]}: <b>${I.stats[k]}</b></span>${I.skill_points > 0 ? `<button data-s="${k}">+</button>` : ''}</div>`).join('');
    $('statsBox').querySelectorAll('button').forEach((b) => (b.onclick = () => { this.cb.upgrade(b.dataset.s); sfx.click(); }));
    this.renderCraft();
  }
  // ------------------------------------------------------------------ crafting -----
  renderCraft() {
    const I = this.inv, R = this.init.recipes, C = this.craft, inv = I.inventory;
    $('craftTabs').innerHTML = [['weapon', 'Оружие'], ['gear', 'Броня'], ['item', 'Расходники']].map(([k, n]) => `<button class="tab ${C.tab === k ? 'on' : ''}" data-t="${k}">${n}</button>`).join('');
    $('craftTabs').querySelectorAll('button').forEach((b) => (b.onclick = () => { C.tab = b.dataset.t; sfx.click(); this.renderCraft(); }));
    const costHtml = (cost) => `<div class="cost">${Object.entries(cost).map(([k, v]) => `<span class="${(inv[k] || 0) >= v ? 'yes' : 'no'}"><img src="${iconURL('r:' + k)}" alt="">${this.init.items[k]} ${inv[k] || 0}/${v}</span>`).join('')}</div>`;
    const affordable = (cost) => Object.entries(cost).every(([k, v]) => (inv[k] || 0) >= v);
    let html = '';
    if (C.tab === 'weapon') {
      const id = `${C.type}_${C.mat}`, rec = R.all[id], w = this.init.weapons[id], cur = (I.slots[I.sel] && I.slots[I.sel][0] === 'w' && this.init.weapons[I.slots[I.sel].slice(2)]) || this.init.weapons.fists, owned = I.weapons.includes(id);
      html += '<div class="pick">' + Object.entries(R.types).map(([k, t]) => { const mc = R.materials[C.mat].color; return `<button class="chip ${C.type === k ? 'on' : ''}" data-ty="${k}"><img src="${iconURL('w:' + k + '_' + C.mat, { color: mc, shape: t.shape })}" alt="">${t.name}</button>`; }).join('') + '</div>';
      html += '<div class="pick">' + Object.entries(R.materials).map(([k, m]) => `<button class="chip ${C.mat === k ? 'on' : ''} ${(inv[k] || 0) < (R.all[C.type + '_' + k].cost[k] || 0) ? 'lack' : ''}" data-m="${k}"><img src="${iconURL('r:' + k)}" alt="">${m.name} <small>×${inv[k] || 0}</small></button>`).join('') + '</div>';
      const avg = (x) => x.damage + x.bonus / 2, cmp = (a, b, inv2) => { const d = a - b; return Math.abs(d) < .05 ? '' : `<em class="${(d > 0) !== inv2 ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d) >= 10 ? Math.round(Math.abs(d)) : Math.abs(d).toFixed(1)}</em>`; };
      const row = (n, val, max, a, b, inv2 = false, txt) => `<div class="stat"><span>${n}</span><div class="t"><i style="width:${clamp(val / max * 100, 3, 100)}%"></i></div><em>${txt ?? Math.round(val)}</em></div>`.replace('</em></div>', `</em></div>`);
      const spd = (x) => 1 / (x.cooldown + x.charge * .6);
      html += `<div class="card"><div class="top"><img src="${iconURL('w:' + id, { color: w.color, shape: w.shape })}" alt=""><div><div class="nm" style="color:${RARITY[w.rarity]}">${esc(w.name)}</div><div class="kind">${RARITY_RU[w.rarity]} · ${w.kind === 'bow' ? 'дальний бой' : w.kind === 'staff' ? 'посох' : 'ближний бой'}</div></div></div>`
        + row('Урон', avg(w), 90, 0, 0, false, `${w.damage}–${w.damage + w.bonus} ${cmp(avg(w), avg(cur), false)}`)
        + row('Отбрасывание', w.knock, 650, 0, 0, false, `${w.knock} ${cmp(w.knock, cur.knock, false)}`)
        + row('Скорость', spd(w), 3.8, 0, 0, false, `${spd(w).toFixed(1)}/с ${cmp(spd(w), spd(cur), false)}`)
        + row(w.kind === 'bow' ? 'Дальность' : 'Дальность', w.kind === 'bow' ? 700 : w.range, 90, 0, 0, false, w.kind === 'bow' ? 'до 800' : String(w.range))
        + row('Расход стамины', w.stamina, 28, 0, 0, true, `${w.stamina} ${cmp(w.stamina, cur.stamina, true)}`)
        + costHtml(rec.cost) + `<button class="big" id="doCraft" ${owned || !affordable(rec.cost) ? 'disabled' : ''}>${owned ? 'Уже изготовлено' : affordable(rec.cost) ? 'Изготовить' : 'Не хватает ресурсов'}</button></div>`;
      $('craftBody').innerHTML = html; this.bindCraft(id);
      $('craftBody').querySelectorAll('[data-ty]').forEach((b) => (b.onclick = () => { C.type = b.dataset.ty; sfx.click(); this.renderCraft(); }));
      $('craftBody').querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { C.mat = b.dataset.m; sfx.click(); this.renderCraft(); }));
      return;
    }
    const list = Object.entries(R.all).filter(([, r]) => r.kind === C.tab), key = C.tab === 'gear' ? 'gear' : 'item', selId = list.find(([k]) => k === C[key]) ? C[key] : list[0][0];
    C[key] = selId; const sr = R.all[selId];
    html += list.map(([k, r]) => { const nm = r.kind === 'gear' ? this.init.gear[k].name : r.name, sub = r.kind === 'gear' ? `Защита +${this.init.gear[k].defense}` : '', ic = r.kind === 'gear' ? iconURL('g:' + k, { color: this.init.gear[k].color }) : iconURL('r:' + Object.keys(r.out)[0]);
      return `<button class="recipe ${selId === k ? 'on' : ''}" data-r="${k}"><img src="${ic}" alt=""><span>${esc(nm)}<small>${sub}</small></span></button>`; }).join('');
    const owned = sr.kind === 'gear' && (I.gear === selId || I.gear_inventory.includes(selId));
    html += `<div class="card">${costHtml(sr.cost)}<button class="big" id="doCraft" ${owned || !affordable(sr.cost) ? 'disabled' : ''}>${owned ? 'Уже есть' : affordable(sr.cost) ? 'Изготовить' : 'Не хватает ресурсов'}</button></div>`;
    $('craftBody').innerHTML = html; this.bindCraft(selId);
    $('craftBody').querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { C[key] = b.dataset.r; sfx.click(); this.renderCraft(); }));
  }
  bindCraft(id) { const b = $('doCraft'); if (b) b.onclick = () => { if (!b.disabled) this.cb.craft(id); else sfx.deny(); }; }
  craftResult(m) {
    const el = $('craftMsg'); el.textContent = m.text; el.className = m.ok ? 'ok' : 'bad'; if (m.ok) { sfx.craft(); this.addChat(m.text, 'sys'); } else sfx.deny();
  }
  // ------------------------------------------------------------------ overlays -----
  toggle(name) {
    if (this.open === name) return this.close();
    this.close(); this.open = name; document.body.classList.add('menu'); $('cursor').classList.add('hidden');
    const el = { inv: 'inv', help: 'help', map: 'mapOv' }[name]; $(el).classList.remove('hidden');
    if (name === 'inv') { this._gridCount = 0; this.renderInv(); $('craftMsg').textContent = ''; }
    sfx.click(); this.cb.menuChanged?.(name);
  }
  close() {
    if (!this.open) return; for (const id of ['inv', 'help', 'mapOv']) $(id).classList.add('hidden');
    this.open = null; this.held = null; this.updateHeld?.(); $('held').classList.add('hidden'); $('tip').classList.add('hidden'); document.body.classList.remove('menu'); $('cursor').classList.remove('hidden'); this.cb.menuChanged?.(null);
  }
  // ------------------------------------------------------------------ HUD ----------
  setStatus(row, st) {
    const L = this.lastStatus, hp = row.hp, mh = row.mh;
    if (L.hp !== hp || L.mh !== mh) { $('hpFill').style.width = clamp(hp / mh * 100, 0, 100) + '%'; $('hpText').textContent = `${hp}/${mh}`; if (hp > (L.hp ?? 0)) $('hpGhost').style.width = clamp(hp / mh * 100, 0, 100) + '%'; else setTimeout(() => ($('hpGhost').style.width = clamp(this.lastStatus.hp / this.lastStatus.mh * 100, 0, 100) + '%'), 0); L.hp = hp; L.mh = mh; $('hurt').classList.toggle('low', hp / mh < .3); }
    const stv = Math.round(st); if (L.st !== stv || L.ms !== row.ms || L.ex !== row.ex) {
      $('stFill').style.width = clamp(st / row.ms * 100, 0, 100) + '%'; $('stText').textContent = stv; const b = $('stBar'); b.classList.toggle('low', st / row.ms < .25); b.classList.toggle('ex', !!row.ex); $('exhaust').classList.toggle('hidden', !row.ex); L.st = stv; L.ms = row.ms; L.ex = row.ex;
    }
    if (L.xp !== row.xp || L.xpn !== row.xpn) { $('xpFill').style.width = clamp(row.xp / row.xpn * 100, 0, 100) + '%'; L.xp = row.xp; L.xpn = row.xpn; }
    const cb = row.cb && row.at !== undefined ? row.cb : 0; if (L.cb !== cb) { L.cb = cb; }
  }
  combo(n) { const t = $('comboTag'); t.classList.toggle('hidden', n < 1); t.textContent = n >= 2 ? 'ТЯЖЁЛЫЙ УДАР!' : 'КОМБО ×' + (n + 1); }
  hurt() { const h = $('hurt'); h.classList.add('on'); clearTimeout(this._ht); this._ht = setTimeout(() => h.classList.remove('on'), 90); }
  setZone(z) { $('zoneName').textContent = `${z.name} · ${z.level}`; }
  banner(title, sub) { const b = $('banner'); b.innerHTML = `${esc(title)}<small>${esc(sub || '')}</small>`; b.classList.add('on'); clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.remove('on'), 2800); }
  prompt(html, progress) {
    const p = $('prompt'); if (!html) { if (!p.classList.contains('hidden')) p.classList.add('hidden'); this._pk = ''; return; }
    const key = html + (progress > 0 ? 'p' : ''); if (this._pk !== key) { p.innerHTML = html + (progress > 0 ? '<div class="pb"><i></i></div>' : ''); this._pk = key; } p.classList.remove('hidden'); const i = p.querySelector('.pb i'); if (i) i.style.width = progress * 100 + '%';
  }
  renderQuest() {
    const q = this.inv.quest, Q = this.init.quests, b = $('questBody');
    if (q.stage >= q.total) { b.innerHTML = '<span class="ok">Все поручения выполнены!</span>'; return; }
    const d = Q[q.stage], mobName = this.init.monsters[d.mob]?.name || d.mob;
    if (!q.active) { b.innerHTML = `«${esc(d.title)}»<br><span class="l">Поговори с Хранителем у костра — <kbd>F</kbd></span>`; return; }
    const k = q.kills[d.mob] || 0, g = d.res ? q.gather[d.res] || 0 : 0, done = (a, n) => (a >= n ? 'ok' : '');
    b.innerHTML = `«${esc(d.title)}»<br><span class="${done(k, d.mob_n)}">${esc(mobName)}: ${Math.min(k, d.mob_n)}/${d.mob_n}</span>` + (d.res ? `<br><span class="${done(g, d.res_n)}">${esc(this.init.items[d.res])}: ${Math.min(g, d.res_n)}/${d.res_n}</span>` : '') + (k >= d.mob_n && (!d.res || g >= d.res_n) ? '<br><span class="ok">Готово! Вернись к Хранителю (<kbd>F</kbd>)</span>' : '');
  }
  // ------------------------------------------------------------------ chat ---------
  addChat(text, cls = '', name = '') {
    const log = $('chatLog'), d = document.createElement('div'); if (cls) d.className = cls;
    d.innerHTML = (name ? `<span class="nm">${esc(name)}:</span> ` : '') + esc(text); log.appendChild(d); while (log.children.length > 40) log.firstChild.remove();
    setTimeout(() => d.classList.add('old'), 9000);
  }
  openChat() { $('chat').classList.add('typing'); const i = $('chatInput'); i.classList.remove('hidden'); i.value = ''; i.focus(); this.typing = true; }
  closeChat() { $('chat').classList.remove('typing'); const i = $('chatInput'); i.classList.add('hidden'); i.blur(); this.typing = false; }
  // ------------------------------------------------------------------ tutorial -----
  tutorial(step) {
    const t = $('tutorial'); if (step == null) { t.classList.add('hidden'); return; }
    const S = [
      ['Двигайся', '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> — ходьба, <kbd>Shift</kbd> — бег. Целься мышью.'],
      ['Собери дерево', 'Подойди к дереву с зелёной кроной и нажми <kbd>E</kbd>. Нужно ≈6 дерева.'],
      ['Открой крафт', 'Нажми <kbd>Ё</kbd> — открывается инвентарь с крафтом. Верстак не нужен.'],
      ['Изготовь оружие', 'Вкладка «Оружие» → тип «Меч» + материал «Дерево» → <b>Изготовить</b>.'],
      ['Возьми оружие в руки', 'Выбери предмет в нижней панели клавишами <kbd>1</kbd>–<kbd>9</kbd> или колесом мыши.'],
      ['В бой!', 'Зажми <kbd>ЛКМ</kbd> для замаха и отпусти для удара. <kbd>Пробел</kbd> — рывок. Ищи слизней в Шепчущем лесу →'],
    ][step];
    t.innerHTML = `<b>${step + 1}/6 · ${S[0]}</b><br>${S[1]}<small>Подсказки можно скрыть — <kbd>H</kbd> показывает все клавиши</small>`; t.classList.remove('hidden');
  }
  perf(text) { const p = $('perf'); if (text == null) p.classList.add('hidden'); else { p.classList.remove('hidden'); p.textContent = text; } }
  conn(text) { const c = $('conn'); if (!text) c.classList.add('hidden'); else { c.classList.remove('hidden'); c.innerHTML = text; } }
}
