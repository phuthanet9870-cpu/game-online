import { CLASSES, ENEMIES, FURNITURE, MINIONS, RARITY_DEFS, TILE, type GameMap, type Interactable, type Rarity } from '@astra/shared';
import { DMG_COLORS, type CEnt, type ClientGame } from './game.js';

const THEMES: Record<string, { floor: string[]; path: string[]; wall: string; wallTop: string; water: string; tree: string; bg: string }> = {
  town: { floor: ['#5f7d4a', '#668452', '#5a7846'], path: ['#b9a684', '#c2b08e', '#ae9b78'], wall: '#6b5a4a', wallTop: '#8c7660', water: '#3d7fb8', tree: '#2f5a33', bg: '#24331f' },
  field: { floor: ['#4a6a45', '#52734b', '#47643f'], path: ['#8a7a5a', '#937f5e', '#7e6f52'], wall: '#3a4a36', wallTop: '#4f6249', water: '#2d6a96', tree: '#24452a', bg: '#1a2618' },
  ash: { floor: ['#4a3a34', '#52403a', '#44352f'], path: ['#6e6259', '#776a60', '#655a52'], wall: '#2a1e1a', wallTop: '#3d2c26', water: '#c2481e', tree: '#2a201d', bg: '#1a120f' },
  star: { floor: ['#cfc4a8', '#d6ccb2', '#c6ba9c'], path: ['#b8aec8', '#c0b6d0', '#ada3bd'], wall: '#4a4660', wallTop: '#6c6890', water: '#2a2f5a', tree: '#8fd8ff', bg: '#1c1a2c' },
  house: { floor: ['#7a5a3c', '#81603f', '#735537'], path: ['#8a6844', '#916e48', '#82623f'], wall: '#3a2a22', wallTop: '#5a4232', water: '#2d6a96', tree: '#3a5a33', bg: '#140e0a' },
  dungeon: { floor: ['#2d2a3d', '#322e44', '#2a2739'], path: ['#3a3450', '#3f3857', '#363049'], wall: '#17141f', wallTop: '#3b3352', water: '#2a2460', tree: '#4a3f66', bg: '#0b0910' },
};

const AURA_COLORS: Record<string, string> = { ember: '#ff7a2e', starlight: '#9fd8ff', eclipse: '#f2c46b' };
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; };

export class Renderer {
  ctx: CanvasRenderingContext2D;
  cam = { x: 0, y: 0, zoom: 1 };
  dpr = 1;
  w = 0; h = 0;
  private chunks = new Map<string, HTMLCanvasElement>();
  private mapRef: GameMap | null = null;
  minimap: HTMLCanvasElement | null = null;
  hoverId = 0;
  ghost: { x: number; y: number; w: number; h: number; ok: boolean } | null = null;
  time = 0;

