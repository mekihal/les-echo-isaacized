// Shared constants, palettes and tiny helpers.
export const PX = 0.5;            // art pixels per world unit
export const VIEW_H = 360;        // logical canvas height (art pixels) per integer scale step
export const INTERP_DELAY = 85;   // ms: remote entity interpolation delay

export const TONES = ['#f6d3b3', '#e8b98d', '#c68c5e', '#9a6540', '#6e4329', '#fbe3d4'];
export const HAIRS = ['#2b1d14', '#5a3a22', '#a56b36', '#e0b85a', '#b5382c', '#d9d9d9', '#3a5ea8', '#7a3fa0'];
export const OUTFITS = ['#4f8a4a', '#4a6fb0', '#b04a4a', '#8a4fa8', '#3f9a94', '#c8803a', '#7a8088', '#8a6440'];
export const TRIMS = ['#e8d27a', '#d8d8d0', '#3a2a22', '#e07a5a', '#6ad0e0', '#2a3a5a'];

export const RARITY = { common: '#c9cdbd', uncommon: '#7fd17a', rare: '#6db7ff', epic: '#c58bff', legendary: '#ffb24a' };
export const RARITY_RU = { common: 'Обычное', uncommon: 'Необычное', rare: 'Редкое', epic: 'Эпическое', legendary: 'Легендарное' };

// base, alt, detail-light, detail-dark per zone
export const ZONE_PAL = {
  camp: ['#58803f', '#628b47', '#4b7137', '#8a7a52'],
  forest: ['#3b6a37', '#43743f', '#2f5a2e', '#6b8a45'],
  marsh: ['#3f6b5c', '#46765f', '#335449', '#5f8a6c'],
  ruins: ['#7c6e58', '#86775f', '#6a5d4a', '#a08d6a'],
  glacier: ['#a9cfd6', '#b6dae0', '#8fbac4', '#eefcff'],
  rift: ['#4a3a6e', '#53427a', '#3d2f5c', '#8d6bd0'],
  abyss: ['#2c2440', '#352a4c', '#221b33', '#7a3a8a'],
  obsidian: ['#2b2b33', '#33333d', '#202027', '#5a4a6a'],
  garden: ['#4f9a4a', '#5aa652', '#43873f', '#e89ac0'],
};
export const ZONE_MAP = { camp: '#6f9a55', forest: '#3f7a45', marsh: '#4a8070', ruins: '#9a8868', glacier: '#b9e0ea', rift: '#7a58b8', abyss: '#4a3868', obsidian: '#44444e', garden: '#6fb85f' };

export const BLOOD = {
  flesh: ['#a8212b', '#d63a3a', '#6e1019', '#ff6a5a'],
  slime: ['#6fd06a', '#a6f08a', '#3f8f45', '#d6ffb0'],
  ghost: ['#7ae6dc', '#b8fff4', '#3b9a9a', '#ffffff'],
  stone: ['#b3a58a', '#d9ccb0', '#7a6e58', '#efe6d0'],
  ice: ['#8ee8f2', '#d6fbff', '#4fb0c8', '#ffffff'],
  void: ['#9a4cd0', '#d79cff', '#5a2a8a', '#ffe0ff'],
};
export const BLOOD_BY_KIND = { slime: 'slime', wisp: 'ghost', stone: 'stone', ashguard: 'stone', colossus: 'stone', frost_wyrm: 'ice',
  rift_knight: 'void', void_wraith: 'void', astral_titan: 'void', obsidian_sentinel: 'stone', starseer: 'void', ancient_warden: 'slime' };

export const MOB_ARCH = { slime: 'blob', wolf: 'quad', boar: 'quad', wisp: 'orb', stone: 'golem', ashling: 'knight', ashguard: 'golem',
  colossus: 'golem', frost_wyrm: 'quad', rift_knight: 'knight', echo_dragon: 'dragon', void_wraith: 'orb', astral_titan: 'dragon',
  obsidian_sentinel: 'golem', starseer: 'knight', ancient_warden: 'golem' };

export const SHAPE_NAMES = { fists: 'Кулаки', sword: 'Меч', axe: 'Топор', spear: 'Копьё', dagger: 'Кинжалы', bow: 'Лук', staff: 'Посох', scythe: 'Коса' };

export const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const expo = (k, dt) => 1 - Math.exp(-k * dt);

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255), g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255), b = clamp(Math.round((n & 255) * f), 0, 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
export function mix(a, b, t) {
  const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
  const f = (s) => Math.round(((p >> s) & 255) * (1 - t) + ((q >> s) & 255) * t);
  return '#' + ((1 << 24) | (f(16) << 16) | (f(8) << 8) | f(0)).toString(16).slice(1);
}
