// Player sprites: built on the 17x26 "naked bald figure" template (1-px black outline, white dot eyes, stubby limbs).
// Everything is layered from parts (legs, torso, arms, head, hair, beard, hat, clothes) with random appearance,
// then baked once per (appearance, direction, animation frame). 8 directions = 5 drawn views + 3 mirrored ones.
import { TONES, HAIRS, CLOTH, BOTTOMS, SHOES, HATC, TRIMS, shade } from './config.js';
import { mk } from './sprites.js';

export const PW = 27, PH = 38, OX = 5, OY = 9;     // canvas size and where the 17x26 figure sits on it
export const AX = 13, AY = 35;                       // anchor: ground contact point of the feet inside the canvas
export const DIR_NAMES = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const BASE = { E: ['E', 0], SE: ['SE', 0], S: ['S', 0], SW: ['SE', 1], W: ['E', 1], NW: ['NE', 1], N: ['N', 0], NE: ['NE', 0] };
/** 0..7 (E, SE, S, SW, W, NW, N, NE) from a facing vector in screen space (y points down). */
export const dir8 = (fx, fy) => (Math.round(Math.atan2(fy, fx) / (Math.PI / 4)) + 8) % 8;

// idle: 0 rest, 1 inhale, 2 inhale+arms out, 3 inhale (settling), 4 glance left, 5 glance right.  Durations in ms.
export const IDLE_FRAMES = 6, WALK_FRAMES = 6;
export const IDLE_LOOP = [[0, 760], [1, 170], [2, 520], [3, 170]];
export const IDLE_LOOK_L = [[4, 520], [0, 160], [5, 520], [0, 200]];

// ------------------------------------------------------------------ appearance --------------------------------
export function unpack(sk = []) {
  const v = (i, n) => ((sk[i] | 0) % n + n) % n;
  return { tone: v(0, 8), hair: v(1, 10), style: v(2, 8), beard: v(3, 4), top: v(4, 6), topc: v(5, 12), bottom: v(6, 3), botc: v(7, 10),
    shoes: v(8, 3), shoec: v(9, 6), hat: v(10, 7), hatc: v(11, 10), trim: v(12, 8) };
}
export const skinTone = (sk) => TONES[unpack(sk).tone];
/** colour of the sleeve that covers the arm (used when drawing the arm that holds a weapon) */
export function sleeveColor(sk) {
  const a = unpack(sk), tc = CLOTH[a.topc];
  return a.top === 1 || a.top === 3 ? tc : a.top === 4 ? '#8d98aa' : a.top === 0 ? tc : a.top === 5 ? TRIMS[a.trim] : TONES[a.tone];
}

// ------------------------------------------------------------------ geometry (figure space, 17 wide) ----------
const mir = (sp) => sp.map(([y, a, b]) => [y, 16 - b, 16 - a]);
const shift = (sp, dx = 0, dy = 0) => sp.map(([y, a, b]) => [y + dy, a + dx, b + dx]);
/** make the upper body 1px taller (breathing / walking bob): rows <= split move up, the split row is duplicated */
function stretch(sp, split, d) {
  if (!d) return sp; const out = [];
  for (const [y, a, b] of sp) { if (y <= split) { out.push([y - d, a, b]); if (y === split) for (let k = 0; k < d; k++) out.push([y - k, a, b]); } else out.push([y, a, b]); }
  return out;
}
const HEAD = [[1, 5, 11], [2, 4, 12], [3, 4, 12], [4, 4, 12], [5, 4, 12], [6, 4, 12], [7, 4, 12], [8, 5, 11], [9, 6, 10]];
const TORSO = [[10, 6, 10], [11, 4, 12], [12, 2, 14], [13, 2, 14], [14, 5, 11], [15, 5, 11], [16, 5, 11], [17, 4, 12], [18, 4, 12], [19, 4, 12]];
const ARM_L = [[14, 2, 3], [15, 1, 3], [16, 1, 2], [17, 1, 2], [18, 1, 1]], ARM_R = mir(ARM_L);
const ARM_FAR = [[14, 13, 13], [15, 13, 14], [16, 13, 14], [17, 14, 14], [18, 14, 14]];
const LEG_L = [[20, 4, 7], [21, 4, 6], [22, 4, 6], [23, 4, 6], [24, 4, 5]], LEG_R = mir(LEG_L);
const TORSO_E = [[10, 7, 10], [11, 5, 11], [12, 5, 11], [13, 5, 11], [14, 5, 11], [15, 5, 12], [16, 5, 12], [17, 5, 11], [18, 5, 11], [19, 5, 11]];
const ARM_E = [[13, 6, 8], [14, 6, 8], [15, 6, 8], [16, 6, 8], [17, 6, 8], [18, 7, 8]];
const LEG_E = [[20, 6, 9], [21, 6, 9], [22, 6, 9], [23, 6, 9], [24, 6, 10]];
const SKIRT = { S: [[20, 3, 13], [21, 3, 13], [22, 2, 14], [23, 2, 14]], E: [[20, 4, 12], [21, 4, 12], [22, 3, 13], [23, 3, 13]] };