  constructor(public canvas: HTMLCanvasElement, public g: ClientGame) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D unsupported');
    this.ctx = ctx;
  }

  resize() {
    this.dpr = Math.min(this.g.quality === 'low' ? 1 : 2, window.devicePixelRatio || 1);
    this.w = this.canvas.clientWidth; this.h = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.w / 2) / this.cam.zoom + this.cam.x, (sy - this.h / 2) / this.cam.zoom + this.cam.y];
  }
  worldToScreen(x: number, y: number): [number, number] {
    return [(x - this.cam.x) * this.cam.zoom + this.w / 2, (y - this.cam.y) * this.cam.zoom + this.h / 2];
  }

  private ensureMap(m: GameMap) {
    if (this.mapRef === m) return;
    this.mapRef = m;
    this.chunks.clear();
    this.minimap = document.createElement('canvas');
    this.minimap.width = m.w; this.minimap.height = m.h;
    const mc = this.minimap.getContext('2d')!;
    const th = THEMES[m.palette ?? m.theme];
    const img = mc.createImageData(m.w, m.h);
    const col = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    for (let i = 0; i < m.tiles.length; i++) {
      const t = m.tiles[i]!;
      const c = col(t === 0 ? '#000000' : t === 3 ? th.water : t === 4 ? th.tree : t === 2 || t === 6 ? th.path[0] : th.floor[0]);
      img.data.set([c[0]!, c[1]!, c[2]!, t === 0 ? 0 : 255], i * 4);
    }
    mc.putImageData(img, 0, 0);
  }

  private chunk(m: GameMap, cx: number, cy: number): HTMLCanvasElement {
    const key = cx + ',' + cy;
    let c = this.chunks.get(key);
    if (c) return c;
    const CH = 16;
    c = document.createElement('canvas');
    c.width = CH * TILE; c.height = CH * TILE + TILE;
    const x = c.getContext('2d')!;
    const th = THEMES[m.palette ?? m.theme];
    const ash = m.palette === 'ash';
    for (let ty = cy * CH; ty < cy * CH + CH; ty++)
      for (let tx = cx * CH; tx < cx * CH + CH; tx++) {
        if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue;
        const t = m.tiles[ty * m.w + tx]!;
        const px = (tx - cx * CH) * TILE, py = (ty - cy * CH) * TILE;
        const hv = hash(tx, ty);
        if (t === 0) {
          // wall: dark body, lighter top face for a 2.5D read
          x.fillStyle = th.wall; x.fillRect(px, py, TILE, TILE);
          const below = ty + 1 < m.h ? m.tiles[(ty + 1) * m.w + tx] : 0;
          if (below !== 0) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(px, py + TILE - 10, TILE, 10); x.fillStyle = th.wallTop; x.fillRect(px, py, TILE, TILE - 12); }
          else { x.fillStyle = th.wallTop; x.globalAlpha = 0.25; x.fillRect(px, py, TILE, TILE); x.globalAlpha = 1; }
          continue;
        }
        const pal = t === 2 || t === 6 || t === 7 ? th.path : th.floor;
        x.fillStyle = pal[hv % 3]!;
        x.fillRect(px, py, TILE, TILE);
        if (t === 7) { x.fillStyle = pal[0]!; x.fillRect(px, py, TILE, TILE); }
        if (t === 6) { x.fillStyle = 'rgba(160,60,200,0.12)'; x.fillRect(px, py, TILE, TILE); }
        if (m.theme === 'dungeon') { x.strokeStyle = 'rgba(0,0,0,0.25)'; x.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1); if (hv % 11 === 0) { x.fillStyle = 'rgba(140,110,220,0.18)'; x.fillRect(px + (hv % 20), py + ((hv >> 5) % 20), 4, 4); } }
        else if (t === 1 && hv % 5 === 0) { x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(px + (hv % 24), py + ((hv >> 4) % 24), 3, 6); }
        if (t === 2 && m.theme === 'town') { x.strokeStyle = 'rgba(0,0,0,0.12)'; x.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1); }
        if (t === 3) { x.fillStyle = th.water; x.fillRect(px, py, TILE, TILE); x.fillStyle = ash ? 'rgba(255,210,90,0.35)' : 'rgba(255,255,255,0.12)'; x.fillRect(px + (hv % 20), py + 8 + (hv % 10), 10, 2); }
        if (t === 4) {
          if (m.theme === 'dungeon') { // pillar
            x.fillStyle = 'rgba(0,0,0,0.4)'; x.beginPath(); x.ellipse(px + 16, py + 26, 14, 6, 0, 0, Math.PI * 2); x.fill();
            x.fillStyle = '#4b4266'; x.fillRect(px + 6, py - 14, 20, 38); x.fillStyle = '#6a5d8f'; x.fillRect(px + 6, py - 18, 20, 6);
          } else if (m.palette === 'star') { // crystal spire
            x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.ellipse(px + 16, py + 26, 12, 5, 0, 0, Math.PI * 2); x.fill();
            x.fillStyle = 'rgba(150,220,255,0.85)'; x.beginPath(); x.moveTo(px + 10, py + 26); x.lineTo(px + 14, py - 20); x.lineTo(px + 22, py + 26); x.closePath(); x.fill();
            x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(px + 14, py - 8, 2, 20);
          } else if (ash) { // charred spire
            x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(px + 16, py + 26, 12, 5, 0, 0, Math.PI * 2); x.fill();
            x.fillStyle = '#1f1714'; x.beginPath(); x.moveTo(px + 8, py + 26); x.lineTo(px + 16, py - 18); x.lineTo(px + 24, py + 26); x.closePath(); x.fill();
            x.fillStyle = 'rgba(255,120,40,0.5)'; x.fillRect(px + 15, py - 4, 2, 10);
          } else { // tree
            x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.ellipse(px + 16, py + 26, 15, 6, 0, 0, Math.PI * 2); x.fill();
            x.fillStyle = '#5a3d25'; x.fillRect(px + 13, py + 10, 6, 16);
            x.fillStyle = th.tree; x.beginPath(); x.arc(px + 16, py + 4, 16, 0, Math.PI * 2); x.fill();
            x.fillStyle = 'rgba(255,255,255,0.08)'; x.beginPath(); x.arc(px + 11, py - 2, 7, 0, Math.PI * 2); x.fill();
          }
        }
      }
    this.chunks.set(key, c);
    return c;
  }

  draw(dt: number) {
    this.time += dt;
    const { ctx, g } = this;
    const m = g.map;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!m) { ctx.fillStyle = '#0b0910'; ctx.fillRect(0, 0, this.w, this.h); return; }
    this.ensureMap(m);
    const me = g.me();
    if (me) { this.cam.x += (me.rx - this.cam.x) * Math.min(1, dt * 10); this.cam.y += (me.ry - this.cam.y) * Math.min(1, dt * 10); }
    const th = THEMES[m.palette ?? m.theme];
    ctx.fillStyle = th.bg; ctx.fillRect(0, 0, this.w, this.h);
    const z = this.cam.zoom;
    const sx = g.shake > 0.3 ? (Math.random() - 0.5) * g.shake : 0, sy = g.shake > 0.3 ? (Math.random() - 0.5) * g.shake : 0;
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (this.w / 2 - this.cam.x * z + sx), this.dpr * (this.h / 2 - this.cam.y * z + sy));
    // tiles via chunk cache
    const [x0, y0] = this.screenToWorld(0, 0), [x1, y1] = this.screenToWorld(this.w, this.h);
    const CHP = 16 * TILE;
    for (let cy = Math.floor(y0 / CHP) - 1; cy <= Math.floor(y1 / CHP); cy++)
      for (let cx = Math.floor(x0 / CHP); cx <= Math.floor(x1 / CHP); cx++) {
        if (cx < 0 || cy < 0 || cx * 16 >= m.w || cy * 16 >= m.h) continue;
        ctx.drawImage(this.chunk(m, cx, cy), cx * CHP, cy * CHP);
      }
    // treasure search circle + housing placement ghost (ground layer)
    const trc = g.char?.treasure; if (trc && trc.zone === g.room?.id) { ctx.strokeStyle = 'rgba(255,210,60,0.5)'; ctx.setLineDash([10, 8]); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(trc.hx, trc.hy, trc.hr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    if (this.ghost) { ctx.fillStyle = this.ghost.ok ? 'rgba(120,255,160,0.3)' : 'rgba(255,80,80,0.3)'; ctx.fillRect(this.ghost.x * TILE, this.ghost.y * TILE, this.ghost.w * TILE, this.ghost.h * TILE); ctx.strokeStyle = '#fff'; ctx.strokeRect(this.ghost.x * TILE, this.ghost.y * TILE, this.ghost.w * TILE, this.ghost.h * TILE); }
    // areas (ground layer)
    for (const a of g.areas) this.drawArea(a);
    // drops
    for (const d of g.drops) this.drawDrop(d);
    // interactables + entities sorted by y
    const items: Array<{ y: number; fn: () => void }> = [];
    for (const it of m.interactables) if (!(it.used || g.usedIts.has(it.id)) || it.type === 'exit') items.push({ y: it.y, fn: () => this.drawInteractable(it) });
    for (const e of g.ents.values()) items.push({ y: e.ry, fn: () => this.drawEnt(e) });
    items.sort((a, b) => a.y - b.y);
    for (const i of items) i.fn();
    // projectiles
    ctx.globalCompositeOperation = this.g.quality === 'low' ? 'source-over' : 'lighter';
    for (const p of g.projs) this.drawProj(p);
    for (const p of g.particles) { ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // dungeon darkness vignette (light radius around player)
    if (m.theme === 'dungeon' && me && this.g.quality !== 'low') {
      const grd = ctx.createRadialGradient(me.rx, me.ry, 200, me.rx, me.ry, 620);
      grd.addColorStop(0, 'rgba(5,3,10,0)'); grd.addColorStop(1, 'rgba(5,3,10,0.72)');
      ctx.fillStyle = grd; ctx.fillRect(x0 - 50, y0 - 50, x1 - x0 + 100, y1 - y0 + 100);
    }
    // floating text
    ctx.textAlign = 'center';
    for (const f of g.fx) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.1);
      ctx.font = `800 ${f.size}px system-ui, sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawArea(a: ClientGame['areas'][number]) {
    const { ctx } = this;
    const enemy = a.team === 1;
    const col = enemy ? '255,60,70' : hexToRgb(DMG_COLORS[a.v.split('_')[0]!] ?? '#ffffff');
    const heal = a.v.endsWith('_heal');
    ctx.save();
    if (a.outside) {
      // Raid "Total Eclipse": darkness everywhere except the safe circle
      const p = a.delayT > 0 ? Math.min(1, 1 - a.delay / a.delayT) : 1;
      ctx.beginPath(); ctx.rect(a.x - 4000, a.y - 4000, 8000, 8000); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2, true);
      ctx.fillStyle = `rgba(40,0,30,${0.25 + p * 0.45})`; ctx.fill('evenodd');
      ctx.lineWidth = 4; ctx.strokeStyle = `rgba(255,230,150,${0.6 + Math.sin(this.time * 8) * 0.3})`; ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      return;
    }
    const path = () => { ctx.beginPath(); if (a.cone) { ctx.moveTo(a.x, a.y); ctx.arc(a.x, a.y, a.r, a.ang - a.arc / 2, a.ang + a.arc / 2); ctx.closePath(); } else ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); };
    if (a.delay > 0 && a.delayT > 0) {
      // telegraph: outline + filling progress
      const p = 1 - a.delay / a.delayT;
      path(); ctx.fillStyle = `rgba(${col},0.14)`; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = `rgba(${col},0.85)`; ctx.setLineDash(enemy ? [] : [6, 6]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath();
      if (a.cone) { ctx.moveTo(a.x, a.y); ctx.arc(a.x, a.y, a.r * p, a.ang - a.arc / 2, a.ang + a.arc / 2); ctx.closePath(); } else ctx.arc(a.x, a.y, a.r * p, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col},0.32)`; ctx.fill();
    } else if (a.dur > 0.05) {
      const pulse = 0.18 + Math.sin(this.time * 6 + a.id) * 0.05;
      path(); ctx.fillStyle = heal ? `rgba(120,255,160,${pulse})` : `rgba(${col},${pulse})`; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = heal ? 'rgba(160,255,190,0.6)' : `rgba(${col},0.55)`; ctx.stroke();
    } else {
      // instant hit flash, fading
      const t = Math.min(1, a.age / 0.25);
      ctx.globalAlpha = Math.max(0, 0.6 * (1 - t));
      path(); ctx.fillStyle = `rgba(${col},0.7)`; ctx.fill();
      if (a.cone) { ctx.lineWidth = 4; ctx.strokeStyle = `rgba(255,255,255,0.8)`; ctx.beginPath(); ctx.arc(a.x, a.y, a.r * 0.85, a.ang - a.arc / 2, a.ang + a.arc / 2); ctx.stroke(); }
    }
    ctx.restore();
  }

  private drawDrop(d: ClientGame['drops'][number]) {
    const { ctx } = this;
    const gold = d.rarity === 'gold';
    const color = gold ? '#ffd23a' : RARITY_DEFS[d.rarity as Rarity]?.color ?? '#fff';
    const bob = Math.sin(this.time * 4 + d.id) * 2;
    if (!gold && d.rarity !== 'common') {
      const grd = ctx.createLinearGradient(d.x, d.y - 60, d.x, d.y);
      grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, color + '99');
      ctx.fillStyle = grd; ctx.fillRect(d.x - 3, d.y - 60, 6, 60);
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    if (gold) ctx.arc(d.x, d.y + bob, 5, 0, Math.PI * 2); else { ctx.moveTo(d.x, d.y - 8 + bob); ctx.lineTo(d.x + 7, d.y + bob); ctx.lineTo(d.x, d.y + 8 + bob); ctx.lineTo(d.x - 7, d.y + bob); ctx.closePath(); }
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    if (!gold) {
      ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      const w = ctx.measureText(d.name).width + 8;
      ctx.fillRect(d.x - w / 2, d.y - 26, w, 15);
      ctx.fillStyle = color; ctx.fillText((RARITY_DEFS[d.rarity as Rarity]?.glyph ?? '') + ' ' + d.name, d.x, d.y - 15);
    }
  }

  private drawInteractable(it: Interactable) {
    const { ctx } = this;
    const t = this.time;
    ctx.save();
    ctx.translate(it.x, it.y);
    shadow(ctx, 0, 10, 18, 7);
    switch (it.type) {
      case 'portal_dungeon': case 'exit': {
        const c = it.type === 'exit' ? '255,214,110' : '170,90,255';
        for (let i = 0; i < 3; i++) { ctx.strokeStyle = `rgba(${c},${0.8 - i * 0.2})`; ctx.lineWidth = 4 - i; ctx.beginPath(); ctx.ellipse(0, -20, 26 + i * 6 + Math.sin(t * 3 + i) * 2, 38 + i * 6, 0, 0, Math.PI * 2); ctx.stroke(); }
        const grd = ctx.createRadialGradient(0, -20, 2, 0, -20, 34); grd.addColorStop(0, `rgba(${c},0.9)`); grd.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(0, -20, 26, 38, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'furniture': case 'stash': case 'npc_alchemist': case 'npc_smith': if (it.furn) { drawFurniture(ctx, it.furn, it.fw ?? 1, it.fh ?? 1, t); break; } if (it.type !== 'stash') { drawChibi(ctx, 0, 0, 1, Math.PI / 2, it.type === 'npc_smith' ? '#8a4b2b' : '#3b7a6a', it.type === 'npc_smith' ? '#2b1a10' : '#e8e0f0', '#ccc', 0, Math.sin(t * 2) * 1.5, ''); break; } ctx.fillStyle = '#3d4a7a'; ctx.fillRect(-18, -30, 36, 34); ctx.fillStyle = '#9fb4ff'; ctx.fillRect(-12, -24, 24, 4); ctx.fillRect(-12, -14, 24, 4); break;
      case 'house_door': case 'house_exit': ctx.fillStyle = '#5a3a22'; ctx.fillRect(-14, -34, 28, 36); ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.arc(8, -16, 2.5, 0, Math.PI * 2); ctx.fill(); break;
      case 'ore': {
        const star = it.res === 'starsteel';
        ctx.fillStyle = '#4a4240'; ctx.beginPath(); ctx.moveTo(-16, 4); ctx.lineTo(-10, -16); ctx.lineTo(4, -20); ctx.lineTo(16, -6); ctx.lineTo(14, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = star ? `rgba(160,220,255,${0.7 + Math.sin(t * 3) * 0.3})` : '#c48a5a'; for (const [ox, oy] of [[-6, -8], [4, -12], [8, -2]]) { ctx.beginPath(); ctx.arc(ox!, oy!, 2.5, 0, Math.PI * 2); ctx.fill(); }
        break;
      }
      case 'fishing': ctx.strokeStyle = '#d8c9a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(10, -30); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10, -30); ctx.lineTo(16, -2 + Math.sin(t * 3) * 2); ctx.stroke(); ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(16, -2 + Math.sin(t * 3) * 2, 2.5, 0, Math.PI * 2); ctx.fill(); break;
      case 'gate_field': case 'gate_town': case 'gate_highlands': case 'gate_meadow':
        ctx.fillStyle = '#6b4a2b'; ctx.fillRect(-3, -40, 6, 46); ctx.fillStyle = '#c9a66b'; ctx.beginPath(); ctx.moveTo(-18, -38); ctx.lineTo(18, -38); ctx.lineTo(26, -30); ctx.lineTo(18, -22); ctx.lineTo(-18, -22); ctx.closePath(); ctx.fill();
        break;
      case 'chest':
        ctx.fillStyle = '#6a3f1f'; ctx.fillRect(-16, -18, 32, 22); ctx.fillStyle = '#d8a843'; ctx.fillRect(-16, -12, 32, 4); ctx.fillRect(-3, -14, 6, 8);
        ctx.fillStyle = `rgba(255,220,120,${0.3 + Math.sin(t * 4) * 0.2})`; ctx.beginPath(); ctx.arc(0, -8, 26, 0, Math.PI * 2); ctx.fill();
        break;
      case 'shrine':
        ctx.fillStyle = '#c8c8e8'; ctx.fillRect(-8, -44, 16, 48); ctx.fillStyle = `rgba(140,200,255,${0.6 + Math.sin(t * 3) * 0.3})`; ctx.beginPath(); ctx.arc(0, -54, 9, 0, Math.PI * 2); ctx.fill();
        break;
      case 'fountain':
        ctx.fillStyle = '#7c8aa8'; ctx.beginPath(); ctx.ellipse(0, -4, 24, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = `rgba(110,190,255,${0.7 + Math.sin(t * 2) * 0.2})`; ctx.beginPath(); ctx.ellipse(0, -6, 18, 8, 0, 0, Math.PI * 2); ctx.fill();
        break;
      case 'altar':
        ctx.fillStyle = '#3a1e2e'; ctx.fillRect(-18, -20, 36, 22); ctx.fillStyle = `rgba(255,60,90,${0.6 + Math.sin(t * 5) * 0.3})`; ctx.beginPath(); ctx.arc(0, -28, 7, 0, Math.PI * 2); ctx.fill();
        break;
      case 'herb':
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + t * 0.3; ctx.fillStyle = '#d8c6ff'; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 6, -8 + Math.sin(a) * 4, 5, 3, a, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#fff6a8'; ctx.beginPath(); ctx.arc(0, -8, 3, 0, Math.PI * 2); ctx.fill();
        break;
      case 'stash':
        ctx.fillStyle = '#3d4a7a'; ctx.fillRect(-18, -30, 36, 34); ctx.fillStyle = '#9fb4ff'; ctx.fillRect(-12, -24, 24, 4); ctx.fillRect(-12, -14, 24, 4);
        break;
      default: {
        // NPC: chibi townsfolk
        const colors: Record<string, [string, string]> = { npc_carpenter: ['#7a5a2a', '#c87a3a'], npc_alchemist: ['#3b7a6a', '#e8e0f0'], npc_auction: ['#6b4a8f', '#d8c08a'], npc_smith: ['#8a4b2b', '#2b1a10'], npc_trainer: ['#3b5c8f', '#e0e0e8'], npc_quartermaster: ['#5c7a3b', '#6b3b1f'], npc_quests: ['#8f2b3b', '#f0d070'] };
        const [body, hair] = colors[it.type] ?? ['#777', '#333'];
        drawChibi(ctx, 0, 0, 1, Math.PI / 2, body, hair, '#ccc', 0, Math.sin(t * 2) * 1.5, '');
        ctx.fillStyle = '#ffd23a'; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; if (it.type === 'npc_quests') ctx.fillText('!', 0, -58 + Math.sin(t * 4) * 2);
      }
    }
    ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'center';
    if (!it.deco) label(ctx, it.name, 0, it.type.startsWith('npc') ? -46 : -66, '#f2e6c8');
    ctx.restore();
  }

  private drawEnt(e: CEnt) {
    const { ctx } = this;
    const g = this.g;
    if (e.dead && e.kind !== 0) return;
    ctx.save();
    ctx.translate(e.rx, e.ry);
    const scale = 1 + (e.size || 0) / 100;
    const bob = e.moving > 0.2 ? Math.abs(Math.sin(this.time * 12 + e.id)) * 3 : Math.sin(this.time * 2 + e.id) * 0.8;
    const isTarget = g.self?.target === e.id;
    if (isTarget || this.hoverId === e.id) { ctx.strokeStyle = isTarget ? '#ff5f5f' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 8, 22 * scale, 9 * scale, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (e.kind === 0 && e.pet && !e.dead) {
      // companion trails behind its owner (client-side smoothing; position is cosmetic)
      const tx = e.rx - Math.cos(e.f) * 34 - 18, ty = e.ry - Math.sin(e.f) * 20 + 6;
      e.petX = e.petX === undefined ? tx : e.petX + (tx - e.petX) * 0.08;
      e.petY = e.petY === undefined ? ty : e.petY + (ty - e.petY) * 0.08;
      ctx.save(); ctx.translate(e.petX - e.rx, e.petY - e.ry);
      const pb = Math.sin(this.time * 5 + e.id) * 2;
      shadow(ctx, 0, 4, 8, 3);
      if (e.pet === 'lumi_fox') { ctx.fillStyle = '#e8873a'; ctx.beginPath(); ctx.ellipse(0, -6 - pb * 0.3, 9, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(8, -18); ctx.lineTo(10, -9); ctx.fill(); ctx.beginPath(); ctx.moveTo(-2, -10); ctx.lineTo(1, -18); ctx.lineTo(4, -9); ctx.fill(); ctx.fillStyle = `rgba(255,220,120,${0.6 + Math.sin(this.time * 4) * 0.3})`; ctx.beginPath(); ctx.arc(-12, -8 - pb, 4, 0, Math.PI * 2); ctx.fill(); }
      else if (e.pet === 'moon_owl') { ctx.fillStyle = '#b9c6ee'; ctx.beginPath(); ctx.arc(0, -20 - pb, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffe58a'; ctx.beginPath(); ctx.arc(-3, -21 - pb, 2, 0, Math.PI * 2); ctx.arc(3, -21 - pb, 2, 0, Math.PI * 2); ctx.fill(); }
      else { const grd = ctx.createRadialGradient(0, -16 - pb, 1, 0, -16 - pb, 10); grd.addColorStop(0, '#fff2b0'); grd.addColorStop(0.5, '#ff6a2e'); grd.addColorStop(1, 'rgba(255,60,0,0)'); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, -16 - pb, 10, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    if (e.kind === 0) {
      const cd = CLASSES[e.def as keyof typeof CLASSES];
      const au = AURA_COLORS[e.aura];
      if (au && !e.dead) { ctx.globalCompositeOperation = 'lighter'; const grd = ctx.createRadialGradient(0, -14, 6, 0, -14, 34); grd.addColorStop(0, au + '00'); grd.addColorStop(0.6, au + '55'); grd.addColorStop(1, au + '00'); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, -14, 34, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = au + 'aa'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 6, 18 + Math.sin(this.time * 3) * 2, 7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = e.dead ? 0.35 : e.invuln && e.id === g.pid ? 0.75 : 1;
      drawChibi(ctx, 0, 0, scale, e.f, cd?.colors.body ?? '#888', cd?.colors.hair ?? '#333', cd?.colors.accent ?? '#ccc', e.swingT, bob, e.def);
      ctx.globalAlpha = 1;
      if (e.id !== g.pid) { ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; label(ctx, `${e.name} · ${e.lv}`, 0, -54 * scale, '#bfe3ff'); bar(ctx, -20, -48 * scale, 40, 4, e.hp / e.mhp, '#5bd16a'); }
    } else if (e.kind === 1) {
      this.drawEnemy(e, scale, bob);
    } else {
      this.drawMinion(e, bob);
    }
    // status pips
    if (e.st.length && !e.dead) {
      const cols: Record<string, string> = { burn: '#ff7a2e', freeze: '#9fe8ff', chill: '#7fc8ff', shock: '#d6b8ff', poison: '#8ff06a', bleed: '#ff3b3b', curse: '#b06cff', slow: '#9aa', stun: '#ffe066', weaken: '#c8a', vulnerable: '#ff9ad5', marked: '#ffb347', broken: '#ff9f1a' };
      e.st.forEach((s, i) => { ctx.fillStyle = cols[s] ?? '#fff'; ctx.beginPath(); ctx.arc(-((e.st.length - 1) * 7) / 2 + i * 7, 16, 3, 0, Math.PI * 2); ctx.fill(); });
      if (e.st.includes('freeze')) { ctx.fillStyle = 'rgba(160,230,255,0.35)'; ctx.beginPath(); ctx.arc(0, -14, 22, 0, Math.PI * 2); ctx.fill(); }
      if (e.st.includes('stun') || e.st.includes('broken')) { ctx.fillStyle = '#ffe066'; for (let i = 0; i < 3; i++) { const a = this.time * 5 + i * 2.1; ctx.beginPath(); ctx.arc(Math.cos(a) * 12, -40 + Math.sin(a) * 3, 2.5, 0, Math.PI * 2); ctx.fill(); } }
    }
    if (e.barrier > 0) { ctx.strokeStyle = 'rgba(140,210,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -14, 24 * scale, 0, Math.PI * 2); ctx.stroke(); }
    if (e.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,255,255,${e.flash * 2})`; ctx.beginPath(); ctx.arc(0, -12, 16 * scale, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
  }

  private drawEnemy(e: CEnt, scale: number, bob: number) {
    const { ctx } = this;
    const def = ENEMIES[e.def];
    const elite = (e.flags & 1) !== 0, boss = (e.flags & 2) !== 0;
    const r = (def?.radius ?? 15) * (elite ? 1.15 : 1);
    shadow(ctx, 0, 6, r * 1.1, r * 0.45);
    if (e.windup > 0) { ctx.strokeStyle = `rgba(255,70,70,${0.4 + e.windup * 0.6})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -r * 0.7, r + 6 + e.windup * 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e.windup); ctx.stroke(); }
    if (elite || boss) { const grd = ctx.createRadialGradient(0, -r * 0.6, r * 0.3, 0, -r * 0.6, r * 2); grd.addColorStop(0, boss ? 'rgba(255,60,140,0.35)' : 'rgba(255,190,60,0.3)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, -r * 0.6, r * 2, 0, Math.PI * 2); ctx.fill(); }
    const col = def?.color ?? '#666';
    const fam = def?.family;
    const fx = Math.cos(e.f), fy = Math.sin(e.f);
    if (e.def === 'dummy') {
      ctx.fillStyle = '#7a5a34'; ctx.fillRect(-3, -10, 6, 18); ctx.fillStyle = '#c8a46a'; ctx.beginPath(); ctx.ellipse(0, -22, 13, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#a33'; ctx.beginPath(); ctx.arc(0, -24, 5, 0, Math.PI * 2); ctx.fill();
    } else if ((fam === 'wildlife' && e.def !== 'wisp') || e.def === 'cinder_drake' || e.def === 'shard_stalker') {
      // quadruped beast
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -r * 0.6 - bob * 0.5, r * 1.15, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(fx * r * 0.9, -r * 0.7 + fy * r * 0.4 - bob * 0.5, r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffde5a'; ctx.beginPath(); ctx.arc(fx * r * 1.15 - fy * 3, -r * 0.8 + fy * r * 0.4, 2, 0, Math.PI * 2); ctx.arc(fx * r * 1.15 + fy * 3, -r * 0.8 + fy * r * 0.4, 2, 0, Math.PI * 2); ctx.fill();
      if (e.def === 'thornback') { ctx.fillStyle = '#d8c8a0'; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 5 - 3, -r * 1.1); ctx.lineTo(i * 5, -r * 1.6); ctx.lineTo(i * 5 + 3, -r * 1.1); ctx.fill(); } }
    } else if (e.def === 'wisp' || e.def === 'starling') {
      const grd = ctx.createRadialGradient(0, -20 - bob, 2, 0, -20 - bob, r * 1.6); grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.4, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, -20 - bob, r * 1.6, 0, Math.PI * 2); ctx.fill();
    } else {
      // hooded hollowborn humanoid
      const h = r * 2.4;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.quadraticCurveTo(-r * 1.1, -h * 0.6, 0, -h - bob); ctx.quadraticCurveTo(r * 1.1, -h * 0.6, r, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.ellipse(fx * 3, -h * 0.68 - bob, r * 0.55, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      const eye = boss ? '#ff4f9a' : elite ? '#ffb347' : '#c8a0ff';
      ctx.fillStyle = eye; ctx.shadowColor = eye; ctx.shadowBlur = this.g.quality === 'high' ? 8 : 0;
      ctx.beginPath(); ctx.arc(fx * 5 - 4, -h * 0.68 - bob + fy * 2, 2.2, 0, Math.PI * 2); ctx.arc(fx * 5 + 4, -h * 0.68 - bob + fy * 2, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      if (e.def === 'hollow_archer') { ctx.strokeStyle = '#a0907a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(fx * r, -h * 0.45, r * 0.9, e.f - 1.2, e.f + 1.2); ctx.stroke(); }
      if (e.def === 'hollow_hexer') { ctx.fillStyle = '#ff6ad5'; ctx.beginPath(); ctx.arc(fx * r * 1.2, -h * 0.5 + Math.sin(this.time * 4) * 3, 4, 0, Math.PI * 2); ctx.fill(); }
      if (e.def === 'hollow_grunt' || e.def === 'hollow_brute' || e.def === 'hollow_captain') { ctx.strokeStyle = '#9a9aa8'; ctx.lineWidth = e.def === 'hollow_grunt' ? 2 : 4; ctx.beginPath(); ctx.moveTo(fx * r * 0.6, -h * 0.4); ctx.lineTo(fx * r * 1.8, -h * 0.4 + fy * r * 0.8 - 6); ctx.stroke(); }
      if (boss) { ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -h - 8 - bob, r * 0.7, r * 0.22, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    if (e.def !== 'dummy' || e.hp < e.mhp) {
      const w = boss ? 0 : Math.max(30, r * 2.4);
      if (w) bar(ctx, -w / 2, -r * 2.7 - 8, w, 4, e.hp / e.mhp, elite ? '#ffb347' : '#e04848');
      if (elite) { ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; label(ctx, e.affixes.join(' · ') || 'Elite', 0, -r * 2.7 - 14, '#ffcf7a'); }
    }
  }

  private drawMinion(e: CEnt, bob: number) {
    const { ctx } = this;
    const md = MINIONS[e.def];
    const col = md?.color ?? '#ddd';
    const r = md?.radius ?? 12;
    shadow(ctx, 0, 5, r, r * 0.4);
    ctx.globalAlpha = 0.92;
    if (e.def === 'wraith') { const grd = ctx.createRadialGradient(0, -18 - bob, 2, 0, -18 - bob, r * 1.8); grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, col); grd.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, -18 - bob, r * 1.8, 0, Math.PI * 2); ctx.fill(); }
    else if (e.def === 'hawk') { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -30 - bob); ctx.lineTo(-14, -24 - bob + Math.sin(this.time * 18) * 5); ctx.lineTo(0, -20 - bob); ctx.lineTo(14, -24 - bob + Math.sin(this.time * 18) * 5); ctx.closePath(); ctx.fill(); }
    else if (e.def === 'turret') { ctx.fillStyle = '#5a6b3a'; ctx.fillRect(-9, -16, 18, 18); ctx.fillStyle = col; ctx.save(); ctx.translate(0, -12); ctx.rotate(e.f); ctx.fillRect(0, -3, 16, 6); ctx.restore(); }
    else { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -r - bob, r * 0.8, r * 1.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-3, -r * 1.6 - bob, 2, 0, Math.PI * 2); ctx.arc(3, -r * 1.6 - bob, 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    bar(ctx, -12, -r * 2.6, 24, 3, e.hp / e.mhp, '#7be0b5');
  }

  private drawProj(p: ClientGame['projs'][number]) {
    const { ctx } = this;
    const type = p.v.replace('enemy_', '').replace('_basic', '');
    const enemy = p.team === 1;
    const col = enemy ? (p.v === 'enemy_orb' ? '#ff4fa0' : '#ff6b6b') : DMG_COLORS[type] ?? '#fff';
    const ang = Math.atan2(p.vy, p.vx);
    if (type === 'physical' && !enemy && p.r <= 10) {
      ctx.strokeStyle = '#f5e9c8'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(p.x - Math.cos(ang) * 16, p.y - Math.sin(ang) * 16); ctx.lineTo(p.x, p.y); ctx.stroke();
      return;
    }
    const r = Math.max(4, p.r);
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.2);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.35, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2); ctx.fill();
    if (this.g.quality === 'high') { ctx.strokeStyle = col; ctx.globalAlpha = 0.4; ctx.lineWidth = r; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(ang) * r * 3, p.y - Math.sin(ang) * r * 3); ctx.stroke(); ctx.globalAlpha = 1; }
  }

  drawMinimap(c: HTMLCanvasElement, big: boolean) {
    const g = this.g; const m = g.map;
    if (!m || !this.minimap) return;
    const x = c.getContext('2d')!;
    const W = c.width, H = c.height;
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(8,6,14,0.75)'; x.fillRect(0, 0, W, H);
    const me = g.me();
    const scale = big ? Math.min(W / m.w, H / m.h) : 3;
    const ox = big ? (W - m.w * scale) / 2 : W / 2 - ((me?.rx ?? 0) / TILE) * scale;
    const oy = big ? (H - m.h * scale) / 2 : H / 2 - ((me?.ry ?? 0) / TILE) * scale;
    x.imageSmoothingEnabled = false;
    x.drawImage(this.minimap, ox, oy, m.w * scale, m.h * scale);
    const dot = (wx: number, wy: number, col: string, r: number) => { x.fillStyle = col; x.beginPath(); x.arc(ox + (wx / TILE) * scale, oy + (wy / TILE) * scale, r, 0, Math.PI * 2); x.fill(); };
    const tr = g.char?.treasure; if (tr && tr.zone === g.room?.id) { x.strokeStyle = '#ffd23a'; x.setLineDash([3, 3]); x.lineWidth = 1.5; x.beginPath(); x.arc(ox + (tr.hx / TILE) * scale, oy + (tr.hy / TILE) * scale, (tr.hr / TILE) * scale, 0, Math.PI * 2); x.stroke(); x.setLineDash([]); }
    if (g.worldEvent?.active && m.theme === 'field') { const pulse = 4 + Math.sin(performance.now() / 200) * 2; dot(g.worldEvent.x, g.worldEvent.y, '#ff4f9a', big ? pulse + 3 : pulse); }
    for (const it of m.interactables) if (!it.used && !g.usedIts.has(it.id)) dot(it.x, it.y, it.type === 'exit' || it.type === 'portal_dungeon' ? '#c58cff' : it.type === 'herb' ? '#d8c6ff' : '#ffd23a', big ? 4 : 3);
    for (const e of g.ents.values()) dot(e.rx, e.ry, e.id === g.pid ? '#ffffff' : e.kind === 0 ? '#5fd0ff' : e.kind === 2 ? '#7be0b5' : (e.flags & 2) ? '#ff4f9a' : '#ff5f5f', e.id === g.pid ? 4 : (e.flags & 2) ? 5 : 2);
    if (big) for (const r of m.rooms) { x.fillStyle = '#e8d8ff'; x.font = '10px system-ui'; x.textAlign = 'center'; if (r.type !== 'combat') x.fillText(r.type, ox + r.cx * scale, oy + (r.cy - r.h / 2 - 1) * scale); }
  }
}

function drawFurniture(ctx: CanvasRenderingContext2D, id: string, fw: number, fh: number, t: number) {
  const W = fw * TILE, H = fh * TILE;
  const c = FURNITURE[id]?.color ?? '#888';
  const solid = FURNITURE[id]?.solid;
  ctx.save();
  ctx.translate(-W / 2, solid ? -H - 8 : -H / 2);
  if (id === 'rug') { ctx.fillStyle = c; ctx.fillRect(2, 2, W - 4, H - 4); ctx.strokeStyle = '#f2c46b'; ctx.lineWidth = 2; ctx.strokeRect(6, 6, W - 12, H - 12); ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.min(W, H) / 4, 0, Math.PI * 2); ctx.stroke(); }
  else if (id === 'lantern' || id === 'dummy') { if (id === 'lantern') { const g = ctx.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, 40); g.addColorStop(0, `rgba(255,224,138,${0.7 + Math.sin(t * 3) * 0.2})`); g.addColorStop(1, 'rgba(255,224,138,0)'); ctx.fillStyle = g; ctx.fillRect(-24, -24, W + 48, H + 48); ctx.fillStyle = '#3a2a22'; ctx.fillRect(W / 2 - 2, H / 2 - 4, 4, 14); } }
  else {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(2, H - 4, W - 4, 8);
    ctx.fillStyle = c; ctx.fillRect(2, 0, W - 4, H);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(2, 0, W - 4, 6);
    if (id === 'bed') { ctx.fillStyle = '#e8e6f0'; ctx.fillRect(6, 4, W - 12, 12); }
    if (id === 'bookshelf') for (let i = 0; i < 6; i++) { ctx.fillStyle = ['#c84a4a', '#4a8ac8', '#d8b25f'][i % 3]!; ctx.fillRect(6 + i * 9, 8, 6, H - 14); }
    if (id === 'plant') { ctx.fillStyle = '#5a3a22'; ctx.fillRect(8, H - 12, W - 16, 10); ctx.fillStyle = '#d8c6ff'; ctx.beginPath(); ctx.arc(W / 2, 8, 8, 0, Math.PI * 2); ctx.fill(); }
    if (id.startsWith('trophy')) { ctx.fillStyle = '#d8d0c0'; ctx.fillRect(6, H - 10, W - 12, 10); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(W / 2, 10, 8, 0, Math.PI * 2); ctx.fill(); }
    if (id === 'alchemy_table') { for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#8ff06a', '#ff8a3d', '#9fd8ff'][i]!; ctx.beginPath(); ctx.arc(12 + i * 18, 4, 5, 0, Math.PI * 2); ctx.fill(); } }
    if (id === 'anvil') { ctx.fillStyle = '#3a3a44'; ctx.fillRect(4, 4, W - 8, 10); }
  }
  ctx.restore();
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}
function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, col: string) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = col; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, col: string) {
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(text, x, y); ctx.fillStyle = col; ctx.fillText(text, x, y);
}
function hexToRgb(h: string) { return `${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)}`; }

/** Chibi anime-style humanoid: big head, expressive eyes, class weapon. */
export function drawChibi(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, facing: number, body: string, hair: string, accent: string, swing: number, bob: number, cls: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  shadow(ctx, 0, 6, 15, 6);
  const fx = Math.cos(facing), fy = Math.sin(facing);
  const back = fy < -0.3;
  const drawWeapon = () => {
    ctx.save();
    ctx.translate(fx * 10, -16 - bob + fy * 4);
    ctx.rotate(facing + (swing > 0 ? (0.25 - swing) * 8 - 1 : 0.4));
    ctx.lineCap = 'round';
    switch (cls) {
      case 'warrior': ctx.strokeStyle = '#d8dde8'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(30, 0); ctx.stroke(); ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(4, 6); ctx.stroke(); break;
      case 'mage': ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(26, 0); ctx.stroke(); ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(28, 0, 5, 0, Math.PI * 2); ctx.fill(); break;
      case 'assassin': ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(16, -6); ctx.moveTo(0, 4); ctx.lineTo(16, 6); ctx.stroke(); break;
      case 'ranger': ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(4, 0, 14, -1.3, 1.3); ctx.stroke(); ctx.strokeStyle = '#eee'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(4 + Math.cos(-1.3) * 14, Math.sin(-1.3) * 14); ctx.lineTo(4 + Math.cos(1.3) * 14, Math.sin(1.3) * 14); ctx.stroke(); break;
      case 'paladin': ctx.strokeStyle = '#c0c0d0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(22, 0); ctx.stroke(); ctx.fillStyle = accent; ctx.fillRect(18, -6, 9, 12); break;
      case 'chronomancer': ctx.fillStyle = '#d8b25f'; ctx.fillRect(8, -9, 14, 3); ctx.fillRect(8, 6, 14, 3); ctx.fillStyle = 'rgba(160,240,230,0.85)'; ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(20, -6); ctx.lineTo(15, 0); ctx.lineTo(20, 6); ctx.lineTo(10, 6); ctx.lineTo(15, 0); ctx.closePath(); ctx.fill(); break;
      case 'necromancer': ctx.strokeStyle = '#3a3040'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(26, 0); ctx.stroke(); ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(26, -8, 9, 0.2, 1.8); ctx.stroke(); break;
      default: break;
    }
    ctx.restore();
  };
  if (back) drawWeapon();
  // legs
  ctx.fillStyle = '#2a2433';
  ctx.fillRect(-6, -8 - bob * 0.3, 4, 10 + bob * 0.3); ctx.fillRect(2, -8 + bob * 0.3, 4, 10 - bob * 0.3);
  // body
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.moveTo(-10, -6 - bob); ctx.lineTo(10, -6 - bob); ctx.lineTo(8, -24 - bob); ctx.lineTo(-8, -24 - bob); ctx.closePath(); ctx.fill();
  ctx.fillStyle = accent; ctx.fillRect(-8, -14 - bob, 16, 2.5);
  if (cls === 'paladin' && !back) { ctx.fillStyle = '#d8d8e8'; ctx.beginPath(); ctx.arc(-fx * 6 - 8, -16 - bob, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = accent; ctx.fillRect(-fx * 6 - 9, -21 - bob, 2, 10); }
  // head
  const hy = -34 - bob;
  ctx.fillStyle = '#ffe2cc'; ctx.beginPath(); ctx.arc(0, hy, 11, 0, Math.PI * 2); ctx.fill();
  // hair
  ctx.fillStyle = hair;
  ctx.beginPath(); ctx.arc(0, hy - 2, 12, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
  if (back) { ctx.beginPath(); ctx.arc(0, hy, 11.5, 0, Math.PI * 2); ctx.fill(); }
  else {
    ctx.beginPath(); ctx.moveTo(-12, hy - 2); ctx.lineTo(-13, hy + 8); ctx.lineTo(-8, hy + 1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(12, hy - 2); ctx.lineTo(13, hy + 8); ctx.lineTo(8, hy + 1); ctx.fill();
    // bangs
    ctx.beginPath(); ctx.moveTo(-9, hy - 4); ctx.lineTo(-4 + fx * 2, hy + 1); ctx.lineTo(0 + fx * 2, hy - 4); ctx.lineTo(4 + fx * 2, hy + 1); ctx.lineTo(9, hy - 4); ctx.lineTo(0, hy - 12); ctx.closePath(); ctx.fill();
    // eyes (anime: tall, with highlight)
    const ex = fx * 3;
    ctx.fillStyle = '#2b2440';
    ctx.beginPath(); ctx.ellipse(ex - 4, hy + 2 + fy, 1.8, 2.8, 0, 0, Math.PI * 2); ctx.ellipse(ex + 4, hy + 2 + fy, 1.8, 2.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex - 3.4, hy + 1 + fy, 0.8, 0, Math.PI * 2); ctx.arc(ex + 4.6, hy + 1 + fy, 0.8, 0, Math.PI * 2); ctx.fill();
  }
  if (cls === 'mage') { ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-13, hy - 6); ctx.lineTo(13, hy - 6); ctx.lineTo(2, hy - 28); ctx.closePath(); ctx.fill(); }
  if (cls === 'assassin' && !back) { ctx.fillStyle = '#1b1b24'; ctx.fillRect(-9, hy + 4, 18, 5); }
  if (cls === 'chronomancer') { ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, hy - 2, 15, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); for (let i = 0; i < 5; i++) { const a = Math.PI * (1.15 + i * 0.17); ctx.fillStyle = accent; ctx.fillRect(Math.cos(a) * 15 - 1, hy - 2 + Math.sin(a) * 15 - 1, 2, 2); } }
  if (cls === 'necromancer') { ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, hy - 1, 13, Math.PI, Math.PI * 2); ctx.fill(); }
  if (!back) drawWeapon();
  ctx.restore();
}
