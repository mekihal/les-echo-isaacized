// Procedural pixel-art: everything is baked once into small canvases, then blitted with drawImage.
import { TONES, HAIRS, OUTFITS, TRIMS, MOB_ARCH, ZONE_PAL, RARITY, shade, mix, hash2, hashStr } from './config.js';

export const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const R = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const P = (g, c, x, y) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
function ell(g, c, cx, cy, rx, ry) {
  g.fillStyle = c;
  for (let y = -ry; y <= ry; y++) { const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + .01))) + .5); g.fillRect(cx - half, cy + y, half * 2 + 1, 1); }
}
function line(g, c, x0, y0, x1, y1, w = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; g.fillStyle = c;
  for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), w, w);
}
function outline(cv, col = '#14100c') {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height, src = g.getImageData(0, 0, w, h), d = src.data, out = g.createImageData(w, h);
  out.data.set(d); const rgb = parseInt(col.slice(1), 16);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (d[i + 3] > 0) continue;
    const n = (x > 0 && d[i - 1] > 0) || (x < w - 1 && d[i + 7] > 0) || (y > 0 && d[i - w * 4 + 3] > 0) || (y < h - 1 && d[i + w * 4 + 3] > 0);
    if (n) { out.data[i] = rgb >> 16; out.data[i + 1] = (rgb >> 8) & 255; out.data[i + 2] = rgb & 255; out.data[i + 3] = 255; }
  }
  g.putImageData(out, 0, 0); return cv;
}
const whiteCache = new WeakMap();
export function whiteOf(cv) {  // silhouette-in-white for hit flashes
  let w = whiteCache.get(cv); if (w) return w;
  w = mk(cv.width, cv.height); const g = w.getContext('2d'); g.drawImage(cv, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  whiteCache.set(cv, w); return w;
}

// ---------------------------------------------------------------- player ---
function playerFrame(dir, fr, sk) {
  const cv = mk(18, 26), g = cv.getContext('2d'); g.translate(1, 1);
  const [tone, hair, style, outfit, trim, hat] = sk;
  const T = TONES[tone % 6], H = HAIRS[hair % 8], O = OUTFITS[outfit % 8], Tr = TRIMS[trim % 6], OD = shade(O, .72), HD = shade(H, .7), TD = shade(T, .84), BOOT = shade(Tr, .55);
  const lA = fr === 1 ? 1 : 0, lB = fr === 2 ? 1 : 0;
  if (dir === 's') {
    R(g, OD, 7, 18 - lA, 3, 3 + lA); R(g, BOOT, 7, 21 - lA, 4, 2); R(g, O, 9 - 0, 18 - lB, 3, 3 + lB); R(g, BOOT, 9, 21 - lB, 4, 2);
    R(g, O, 5, 11, 7, 8); R(g, Tr, 5, 16, 7, 1); R(g, OD, 5, 11, 2, 8);
    R(g, T, 8 + (fr === 1 ? 1 : fr === 2 ? -1 : 0), 13, 3, 5); R(g, O, 8 + (fr === 1 ? 1 : fr === 2 ? -1 : 0), 12, 3, 3);
    R(g, T, 5, 3, 8, 8); R(g, T, 13, 6, 1, 2); P(g, '#1a1410', 11, 7); P(g, '#1a1410', 11, 6);
    R(g, H, 4, 2, 8, 3); R(g, H, 4, 5, 3, 4); if (style === 1) R(g, H, 3, 5, 4, 8); if (style === 2) { P(g, H, 5, 1); P(g, H, 8, 1); P(g, H, 10, 1); }
    if (style === 3) R(g, Tr, 4, 4, 9, 1); if (style === 4) { R(g, H, 2, 4, 3, 2); R(g, HD, 1, 6, 3, 5); }
  } else {
    const back = dir === 'u';
    R(g, OD, 5, 18 - lA, 3, 3 + lA); R(g, BOOT, 5, 21 - lA, 3, 2); R(g, OD, 10, 18 - lB, 3, 3 + lB); R(g, BOOT, 10, 21 - lB, 3, 2);
    R(g, O, 4, 11, 10, 8); R(g, Tr, 4, 16, 10, 1); R(g, back ? OD : O, 4, 11, 10, 1);
    R(g, O, 2, 12, 2, 6); R(g, O, 14, 12, 2, 6); R(g, T, 2, 18, 2, 1); R(g, T, 14, 18, 2, 1);
    R(g, T, 5, 3, 8, 8);
    if (!back) { R(g, '#1a1410', 7, 7, 1, 2); R(g, '#1a1410', 11, 7, 1, 2); R(g, TD, 8, 9, 3, 1); }
    R(g, back ? H : H, 4, 2, 10, back ? 9 : 3); if (!back) { R(g, H, 4, 5, 1, 3); R(g, H, 13, 5, 1, 3); }
    if (back) R(g, HD, 6, 4, 6, 1);
    if (style === 1) { R(g, H, 3, 5, 2, 8); R(g, H, 13, 5, 2, 8); } if (style === 2) { P(g, H, 5, 1); P(g, H, 7, 0); P(g, H, 10, 1); P(g, H, 12, 1); }
    if (style === 3) R(g, Tr, 4, 4, 10, 1); if (style === 4) { R(g, H, 14, 4, 2, 2); R(g, HD, 15, 6, 2, 5); }
  }
  // hats
  const hx = dir === 's' ? 4 : 4;
  if (hat === 1) { R(g, Tr, hx, 1, 9, 3); R(g, shade(Tr, .7), hx, 3, 10, 1); }
  else if (hat === 2) { R(g, O, 3, 3, 12, 1); R(g, O, 5, 2, 8, 1); R(g, O, 6, 1, 6, 1); R(g, OD, 8, 0, 3, 1); P(g, Tr, 8, 2); }
  else if (hat === 3) { R(g, '#a9b0b8', hx, 1, 9, 4); R(g, '#7a828a', hx, 4, 9, 1); if (dir === 'd') R(g, '#7a828a', 8, 5, 2, 3); }
  else if (hat === 4) { R(g, '#f2c14e', hx, 2, 9, 2); P(g, '#f2c14e', hx, 1); P(g, '#f2c14e', hx + 4, 0); P(g, '#f2c14e', hx + 8, 1); }
  else if (hat === 5) { R(g, shade(O, .85), 3, 1, 12, 3); R(g, shade(O, .85), 3, 4, 2, 8); R(g, shade(O, .85), 13, 4, 2, 8); }
  return outline(cv);
}
const playerCache = new Map();

// 35x35 sprite atlas derived from the supplied PLR-idle / PLR-blink references.
// Rows: front idle, front blink, front walk, side idle+walk, back idle+walk, side blink.
const PLAYER_ATLAS_B64 = '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';
const PLAYER_ART = { idleFront: [], blinkFront: [], walkFront: [], idleSide: null, walkSide: [], idleBack: null, walkBack: [], blinkSide: [] };
let playerArtReady = false;
if (typeof Image !== 'undefined') {
  const atlas = new Image();
  atlas.onload = () => {
    const cell = (col, row) => { const c = mk(35, 35), g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(atlas, col * 35, row * 35, 35, 35, 0, 0, 35, 35); return c; };
    for (let i = 0; i < 5; i++) { PLAYER_ART.idleFront.push(cell(i, 0)); PLAYER_ART.blinkFront.push(cell(i, 1)); PLAYER_ART.blinkSide.push(cell(i, 5)); }
    for (let i = 0; i < 4; i++) { PLAYER_ART.walkFront.push(cell(i, 2)); PLAYER_ART.walkSide.push(cell(i + 1, 3)); PLAYER_ART.walkBack.push(cell(i + 1, 4)); }
    PLAYER_ART.idleSide = cell(0, 3); PLAYER_ART.idleBack = cell(0, 4); playerArtReady = true;
  };
  atlas.src = 'data:image/png;base64,' + PLAYER_ATLAS_B64;
}
export function playerSprite(skin, dir, frame = 0, mode = 'idle') {
  if (!playerArtReady) return playerFrame(dir, mode === 'walk' ? 1 + (frame & 1) : 0, skin);
  const facing = dir === 'u' ? 'back' : dir === 's' ? 'side' : 'front', i = frame | 0;
  if (mode === 'walk') return PLAYER_ART['walk' + (facing === 'front' ? 'Front' : facing === 'side' ? 'Side' : 'Back')][i % 4];
  if (mode === 'blink' && facing !== 'back') return (facing === 'front' ? PLAYER_ART.blinkFront : PLAYER_ART.blinkSide)[i % 5];
  if (facing === 'front') return PLAYER_ART.idleFront[i % 5];
  return facing === 'side' ? PLAYER_ART.idleSide : PLAYER_ART.idleBack;
}
export function portrait(skin) {
  const cv = mk(16, 16), g = cv.getContext('2d'), f = playerSprite(skin, 'd', 0, 'idle');
  g.imageSmoothingEnabled = false; g.drawImage(f, 9, 4, 18, 15, 0, 0, 16, 16); return cv;
}

// ------------------------------------------------------------------ mobs ---
const ARCH = {
  blob(g, S, t, c) {
    const sq = t ? 1 : 0, w = Math.floor(S * .46), h = Math.floor(S * .36) - sq;
    ell(g, c.dark, S >> 1, S - h - 2, w, h); ell(g, c.main, S >> 1, S - h - 3, w - 1, h - 1); ell(g, c.light, (S >> 1) - Math.floor(w / 3), S - h - 3 - Math.floor(h / 2), Math.max(1, w >> 2), Math.max(1, h >> 2));
    R(g, '#14201a', (S >> 1) - Math.floor(w / 2), S - h - 3, 2, 3); R(g, '#14201a', (S >> 1) + Math.floor(w / 3), S - h - 3, 2, 3);
  },
  quad(g, S, t, c, o) {
    const bw = Math.floor(S * .36), bh = Math.floor(S * .22), cy = S - bh - Math.floor(S * .2), l1 = t ? 1 : 0;
    R(g, c.dark, S * .28 | 0, cy + bh - 1, 3, Math.floor(S * .2) + l1); R(g, c.dark, S * .62 | 0, cy + bh - 1, 3, Math.floor(S * .2) + (1 - l1));
    R(g, c.dark, S * .4 | 0, cy + bh - 1, 3, Math.floor(S * .2) + (1 - l1)); R(g, c.dark, S * .72 | 0, cy + bh - 1, 3, Math.floor(S * .2) + l1);
    ell(g, c.main, S * .45 | 0, cy, bw, bh); ell(g, c.light, S * .43 | 0, cy - (bh >> 1), bw >> 1, bh >> 2);
    ell(g, c.main, S * .8 | 0, cy - (bh >> 1), Math.floor(S * .15), Math.floor(S * .14)); R(g, c.dark, S * .8 | 0, cy - (bh >> 1) - Math.floor(S * .2), 2, 3); R(g, c.dark, S * .9 | 0, cy - (bh >> 1) - Math.floor(S * .16), 2, 3);
    P(g, '#fff6c0', S * .86 | 0, cy - (bh >> 1) - 1); P(g, '#14100c', S * .87 | 0, cy - (bh >> 1) - 1);
    R(g, c.dark, S * .05 | 0, cy - 1, Math.floor(S * .12), 2 + (t ? 1 : 0));
    if (o.tusk) { P(g, '#f4efe0', S * .93 | 0, cy + 1); P(g, '#f4efe0', S * .93 | 0, cy + 2); }
    if (o.spikes) for (let i = 0; i < 5; i++) R(g, c.acc, (S * .2 | 0) + i * Math.floor(S * .1), cy - bh - 2 + (i & 1), 2, 3);
  },
  orb(g, S, t, c, o) {
    const r = Math.floor(S * .32), cy = (S >> 1) - 1 + (t ? 1 : 0);
    ell(g, mix(c.main, '#000000', .0) + '', S >> 1, cy, r + 2, r + 2); ell(g, c.dark, S >> 1, cy, r + 1, r + 1); ell(g, c.main, S >> 1, cy, r, r); ell(g, c.light, S >> 1, cy, r >> 1, r >> 1);
    if (o.tail) { for (let i = 0; i < 4; i++) R(g, c.main, (S >> 1) - 2 + (i & 1) * 2, cy + r + i * 2, 3 - (i >> 1), 2); R(g, '#0a0a14', (S >> 1) - 3, cy - 2, 2, 3); R(g, '#0a0a14', (S >> 1) + 2, cy - 2, 2, 3); P(g, c.acc, (S >> 1) - 3, cy - 1); P(g, c.acc, (S >> 1) + 2, cy - 1); }
    else for (let i = 0; i < 3; i++) P(g, c.light, (S >> 1) - 6 + i * 6, cy - r - 2 - (t && i === 1 ? 1 : 0));
  },
  golem(g, S, t, c, o) {
    const w = Math.floor(S * .62), x0 = (S - w) >> 1, l = t ? 1 : 0, lh = Math.floor(S * .22);
    R(g, c.dark, x0 + 1, S - lh - 1 - l, Math.floor(w * .32), lh + l); R(g, c.dark, x0 + w - 1 - Math.floor(w * .32), S - lh - 1 - (1 - l), Math.floor(w * .32), lh + (1 - l));
    R(g, c.main, x0, S * .34 | 0, w, Math.floor(S * .36)); R(g, c.light, x0 + 1, S * .34 | 0, w - 2, 2); R(g, c.dark, x0, (S * .34 | 0) + Math.floor(S * .3), w, 2);
    R(g, c.main, x0 - Math.floor(S * .12), S * .38 | 0, Math.floor(S * .12), Math.floor(S * .3)); R(g, c.main, x0 + w, S * .38 | 0, Math.floor(S * .12), Math.floor(S * .3));
    R(g, c.main, x0 + (w >> 2), S * .12 | 0, w >> 1, Math.floor(S * .22)); R(g, c.dark, x0 + (w >> 2), S * .12 | 0, w >> 1, 1);
    R(g, c.glow, x0 + (w >> 2) + 1, S * .2 | 0, 2, 2); R(g, c.glow, x0 + (w >> 2) + (w >> 1) - 3, S * .2 | 0, 2, 2);
    R(g, c.acc, x0 + (w >> 1) - 1, (S * .34 | 0) + 3, 2, Math.floor(S * .2));
    if (o.crown) for (let i = 0; i < 4; i++) R(g, c.acc, x0 + (w >> 2) + i * Math.max(2, w >> 3), S * .06 | 0, 2, 4);
  },
  knight(g, S, t, c, o) {
    const l = t ? 1 : 0, cx = S >> 1, u = S / 24;
    R(g, c.dark, cx - 4 * u | 0, S - 7 * u | 0, 3 * u | 0, (6 * u | 0) + l); R(g, c.dark, cx + 1 * u | 0, S - 7 * u | 0, 3 * u | 0, 6 * u | 0);
    R(g, c.main, cx - 5 * u | 0, S * .38 | 0, 10 * u | 0, S * .34 | 0); R(g, c.light, cx - 5 * u | 0, S * .38 | 0, 10 * u | 0, 2); R(g, c.dark, cx - 5 * u | 0, S * .66 | 0, 10 * u | 0, 2);
    R(g, c.main, cx - 7 * u | 0, S * .4 | 0, 2 * u | 0 || 2, S * .26 | 0); R(g, c.main, cx + 5 * u | 0, S * .4 | 0, 2 * u | 0 || 2, S * .26 | 0);
    R(g, c.main, cx - 4 * u | 0, S * .14 | 0, 8 * u | 0, S * .22 | 0); R(g, c.glow, cx - 3 * u | 0, S * .22 | 0, 2, 2); R(g, c.glow, cx + 1 * u | 0, S * .22 | 0, 2, 2);
    if (o.halo) R(g, c.acc, cx - 6 * u | 0, S * .04 | 0, 12 * u | 0, 2); else R(g, c.dark, cx - 4 * u | 0, S * .12 | 0, 8 * u | 0, 2);
    R(g, c.acc, cx + 7 * u | 0, S * .2 | 0, 2, S * .5 | 0);
  },
  dragon(g, S, t, c) {
    const cy = Math.floor(S * .56), l = t ? 2 : 0;
    for (let i = 0; i < 6; i++) R(g, c.dark, (S * .06 | 0) + i * 3, cy + 6 + (i > 3 ? 3 : 0) - i, 6, 4);
    ell(g, c.main, S * .46 | 0, cy, Math.floor(S * .32), Math.floor(S * .2)); ell(g, c.light, S * .44 | 0, cy - 5, Math.floor(S * .2), Math.floor(S * .06));
    for (let i = 0; i < 5; i++) R(g, c.dark, (S * .2 | 0) + i * 5 | 0, cy - Math.floor(S * .2) - 2 - l * (i % 2) + 1, 6 + i, Math.floor(S * .12) + (i >> 1)); // wings
    R(g, c.dark, S * .3 | 0, cy + Math.floor(S * .16), 5, Math.floor(S * .16)); R(g, c.dark, S * .55 | 0, cy + Math.floor(S * .16), 5, Math.floor(S * .16) - l);
    ell(g, c.main, S * .82 | 0, cy - 4, Math.floor(S * .13), Math.floor(S * .11)); R(g, c.acc, S * .86 | 0, cy - 14 | 0, 2, 6); R(g, c.acc, S * .78 | 0, cy - 14 | 0, 2, 6);
    R(g, c.glow, S * .86 | 0, cy - 6, 3, 2); R(g, '#f4efe0', S * .93 | 0, cy - 1, 1, 3);
  },
};
const KIND_OPTS = { boar: { tusk: 1 }, frost_wyrm: { spikes: 1 }, void_wraith: { tail: 1 }, wisp: {}, colossus: { crown: 1 }, ancient_warden: { crown: 1 }, ashling: {}, starseer: { halo: 1 } };
const mobCache = new Map();
export function mobSprite(kind, info, id, frame) {
  const v = Math.floor(hashStr(id || '') * 3), key = kind + v + (frame ? 'b' : 'a'); let s = mobCache.get(key); if (s) return s;
  const arch = MOB_ARCH[kind] || 'blob', r = info?.r || 20, S = Math.max(14, Math.round(r * 1.25)) + (arch === 'dragon' ? 18 : 0);
  const base = shade(info?.color || '#88aa88', [.82, 1, 1.16][v]), c = { main: base, dark: shade(base, .62), light: shade(base, 1.3), acc: mix(base, '#ffe28a', .55), glow: mix(base, '#ffffff', .85) };
  const cv = mk(S + 2, S + 2), g = cv.getContext('2d'); g.translate(1, 1);
  ARCH[arch](g, S, frame, c, KIND_OPTS[kind] || {}); outline(cv, '#120e12');
  s = { c: cv, ax: (S + 2) >> 1, ay: S + 1, S }; mobCache.set(key, s); return s;
}

// --------------------------------------------------------------- weapons ---
const weaponCache = new Map();
export function weaponSprite(shape, color) {  // pointing +x, pivot (5,9)
  const key = shape + color; let c = weaponCache.get(key); if (c) return c;
  const cv = mk(40, 19), g = cv.getContext('2d'), L = shade(color, 1.3), D = shade(color, .68), W = '#8a5a34', WD = '#5e3a20';
  if (shape === 'sword') { R(g, WD, 2, 8, 4, 3); R(g, '#d8b24a', 6, 5, 2, 9); R(g, color, 8, 7, 18, 5); R(g, L, 8, 7, 18, 1); R(g, D, 8, 11, 18, 1); R(g, color, 26, 8, 3, 3); P(g, L, 29, 9); }
  else if (shape === 'axe') { R(g, W, 2, 8, 24, 3); R(g, WD, 2, 10, 24, 1); R(g, color, 18, 3, 7, 13); R(g, L, 18, 3, 7, 2); R(g, D, 18, 14, 7, 2); R(g, L, 25, 5, 2, 9); }
  else if (shape === 'spear') { R(g, W, 2, 8, 30, 2); R(g, color, 32, 6, 4, 6); R(g, L, 32, 6, 4, 1); R(g, color, 36, 7, 2, 4); P(g, L, 38, 8); R(g, '#c44', 30, 7, 2, 4); }
  else if (shape === 'dagger') { R(g, WD, 2, 8, 4, 3); R(g, '#d8b24a', 6, 6, 2, 7); R(g, color, 8, 8, 10, 3); R(g, L, 8, 8, 10, 1); R(g, color, 18, 9, 2, 1); }
  else if (shape === 'bow') { for (let i = -8; i <= 8; i++) { const x = 12 + Math.round(Math.sqrt(Math.max(0, 64 - i * i)) * .45); R(g, W, x, 9 + i, 2, 1); } R(g, '#e8e4d0', 12, 1, 1, 17); R(g, color, 14, 8, 2, 3); }
  else if (shape === 'staff') { R(g, W, 2, 9, 24, 2); R(g, WD, 2, 10, 24, 1); ell(g, D, 29, 9, 4, 4); ell(g, color, 29, 9, 3, 3); R(g, '#ffffff', 28, 8, 2, 2); R(g, '#d8b24a', 24, 8, 2, 4); }
  else if (shape === 'scythe') { R(g, W, 2, 10, 24, 2); for (let i = 0; i < 12; i++) R(g, color, 24 + (i >> 1), 9 - i, 6 - (i >> 2), 1); R(g, L, 24, 9, 7, 1); }
  else { ell(g, '#e8c9a0', 7, 9, 3, 3); R(g, '#c9a57c', 5, 11, 5, 1); }
  outline(cv, '#14100c'); weaponCache.set(key, cv); return cv;
}

// ----------------------------------------------------------------- icons ---
const iconCache = new Map();
export function iconCanvas(key, extra) {  // 16x16
  const ck = key + (extra?.color || ''); let c = iconCache.get(ck); if (c) return c;
  const cv = mk(16, 16), g = cv.getContext('2d');
  const [type, id] = key.split(':');
  if (type === 'r') {
    if (id === 'wood') { R(g, '#8a5a34', 2, 5, 12, 7); R(g, '#a8743f', 2, 5, 12, 2); ell(g, '#d9b27a', 3, 8, 2, 3); R(g, '#5e3a20', 6, 8, 6, 1); R(g, '#5e3a20', 8, 10, 4, 1); }
    else if (id === 'herb') { R(g, '#3f8a3a', 7, 6, 2, 8); ell(g, '#6fc05a', 5, 6, 3, 2); ell(g, '#8fe07a', 11, 5, 3, 2); ell(g, '#5fb04a', 8, 3, 2, 2); }
    else if (id === 'ore') { ell(g, '#6a7078', 8, 9, 6, 4); ell(g, '#8a9098', 7, 8, 5, 3); P(g, '#e8c27a', 5, 8); P(g, '#e8c27a', 9, 7); P(g, '#e8c27a', 10, 10); }
    else if (id === 'hide') { R(g, '#b88a58', 3, 4, 10, 9); R(g, '#d2a874', 3, 4, 10, 2); R(g, '#8a6038', 3, 12, 10, 1); P(g, '#8a6038', 6, 8); P(g, '#8a6038', 9, 9); }
    else if (id === 'slime') { ell(g, '#3f8f45', 8, 10, 6, 4); ell(g, '#6fd06a', 8, 9, 5, 3); R(g, '#d6ffb0', 5, 7, 2, 2); R(g, '#14201a', 6, 10, 1, 2); R(g, '#14201a', 10, 10, 1, 2); }
    else if (id === 'crystal') { R(g, '#3fb0c8', 6, 3, 4, 10); R(g, '#7fe7dc', 7, 3, 2, 9); R(g, '#3fb0c8', 3, 7, 3, 6); R(g, '#3fb0c8', 10, 6, 3, 7); R(g, '#e8ffff', 7, 4, 1, 4); }
    else if (id === 'shard') { for (let i = 0; i < 10; i++) R(g, i < 5 ? '#c98cf5' : '#8a50c0', 7 - (i < 5 ? 0 : 1) + (i >> 3), 2 + i, 3 - (i >> 3), 1); R(g, '#c98cf5', 5, 7, 6, 5); R(g, '#efc8ff', 7, 6, 2, 5); }
    else if (id === 'potion') { R(g, '#a86a3a', 6, 2, 4, 2); R(g, '#d8e8f0', 6, 4, 4, 3); ell(g, '#c43a4a', 8, 10, 4, 4); ell(g, '#ff6a7a', 7, 9, 2, 2); R(g, '#e8f4ff', 4, 8, 1, 3); }
    else if (id === 'arrows') { for (let i = 0; i < 3; i++) { line(g, '#b8a47a', 2 + i * 2, 13 - i, 12 + i * 2 > 14 ? 14 : 12 + i * 2, 3 - i * 0); R(g, '#d8d8e0', 12 + i, 2 + i, 2, 2); R(g, '#c44', 2 + i * 2, 12 - i, 2, 2); } }
  } else if (type === 'g') {
    const col = extra?.color || '#7a8a60'; R(g, col, 4, 3, 8, 10); R(g, shade(col, 1.25), 4, 3, 8, 2); R(g, shade(col, .7), 4, 11, 8, 2); R(g, col, 2, 4, 2, 6); R(g, col, 12, 4, 2, 6); R(g, '#14100c', 7, 3, 2, 2); R(g, shade(col, .55), 4, 8, 8, 1);
  } else if (type === 'w') {
    const col = extra?.color || '#ccc', shape = extra?.shape || 'sword', L = shade(col, 1.3), W = '#8a5a34';
    if (shape === 'sword') { line(g, col, 4, 11, 12, 3, 2); line(g, L, 5, 10, 12, 3, 1); line(g, '#d8b24a', 3, 7, 7, 11, 1); line(g, W, 2, 13, 4, 11, 2); }
    else if (shape === 'axe') { line(g, W, 3, 13, 11, 5, 2); R(g, col, 9, 2, 5, 6); R(g, L, 9, 2, 5, 1); R(g, shade(col, .7), 9, 7, 5, 1); }
    else if (shape === 'spear') { line(g, W, 2, 14, 11, 5, 1); line(g, col, 10, 6, 14, 2, 2); line(g, '#c44', 8, 8, 9, 7, 2); }
    else if (shape === 'dagger') { line(g, col, 3, 10, 9, 4, 2); line(g, col, 7, 13, 13, 7, 2); line(g, W, 2, 11, 3, 10, 2); line(g, W, 6, 14, 7, 13, 2); }
    else if (shape === 'bow') { for (let i = -6; i <= 6; i++) P(g, W, 4 + Math.round(Math.sqrt(36 - i * i) * .7), 8 + i); line(g, '#e8e4d0', 4, 2, 4, 14); line(g, col, 5, 8, 13, 8, 1); }
    else if (shape === 'staff') { line(g, W, 2, 14, 11, 5, 1); ell(g, shade(col, .7), 12, 4, 3, 3); ell(g, col, 12, 4, 2, 2); P(g, '#fff', 11, 3); }
    else if (shape === 'scythe') { line(g, W, 3, 14, 11, 4, 1); for (let i = 0; i < 5; i++) R(g, col, 10 + i, 3 - (i >> 1), 1, 2); R(g, L, 8, 3, 5, 1); }
    else { ell(g, '#e8c9a0', 8, 8, 4, 4); R(g, '#c9a57c', 5, 11, 7, 1); R(g, '#8a6a4a', 6, 6, 1, 2); R(g, '#8a6a4a', 9, 6, 1, 2); }
  }
  outline(cv, '#14100c'); iconCache.set(ck, cv); return cv;
}
const urlCache = new Map();
export function iconURL(key, extra) { const ck = key + (extra?.color || ''); let u = urlCache.get(ck); if (!u) { u = iconCanvas(key, extra).toDataURL(); urlCache.set(ck, u); } return u; }

// ---------------------------------------------------------------- decor ---
const decorCache = new Map();
export function decorSprites(zone) {
  let list = decorCache.get(zone); if (list) return list;
  const pal = ZONE_PAL[zone] || ZONE_PAL.forest, list2 = []; list = list2;
  const add = (w, h, fn, tall) => { const cv = mk(w, h), g = cv.getContext('2d'); fn(g, w, h); outline(cv, shade(pal[2], .45)); list2.push({ c: cv, ax: w >> 1, ay: h - 1, tall }); };
  const leaf = zone === 'garden' ? '#58b84f' : zone === 'marsh' ? '#4f8a6a' : pal[1];
  const tree = (s, trunk, canopy, extra) => add(s, s + 8, (g, w, h) => { R(g, '#6a4528', (w >> 1) - 2, h - 12, 4, 12); R(g, '#8a5e38', (w >> 1) - 2, h - 12, 1, 12); ell(g, shade(canopy, .75), w >> 1, h - 18, (w >> 1) - 1, (w >> 1) - 3); ell(g, canopy, (w >> 1) - 1, h - 20, (w >> 1) - 3, (w >> 1) - 4); ell(g, shade(canopy, 1.25), (w >> 1) - 3, h - 23, (w >> 2), (w >> 3)); if (extra) extra(g, w, h); }, true);
  if (zone === 'camp' || zone === 'forest' || zone === 'garden') {
    tree(28, '', leaf); tree(34, '', shade(leaf, .9)); tree(24, '', shade(leaf, 1.1), zone === 'garden' ? (g, w, h) => { P(g, '#f6b6d8', 8, h - 24); P(g, '#f6b6d8', 14, h - 20); P(g, '#fff0f6', 11, h - 26); } : null);
    add(14, 10, (g) => { ell(g, '#6b6f68', 7, 6, 6, 3); ell(g, '#8a8e86', 6, 5, 4, 2); });
    add(12, 9, (g) => { ell(g, pal[2], 6, 6, 5, 3); ell(g, shade(leaf, 1.1), 5, 5, 3, 2); P(g, zone === 'garden' ? '#f6b6d8' : '#e8e07a', 4, 4); P(g, zone === 'garden' ? '#fff0f6' : '#f0a0a0', 8, 5); });
    add(10, 8, (g) => { R(g, '#e8e0c8', 4, 5, 2, 3); ell(g, '#c44a3a', 5, 4, 4, 2); P(g, '#fff', 4, 3); P(g, '#fff', 7, 4); });
  } else if (zone === 'marsh') {
    tree(30, '', '#3f7a5a'); add(10, 18, (g) => { for (let i = 0; i < 4; i++) R(g, i & 1 ? '#6a9a6a' : '#8ab87a', 1 + i * 2, 2 + i % 2 * 2, 1, 16 - i % 2 * 2); R(g, '#7a4a2a', 2, 3, 2, 3); });
    add(24, 10, (g) => { ell(g, '#2a4a58', 12, 5, 11, 4); ell(g, '#3a6a78', 11, 4, 8, 3); P(g, '#b8e8e8', 8, 3); }); add(12, 9, (g) => { ell(g, '#4a6a58', 6, 6, 5, 3); });
  } else if (zone === 'ruins' || zone === 'obsidian') {
    const dead = zone === 'ruins' ? '#6a5c48' : '#3a3342';
    add(26, 34, (g, w, h) => { R(g, dead, 11, 10, 4, h - 10); line(g, dead, 13, 14, 4, 4, 2); line(g, dead, 13, 18, 22, 8, 2); line(g, dead, 13, 12, 14, 2, 2); }, true);
    add(16, 22, (g, w, h) => { R(g, pal[3], 3, 4, 10, h - 4); R(g, shade(pal[3], 1.2), 3, 4, 10, 3); R(g, shade(pal[3], .7), 10, 7, 3, h - 7); R(g, pal[2], 6, 10, 2, 1); }, true);
    add(14, 10, (g) => { ell(g, pal[2], 7, 6, 6, 3); ell(g, pal[3], 6, 5, 4, 2); }); add(12, 8, (g) => { R(g, '#e8e0c8', 2, 4, 8, 2); R(g, '#e8e0c8', 2, 3, 2, 1); R(g, '#e8e0c8', 8, 6, 2, 1); });
  } else {  // glacier / rift / abyss crystals
    const cc = zone === 'glacier' ? ['#bfeaf0', '#8ac8d6'] : zone === 'rift' ? ['#b48cf0', '#7a58c0'] : ['#e07ab0', '#8a3a7a'];
    add(18, 30, (g, w, h) => { R(g, cc[1], 6, 6, 6, h - 6); R(g, cc[0], 7, 4, 4, h - 6); R(g, cc[1], 2, 14, 4, h - 14); R(g, cc[0], 12, 12, 4, h - 12); P(g, '#fff', 8, 8); R(g, '#fff', 8, 10, 1, 6); }, true);
    add(12, 16, (g, w, h) => { R(g, cc[1], 4, 3, 4, h - 3); R(g, cc[0], 5, 2, 2, h - 3); P(g, '#fff', 5, 5); });
    add(14, 10, (g) => { ell(g, pal[2], 7, 6, 6, 3); ell(g, pal[3], 6, 5, 4, 2); P(g, '#fff', 5, 4); });
  }
  decorCache.set(zone, list); return list;
}

// ---------------------------------------------------------------- nodes ---
const nodeCache = new Map();
export function nodeSprite(kind) {
  let c = nodeCache.get(kind); if (c) return c;
  const cv = mk(18, 18), g = cv.getContext('2d');
  if (kind === 'wood') { R(g, '#6a4528', 7, 8, 4, 9); ell(g, '#3f7a3a', 9, 6, 7, 5); ell(g, '#5fa04a', 7, 5, 4, 3); R(g, '#d8b27a', 3, 12, 4, 3); }
  else if (kind === 'herb') { R(g, '#3f8a3a', 8, 6, 2, 11); ell(g, '#6fc05a', 5, 7, 3, 2); ell(g, '#8fe07a', 12, 6, 3, 2); ell(g, '#5fb04a', 9, 3, 2, 2); P(g, '#f6e07a', 4, 5); P(g, '#f6a0c8', 13, 4); }
  else if (kind === 'ore') { ell(g, '#5a6068', 9, 11, 7, 5); ell(g, '#8a9098', 8, 9, 5, 4); P(g, '#e8c27a', 6, 9); P(g, '#e8c27a', 10, 8); P(g, '#e8c27a', 11, 12); R(g, '#b8c0c8', 7, 7, 3, 1); }
  else if (kind === 'crystal') { R(g, '#3fb0c8', 7, 2, 4, 14); R(g, '#7fe7dc', 8, 2, 2, 13); R(g, '#3fb0c8', 3, 8, 3, 8); R(g, '#3fb0c8', 12, 7, 3, 9); R(g, '#e8ffff', 8, 4, 1, 5); }
  else { R(g, '#8a50c0', 7, 2, 4, 14); R(g, '#c98cf5', 8, 3, 2, 12); R(g, '#8a50c0', 3, 9, 3, 7); R(g, '#8a50c0', 12, 8, 3, 8); R(g, '#efc8ff', 8, 5, 1, 5); }
  outline(cv, '#14100c'); c = { c: cv, ax: 9, ay: 17 }; nodeCache.set(kind, c); return c;
}