// ------------------------------------------------------------------ pixel helpers ----------------------------------
function outline(cv, skipBelow = false) {  // 1-px black contour; skipBelow leaves the bottom edge open (torso sits directly on the legs)
  const g = cv.getContext('2d'), w = cv.width, h = cv.height, d = g.getImageData(0, 0, w, h).data, out = g.getImageData(0, 0, w, h), o = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (d[i + 3] > 0) continue;
    const up = y > 0 && d[i - w * 4 + 3] > 0, dn = y < h - 1 && d[i + w * 4 + 3] > 0, rt = x < w - 1 && d[i + 7] > 0, lf = x > 0 && d[i - 1] > 0;
    if (lf || rt || dn || (up && !skipBelow)) { o[i] = 18; o[i + 1] = 12; o[i + 2] = 10; o[i + 3] = 255; }
  }
  g.putImageData(out, 0, 0); return cv;
}
const rects = (g, col, list, dx = 0) => { g.fillStyle = col; for (const [x, y, w, h] of list) g.fillRect(x + dx, y, w, h); };
function part(fill, col, deco, skipBelow = false) {
  const cv = mk(PW, PH), g = cv.getContext('2d'); g.translate(OX, OY); g.fillStyle = col; for (const [y, a, b] of fill) g.fillRect(a, y, b - a + 1, 1);
  if (deco) { g.globalCompositeOperation = 'source-atop'; deco(g, fill); g.globalCompositeOperation = 'source-over'; }
  g.setTransform(1, 0, 0, 1, 0, 0); return outline(cv, skipBelow);
}
function edgeShade(g, fill, a = .14) { g.fillStyle = `rgba(0,0,0,${a})`; for (const [y, , b] of fill) g.fillRect(b, y, 1, 1); const [y, x0, x1] = fill[fill.length - 1]; g.fillStyle = `rgba(0,0,0,${a * .8})`; g.fillRect(x0, y, x1 - x0 + 1, 1); }

