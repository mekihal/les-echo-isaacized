// Ground chunks are baked lazily into small canvases (LRU cache); decor is deterministic per chunk.
import { ZONE_PAL, ZONE_MAP, hash2, clamp } from './config.js';
import { mk, decorSprites } from './sprites.js';

const CH = 256, CW = CH * 2;  // chunk = 256 art px = 512 world units
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
  const a = hash2(x0, y0), b = hash2(x0 + 1, y0), c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

export class World {
  constructor(init) {
    this.w = init.world.w; this.h = init.world.h; this.zones = init.zones; this.nodes = init.nodes;
    this.pal = {}; for (const z of this.zones) this.pal[z.id] = (ZONE_PAL[z.id] || ZONE_PAL.forest).map(rgb);
    this.cache = new Map(); this.decorCache = new Map(); this.stations = init.stations;
    this.nodePts = init.nodes.map((n) => [n[1], n[2]]);
  }
  zoneAt(x) { for (const z of this.zones) if (x >= z.x0 && x < z.x1) return z; return this.zones[this.zones.length - 1]; }
  zoneIdx(x) { for (let i = 0; i < this.zones.length; i++) if (x < this.zones[i].x1) return i; return this.zones.length - 1; }
  bake(cx, cy) {
    const cv = mk(CH, CH), g = cv.getContext('2d'), img = g.createImageData(CH, CH), d = img.data;
    for (let py = 0; py < CH; py++) for (let px = 0; px < CH; px++) {
      const wx = cx * CW + px * 2, wy = cy * CW + py * 2, i = (py * CH + px) * 4;
      if (wx < 0 || wy < 0 || wx >= this.w || wy >= this.h) { d[i] = 12; d[i + 1] = 14; d[i + 2] = 12; d[i + 3] = 255; continue; }
      const zi = this.zoneIdx(wx + (hash2(px + cx * 999, py + cy * 777) - .5) * 70), z = this.zones[zi].id, pal = this.pal[z];
      const n = vnoise(wx / 150, wy / 150) * .65 + vnoise(wx / 48, wy / 48) * .35, r = hash2(px + cx * 4099, py + cy * 3571);
      let c = n > .5 ? pal[1] : pal[0];
      if (r < .035) c = pal[2]; else if (r > .975) c = pal[3];
      if (z === 'marsh' && vnoise(wx / 260 + 9, wy / 260) > .66) c = r < .12 ? [74, 128, 140] : [42, 78, 92];
      else if (z === 'glacier' && (Math.abs(vnoise(wx / 70, wy / 70) - .5) < .012)) c = pal[3];
      else if (z === 'camp') { const dd = Math.hypot(wx - 330, wy - 1100); if (dd < 150 + n * 40) c = r < .1 ? [150, 132, 92] : [128, 110, 74]; const pathY = Math.abs(wy - 1100 - Math.sin(wx / 190) * 26); if (pathY < 22 && wx < 900) c = r < .15 ? [138, 120, 84] : [120, 102, 70]; }
      else if (z === 'rift' || z === 'abyss') { if (r > .995) c = [255, 240, 255]; }
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); return cv;
  }
  chunk(cx, cy) {
    const k = cx + ',' + cy; let c = this.cache.get(k);
    if (c) { this.cache.delete(k); this.cache.set(k, c); return c; }
    c = this.bake(cx, cy); this.cache.set(k, c);
    if (this.cache.size > 36) this.cache.delete(this.cache.keys().next().value);
    return c;
  }
  decorOf(cx, cy) {
    const k = cx + ',' + cy; let list = this.decorCache.get(k); if (list) return list;
    list = []; const step = 70;
    for (let gx = 0; gx < CW / step; gx++) for (let gy = 0; gy < CW / step; gy++) {
      const wx0 = cx * CW + gx * step, wy0 = cy * CW + gy * step, h = hash2(wx0 | 0, wy0 | 0);
      const x = wx0 + hash2(wx0 + 5, wy0 + 11) * step, y = wy0 + hash2(wx0 + 17, wy0 + 3) * step;
      if (x < 40 || y < 40 || x > this.w - 40 || y > this.h - 40) continue;
      const z = this.zoneAt(x).id, dens = { camp: .07, forest: .26, marsh: .2, ruins: .14, glacier: .15, rift: .15, abyss: .12, obsidian: .12, garden: .26 }[z] || .1;
      if (h > dens) continue;
      if (z === 'camp' && x < 950 && y > 800 && y < 1400) continue;
      let near = false; for (const [nx, ny] of this.nodePts) if (Math.abs(nx - x) < 50 && Math.abs(ny - y) < 50) { near = true; break; } if (near) continue;
      const sp = decorSprites(z), s = sp[Math.floor(hash2(wx0 + 31, wy0 + 7) * sp.length) % sp.length];
      list.push({ x, y, s });
    }
    this.decorCache.set(k, list); if (this.decorCache.size > 80) this.decorCache.delete(this.decorCache.keys().next().value);
    return list;
  }
  // blit ground; returns visible chunk range for decor collection
  draw(ctx, camX, camY, W, H, PX) {
    const x0 = camX - W / 2 / PX, y0 = camY - H / 2 / PX, x1 = camX + W / 2 / PX, y1 = camY + H / 2 / PX;
    const cx0 = Math.floor(x0 / CW), cx1 = Math.floor(x1 / CW), cy0 = Math.floor(y0 / CW), cy1 = Math.floor(y1 / CW);
    ctx.fillStyle = '#0c0e0c'; ctx.fillRect(0, 0, W, H);
    for (let cx = Math.max(0, cx0); cx <= Math.min(Math.ceil(this.w / CW) - 1, cx1); cx++) for (let cy = Math.max(0, cy0); cy <= Math.min(Math.ceil(this.h / CW) - 1, cy1); cy++) {
      ctx.drawImage(this.chunk(cx, cy), Math.floor((cx * CW - camX) * PX + W / 2), Math.floor((cy * CW - camY) * PX + H / 2));
    }
    return { cx0: Math.max(0, cx0), cx1: Math.min(Math.ceil(this.w / CW) - 1, cx1), cy0: Math.max(0, cy0), cy1: Math.min(Math.ceil(this.h / CW) - 1, cy1) };
  }
  collectDecor(range, out, x0, y0, x1, y1) {
    for (let cx = range.cx0; cx <= range.cx1; cx++) for (let cy = range.cy0; cy <= range.cy1; cy++)
      for (const d of this.decorOf(cx, cy)) if (d.x > x0 - 60 && d.x < x1 + 60 && d.y > y0 - 20 && d.y < y1 + 100) out.push(d);
  }
  mapBase(w, h) {
    const cv = mk(w, h), g = cv.getContext('2d'), img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const wx = x / w * this.w, wy = y / h * this.h, z = this.zoneAt(wx + (hash2(x, y) - .5) * 160).id, c = rgb(ZONE_MAP[z] || '#555'), n = (vnoise(wx / 300, wy / 300) - .5) * 40, i = (y * w + x) * 4;
      img.data[i] = clamp(c[0] + n, 0, 255); img.data[i + 1] = clamp(c[1] + n, 0, 255); img.data[i + 2] = clamp(c[2] + n, 0, 255); img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); return cv;
  }
}