// ------------------------------------------------------------------ hair / hat / beard tables ----------------------
// [x, y, w, h] in S-view coordinates (head centre x=8). SE/NE use S/N shifted by +1; E has its own table (final coordinates).
const SHORT_S = [[5, 1, 7, 1], [4, 2, 9, 1], [4, 3, 2, 1], [11, 3, 2, 1], [6, 3, 1, 1], [10, 3, 1, 1]], SHORT_N = [[5, 1, 7, 1], [4, 2, 9, 6], [5, 8, 7, 1]];
const SHORT_E = [[6, 1, 7, 1], [5, 2, 9, 1], [10, 3, 3, 1], [5, 3, 4, 5]];
const HAIR = {
  1: { S: { f: SHORT_S }, N: { f: SHORT_N }, E: { f: SHORT_E } },
  2: { S: { f: [...SHORT_S, [5, -1, 1, 2], [7, -2, 1, 3], [9, -2, 1, 3], [11, -1, 1, 2]] }, N: { f: [...SHORT_N, [5, -1, 1, 2], [7, -2, 1, 3], [9, -2, 1, 3], [11, -1, 1, 2]] }, E: { f: [...SHORT_E, [6, -1, 1, 2], [8, -2, 1, 3], [10, -2, 1, 3], [12, -1, 1, 2]] } },
  3: { S: { f: [...SHORT_S, [3, 3, 2, 9], [12, 3, 2, 9]] }, N: { f: [...SHORT_N, [4, 9, 9, 1], [3, 10, 11, 4]] }, E: { f: [...SHORT_E, [5, 3, 4, 10]] } },
  4: { S: { f: SHORT_S, tail: [[13, 3, 2, 6]] }, N: { f: SHORT_N, tail: [[7, 9, 3, 7]] }, E: { f: SHORT_E, tail: [[2, 3, 3, 7]] } },
  5: { S: { f: [...SHORT_S, [7, -2, 3, 2], [8, -3, 1, 1]] }, N: { f: [...SHORT_N, [7, -2, 3, 2], [8, -3, 1, 1]] }, E: { f: [...SHORT_E, [6, -2, 3, 2], [7, -3, 1, 1]] } },
  6: { S: { f: [[7, -1, 3, 4]] }, N: { f: [[7, -1, 3, 9]] }, E: { f: [[7, -1, 6, 3]] } },
  7: { S: { b: [[4, -2, 9, 1], [3, -1, 11, 1], [2, 0, 13, 8], [3, 8, 2, 2], [12, 8, 2, 2]], f: [[5, 1, 7, 1], [4, 2, 9, 1]] }, N: { b: [[4, -2, 9, 1], [3, -1, 11, 1], [2, 0, 13, 8], [3, 8, 2, 2], [12, 8, 2, 2]], f: SHORT_N }, E: { b: [[5, -2, 9, 1], [4, -1, 11, 1], [3, 0, 13, 8], [4, 8, 3, 2]], f: [[6, 1, 7, 1], [5, 2, 9, 1]] } },
};
// hats: [colour key, x, y, w, h]; h=hat colour, d=dark, t=trim, s/S=steel, g=gold, r=red
const HATS = {
  1: { S: [['h', 4, 0, 9, 3], ['d', 4, 3, 9, 1]], N: [['h', 4, 0, 9, 3], ['d', 4, 3, 9, 1]], E: [['h', 5, 0, 9, 3], ['d', 5, 3, 6, 1], ['d', 12, 3, 3, 1]] },
  2: { A: [['d', 1, 2, 15, 1], ['h', 4, 1, 9, 1], ['h', 5, 0, 7, 1], ['h', 6, -1, 5, 1], ['h', 7, -2, 3, 1], ['h', 7, -3, 2, 1], ['h', 8, -4, 2, 1], ['t', 4, 1, 9, 1]] },
  3: { A: [['s', 4, 0, 9, 4], ['S', 4, 3, 9, 1], ['s', 6, -1, 5, 1]], F: [['S', 8, 4, 1, 3]] },
  4: { A: [['g', 4, 1, 9, 1], ['g', 4, 0, 1, 1], ['g', 6, -1, 1, 2], ['g', 8, -2, 1, 3], ['g', 10, -1, 1, 2], ['g', 12, 0, 1, 1], ['r', 8, 1, 1, 1]] },
  5: { S: [['h', 3, 0, 11, 3], ['h', 3, 3, 2, 7], ['h', 12, 3, 2, 7], ['d', 3, 10, 11, 1]], N: [['h', 3, 0, 11, 10], ['d', 3, 9, 11, 1], ['h', 2, 10, 13, 3]], E: [['h', 4, 0, 10, 3], ['h', 4, 3, 4, 8], ['d', 4, 10, 4, 1], ['h', 12, 3, 1, 3]] },
  6: { S: [['h', 4, 3, 9, 1], ['h', 4, 2, 9, 1]], N: [['h', 4, 3, 9, 1], ['h', 8, 4, 2, 3]], E: [['h', 5, 3, 9, 1], ['h', 3, 3, 2, 3]] },
};
const BEARD = {
  1: { S: [[7, 8, 3, 2]], E: [[10, 8, 3, 2]] },
  2: { S: [[4, 6, 1, 2], [12, 6, 1, 2], [4, 7, 3, 1], [10, 7, 3, 1], [5, 8, 7, 1], [6, 9, 5, 1]], E: [[9, 6, 5, 1], [9, 7, 1, 1], [12, 7, 2, 1], [8, 8, 5, 2]] },
  3: { S: [[6, 6, 5, 1]], E: [[10, 6, 3, 1]] },
};

// ------------------------------------------------------------------ poses -------------------------------------------
const LIFT = [0, 1, 2, 1, 0, 0];
function poseFor(anim, f, view) {
  const P = { up: 0, hdx: 0, hdy: 0, tail: 0, aL: { dx: 0, dy: 0 }, aR: { dx: 0, dy: 0 }, lL: { dx: 0, lift: 0 }, lR: { dx: 0, lift: 0 } };
  if (anim === 'idle') {
    if (f === 1 || f === 3) P.up = 1; if (f === 2) { P.up = 1; P.tail = 1; P.aL.dx = -1; P.aR.dx = 1; } if (f === 4) P.hdx = -1; if (f === 5) P.hdx = 1;
    if (view === 'E') { if (f === 2) { P.aL.dx = 0; P.aR.dx = 1; } }
    return P;
  }
  const ph = f / 6 * Math.PI * 2, sn = Math.sin(ph), cs = Math.cos(ph), amp = view === 'E' ? 3 : view === 'S' || view === 'N' ? 0 : 1.8;
  P.up = [0, 1, 1, 0, 1, 1][f]; P.tail = Math.round(sn);
  if (view === 'S' || view === 'N') {
    P.lL.lift = LIFT[f]; P.lR.lift = LIFT[(f + 3) % 6]; P.aL.dy = P.lR.lift > 0 ? -1 : 0; P.aR.dy = P.lL.lift > 0 ? -1 : 0; P.hdx = f === 1 || f === 2 ? 0 : 0;
  } else {  // side & three-quarter: legs scissor in x, arms counter-swing
    P.lL.dx = Math.round(amp * sn); P.lL.lift = Math.max(0, Math.round(1.5 * cs)); P.lR.dx = -P.lL.dx; P.lR.lift = Math.max(0, Math.round(-1.5 * cs));
    const aa = view === 'E' ? 2 : 1; P.aL.dx = -Math.round(aa * sn); P.aR.dx = -P.aL.dx;
  }
  return P;
}

// ------------------------------------------------------------------ build one frame ---------------------------------
function build(sk, view, anim, f) {
  const a = unpack(sk), P = poseFor(anim, f, view), skin = TONES[a.tone], skinD = shade(skin, .82), tc = CLOTH[a.topc], bc = BOTTOMS[a.botc], sc = SHOES[a.shoec], tr = TRIMS[a.trim];
  const hair = HAIRS[a.hair], hairD = shade(hair, .72), hatc = HATC[a.hatc];
  const front = view === 'S' || view === 'SE', back = view === 'N' || view === 'NE', side = view === 'E', turned = view === 'SE' || view === 'NE';
  const hx = view === 'S' || view === 'N' ? 0 : 1, tx = turned ? 1 : 0;
  const cv = mk(PW, PH), g = cv.getContext('2d');
  const blit = (c, dx = 0, dy = 0) => g.drawImage(c, dx, dy);
  const up = P.up, base = side ? TORSO_E : shift(TORSO, tx), torsoSp = stretch(base, 14, up);
  const metal = '#8d98aa', armorHi = '#b4bfd0';
  // ---- deco helpers
  const torsoDeco = (g2) => {
    const full = (col) => { g2.fillStyle = col; g2.fillRect(0, 10 + 0 - up, 18, 11 + up); };
    const tStyle = a.top;
    if (tStyle === 0) { full(tc); rects(g2, shade(tc, .78), [[0, 19, 18, 1]]); rects(g2, tr, [[0, 17, 18, 1]]); }
    else if (tStyle === 1) full(tc);
    else if (tStyle === 2) { if (front) { rects(g2, tc, [[0, 11 - up, 7 + tx, 9 + up], [10 + tx, 11 - up, 8, 9 + up]]); rects(g2, shade(tc, .7), [[6 + tx, 11 - up, 1, 9 + up], [10 + tx, 11 - up, 1, 9 + up]]); } else full(tc); rects(g2, tr, [[0, 17, 18, 1]]); }
    else if (tStyle === 3) { full(tc); if (front) rects(g2, tr, [[8 + tx, 12 - up, 1, 8 + up]]); rects(g2, tr, [[0, 17, 18, 1]]); rects(g2, shade(tc, .8), [[0, 19, 18, 1]]); }
    else if (tStyle === 4) { full(back ? shade(metal, .85) : metal); rects(g2, armorHi, [[0, 12 - up, 18, 1]]); if (front) rects(g2, armorHi, [[6 + tx, 14, 5, 1]]); rects(g2, tr, [[0, 17, 18, 1]]); rects(g2, shade(metal, .7), [[0, 19, 18, 1]]); }
    else { full(tr); const sx = side ? 0 : 0; if (front || back) rects(g2, bc, [[5 + tx, 11 - up, 2, 9 + up], [10 + tx, 11 - up, 2, 9 + up]]); else rects(g2, bc, [[5, 11 - up, 2, 9 + up]]); if (front) rects(g2, bc, [[5 + tx, 16, 7, 4]]); else rects(g2, bc, [[0, 16, 18, 4]]); }
    if (front && (tStyle === 0 || tStyle === 1 || tStyle === 3)) rects(g2, skin, [[7 + tx, 11 - up, 3, 1]]);   // open collar
    edgeShade(g2, torsoSp);
  };
  const sleeve = (g2, sp, rows, col) => { g2.fillStyle = col; for (const [y, x0, x1] of sp) if (y >= rows[0] && y <= rows[1]) g2.fillRect(x0, y, x1 - x0 + 1, 1); };
  const armDeco = (sp, far) => (g2) => {
    const s = a.top; let col = null, rows = [14, 14];
    if (s === 0) { col = tc; rows = [14, 15]; } else if (s === 1 || s === 3) { col = tc; rows = [14, 17]; } else if (s === 4) { col = armorHi; rows = [14, 15]; } else if (s === 5) { col = tr; rows = [14, 16]; }
    if (col) sleeve(g2, sp, rows, far ? shade(col, .82) : col); if (s === 3) sleeve(g2, sp, [17, 17], tr);
    edgeShade(g2, sp, .1);
  };
  const legDeco = (sp, far) => (g2) => {
    if (a.bottom === 0) sleeve(g2, sp, [20, 24], bc); else if (a.bottom === 1) sleeve(g2, sp, [20, 21], bc); else { sleeve(g2, sp, [20, 24], bc); sleeve(g2, sp, [22, 22], tr); }
    if (a.shoes === 0) sleeve(g2, sp, [23, 24], sc); else if (a.shoes === 1) sleeve(g2, sp, [24, 24], sc);
    if (far) { g2.fillStyle = 'rgba(0,0,0,.18)'; for (const [y, x0, x1] of sp) g2.fillRect(x0, y, x1 - x0 + 1, 1); }
  };
  const mk3 = (sp, col, deco, skip) => part(sp, col, deco, skip);
  // ---- hair/hat/face painting for the head part
  const headFill = side ? [...shift(HEAD, 1, 0), [5, 14, 14], [6, 14, 14]] : shift(HEAD, hx, 0);
  const tbl = (t) => (side ? t.E : back ? t.N : t.S), hsh = side ? 0 : hx;
  const hh = a.hat === 3 || a.hat === 5 ? null : HAIR[a.style], hat = HATS[a.hat];   // helmets and hoods hide the hair completely
  const hatList = hat ? (hat.A ? hat.A : tbl(hat)) : null, hatShift = hat && hat.A ? hx : hsh;
  const colOf = (k) => ({ h: hatc, d: shade(hatc, .7), t: tr, s: '#aab2bd', S: '#7a828a', g: '#f2c14e', r: '#d6453d' }[k]);
  const headCv = (() => {
    const c = mk(PW, PH), g2 = c.getContext('2d'); g2.translate(OX, OY);
    if (hh && hh[side ? 'E' : back ? 'N' : 'S'] && hh[side ? 'E' : back ? 'N' : 'S'].b) rects(g2, hair, hh[side ? 'E' : back ? 'N' : 'S'].b, hsh);
    g2.fillStyle = skin; for (const [y, x0, x1] of headFill) g2.fillRect(x0, y, x1 - x0 + 1, 1);
    g2.fillStyle = 'rgba(0,0,0,.12)'; for (const [y, , x1] of headFill) g2.fillRect(x1, y, 1, 1);
    if (front || side) { const bd = BEARD[a.beard]; if (bd) rects(g2, hair, side ? bd.E : bd.S, side ? 0 : hx); }
    const hs = hh && (side ? hh.E : back ? hh.N : hh.S);
    if (hs && hs.f) { rects(g2, hair, hs.f, hsh); g2.fillStyle = shade(hair, 1.25); if (!side) g2.fillRect(6 + hsh, 1, 2, 1); else g2.fillRect(7, 1, 2, 1); }
    if (hatList) { for (const [k, x, y, w, h2] of hatList) { g2.fillStyle = colOf(k); g2.fillRect(x + hatShift, y, w, h2); } if (a.hat === 3 && front) for (const [k, x, y, w, h2] of hat.F) { g2.fillStyle = colOf(k); g2.fillRect(x + hx, y, w, h2); } }
    let eyes = [];
    if (front || side) {
      // white dot eyes like the template; on very pale skin they would vanish, so those faces get dark eyes and a warm mouth
      const n = parseInt(skin.slice(1), 16), lum = (.3 * (n >> 16) + .59 * ((n >> 8) & 255) + .11 * (n & 255)) / 255;
      g2.fillStyle = lum > .72 ? '#2a1a14' : '#ffffff';
      if (view === 'S') { eyes = [[6, 4], [10, 4]]; g2.fillRect(7 - 1, 4, 1, 2); g2.fillRect(10, 4, 1, 2); g2.fillRect(7, 7, 3, 1); }
      else if (view === 'SE') { eyes = [[8, 4], [11, 4]]; g2.fillRect(8, 4, 1, 2); g2.fillRect(11, 4, 1, 2); g2.fillRect(9, 7, 2, 1); }
      else { eyes = [[11, 4]]; g2.fillRect(11, 4, 1, 2); g2.fillRect(11, 7, 2, 1); }
    }
    g2.setTransform(1, 0, 0, 1, 0, 0); outline(c); c._eyes = eyes.map(([x, y]) => [x + OX + P.hdx, y + OY - up + P.hdy]); return c;
  })();
  const tailCv = (() => {
    const hs = hh && (side ? hh.E : back ? hh.N : hh.S); if (!hs || !hs.tail) return null;
    const c = mk(PW, PH), g2 = c.getContext('2d'); g2.translate(OX, OY); rects(g2, hair, hs.tail, hsh); g2.fillStyle = hairD; for (const [x, y, w, h2] of hs.tail) g2.fillRect(x + hsh + w - 1, y, 1, h2); g2.setTransform(1, 0, 0, 1, 0, 0); return outline(c);
  })();
  const skirtCv = a.top === 3 ? mk3(shift(side ? SKIRT.E : SKIRT.S, side ? 0 : tx, 0), tc, (g2, sp) => { rects(g2, tr, [[0, 23, 18, 1]]); edgeShade(g2, sp, .12); }) : null;
  const hdx = P.hdx, hdy = -up + P.hdy;
  // ---- draw order
  if (side) {
    const far = { x: P.lR.dx, lift: P.lR.lift }, near = { x: P.lL.dx, lift: P.lL.lift };
    const aFar = shift(ARM_E, P.aR.dx, 0), aNear = shift(ARM_E, P.aL.dx, 0), lFar = shift(LEG_E, far.x, 0), lNear = shift(LEG_E, near.x, 0);
    blit(mk3(aFar, shade(skin, .8), armDeco(aFar, true)), 0, 0);
    if (tailCv) blit(tailCv, P.tail, -up);
    blit(mk3(lFar, skin, legDeco(lFar, true), false), 0, -far.lift);
    blit(mk3(lNear, skin, legDeco(lNear, false), false), 0, -near.lift);
    blit(mk3(torsoSp, skin, torsoDeco, true));
    if (skirtCv) blit(skirtCv);
    blit(mk3(aNear, skin, armDeco(aNear, false)), 0, 0);
    blit(headCv, hdx, hdy);
  } else {
    const lx = tx, rl = shift(LEG_R, tx, 0), ll = shift(LEG_L, tx, 0), ax = P.lL.dx;
    if (tailCv && front) blit(tailCv, P.tail, -up);
    blit(mk3(ll, skin, legDeco(ll, false)), P.lL.dx * 0 + 0, -P.lL.lift); blit(mk3(rl, skin, legDeco(rl, false)), 0, -P.lR.lift);
    if (turned) { const far = stretch(shift(ARM_FAR, 1, 0), 16, up); blit(mk3(far, shade(skin, .85), armDeco(far, true)), P.aR.dx, P.aR.dy); }
    blit(mk3(torsoSp, skin, torsoDeco, true));
    if (skirtCv) blit(skirtCv);
    const al = stretch(shift(ARM_L, tx, 0), 16, up), ar = stretch(ARM_R, 16, up);
    blit(mk3(al, skin, armDeco(al, false)), P.aL.dx, P.aL.dy);
    if (!turned) blit(mk3(ar, skin, armDeco(ar, false)), P.aR.dx, P.aR.dy);
    if (tailCv && back) blit(tailCv, P.tail, -up);
    blit(headCv, hdx, hdy);
  }
  cv._eyes = headCv._eyes; cv._skin = skin; return cv;
}

// ------------------------------------------------------------------ public API --------------------------------------
const cache = new Map(), flipped = new WeakMap();
function flipCanvas(c) {
  let f = flipped.get(c); if (f) return f; f = mk(PW, PH); const g = f.getContext('2d'); g.translate(PW, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
  f._eyes = c._eyes.map(([x, y]) => [PW - 1 - x, y]); f._skin = c._skin; flipped.set(c, f); return f;
}
/** Baked frame. d = 0..7 (see DIR_NAMES), anim = 'idle' | 'walk', f = frame index. Result has ._eyes (for blinking) and ._skin. */
export function playerFrame(sk, d, anim, f) {
  const [view, mirror] = BASE[DIR_NAMES[d & 7]], key = sk.join(',') + '|' + view + anim + f;
  let c = cache.get(key); if (!c) { c = build(sk, view, anim, f); cache.set(key, c); if (cache.size > 1500) cache.delete(cache.keys().next().value); }
  return mirror ? flipCanvas(c) : c;
}
/** 16x16 head icon for the HUD */
export function portrait(sk) {
  const out = mk(16, 16), g = out.getContext('2d'), f = playerFrame(sk, 2, 'idle', 0); g.drawImage(f, OX, OY - 3, 16, 16, 0, 0, 16, 16); return out;
}
