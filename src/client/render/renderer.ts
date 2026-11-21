/**
 * Isometric pixel-art renderer.
 *  - World is drawn to a low-resolution canvas and scaled up (crisp pixels).
 *  - Ground is pre-rendered into 16x16-tile chunk canvases on demand (chunk cache).
 *  - Tall tiles + entities are depth sorted by (x + y).
 *  - Text/HP bars go on a full-resolution overlay canvas.
 */
import { BLOCKING, T, tileAt } from '../../shared/mapgen.ts';
import { getMonster } from '../../shared/config/monsters.ts';
import { getItem, RARITY_INFO, type Rarity } from '../../shared/config/items.ts';
import { ANIM, FLAG } from '../../shared/protocol.ts';
import type { GameClient, ClientEntity } from '../game.ts';
import { TH, TW, screenDir, toScreen, toWorld } from './iso.ts';
import { makeCanvas, pnoise } from './pixel.ts';
import { BLOCK_STYLE, blockSprite, characterSprite, goldIcon, groundTile, itemIcon, monsterSprite, nodeSprite, npcPalette, paletteFor, rockSprite, treeSprite, weaponSprite } from './sprites.ts';

const CHUNK = 16;
const FONT = '"Pixelify Sans", "Noto Sans Thai", "Tahoma", sans-serif';

interface Drawable { depth: number; draw: () => void }

export class Renderer {
  readonly low: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private octx: CanvasRenderingContext2D;
  scale = 3;
  private chunks = new Map<string, HTMLCanvasElement>();
  private chunkZone = '';
  camX = 0; camY = 0; // screen-space camera (low-res pixels)
  hoverId: number | null = null;
  interactId: number | null = null;

  constructor(private view: HTMLCanvasElement, private overlay: HTMLCanvasElement) {
    [this.low, this.lctx] = makeCanvas(320, 180);
    this.octx = overlay.getContext('2d')!;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.scale = w >= 1700 ? 4 : w >= 900 ? 3 : 2;
    this.low.width = Math.ceil(w / this.scale);
    this.low.height = Math.ceil(h / this.scale);
    this.lctx.imageSmoothingEnabled = false;
    this.view.width = this.low.width; this.view.height = this.low.height;
    this.view.style.width = `${this.low.width * this.scale}px`;
    this.view.style.height = `${this.low.height * this.scale}px`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.overlay.width = Math.floor(w * dpr); this.overlay.height = Math.floor(h * dpr);
    this.overlay.style.width = `${w}px`; this.overlay.style.height = `${h}px`;
    this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Screen (CSS px) -> world coords. */
  screenToWorld(px: number, py: number): { x: number; y: number } {
    return toWorld(px / this.scale + this.camX, py / this.scale + this.camY);
  }

  private chunk(g: GameClient, cx: number, cy: number): HTMLCanvasElement {
    const key = `${cx},${cy}`;
    let c = this.chunks.get(key);
    if (c) return c;
    const map = g.map!;
    const [cv, ctx] = makeCanvas(CHUNK * TW, CHUNK * TH + TH);
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const ox = (x0 - (y0 + CHUNK)) * (TW / 2), oy = (x0 + y0) * (TH / 2);
    const city = g.zone?.biome === 'city';
    for (let ty = y0; ty < y0 + CHUNK; ty++) for (let tx = x0; tx < x0 + CHUNK; tx++) {
      if (tx >= map.w || ty >= map.h) continue;
      let t = tileAt(map, tx, ty);
      if (BLOCKING.has(t) && t !== T.WATER) t = city ? T.STONE : g.zone?.biome === 'forest' ? T.FOREST : T.GRASS;
      const v = Math.floor(pnoise(tx, ty, 3) * 4);
      const s = toScreen(tx, ty);
      ctx.drawImage(groundTile(t, v), s.sx - TW / 2 - ox, s.sy - oy);
    }
    c = cv;
    this.chunks.set(key, c);
    return c;
  }

  render(g: GameClient, alpha: number, now: number) {
    const ctx = this.lctx;
    const W = this.low.width, H = this.low.height;
    ctx.fillStyle = '#0b0a12';
    ctx.fillRect(0, 0, W, H);
    this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    if (!g.map || !g.zone) return;
    if (this.chunkZone !== g.zone.id) { this.chunks.clear(); this.chunkZone = g.zone.id; }
    const me = g.selfRenderPos(alpha);
    const cs = toScreen(me.x, me.y);
    this.camX = Math.round(cs.sx - W / 2);
    this.camY = Math.round(cs.sy - H / 2);
    const camX = this.camX, camY = this.camY;
    const map = g.map;

    // visible tile bounds via screen corners
    const corners = [toWorld(camX, camY), toWorld(camX + W, camY), toWorld(camX, camY + H), toWorld(camX + W, camY + H)];
    const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x))) - 2);
    const maxX = Math.min(map.w - 1, Math.ceil(Math.max(...corners.map((c) => c.x))) + 2);
    const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y))) - 2);
    const maxY = Math.min(map.h - 1, Math.ceil(Math.max(...corners.map((c) => c.y))) + 3);

    // ground chunks
    for (let cy = Math.floor(minY / CHUNK); cy <= Math.floor(maxY / CHUNK); cy++) {
      for (let cx = Math.floor(minX / CHUNK); cx <= Math.floor(maxX / CHUNK); cx++) {
        const x0 = cx * CHUNK, y0 = cy * CHUNK;
        const ox = (x0 - (y0 + CHUNK)) * (TW / 2), oy = (x0 + y0) * (TH / 2);
        ctx.drawImage(this.chunk(g, cx, cy), ox - camX, oy - camY);
      }
    }

    const sp = (x: number, y: number) => { const s = toScreen(x, y); return { x: Math.round(s.sx - camX), y: Math.round(s.sy - camY) }; };

    // ground overlays: hazards, portals, telegraphs
    for (const hz of g.zone.hazards) this.groundEllipse(ctx, sp(hz.x, hz.y), hz.radius, hz.kind === 'mud' ? 'rgba(90,60,30,0.45)' : 'rgba(120,30,90,0.35)', true);
    for (const p of g.zone.portals) {
      const c = sp(p.x + p.w / 2, p.y + p.h / 2);
      const pulse = 0.5 + 0.5 * Math.sin(now / 250);
      this.groundEllipse(ctx, c, Math.max(p.w, p.h) * 0.6, `rgba(120,200,255,${0.25 + pulse * 0.25})`, true);
      this.groundEllipse(ctx, c, Math.max(p.w, p.h) * 0.35 * (0.8 + pulse * 0.2), 'rgba(220,250,255,0.6)', false);
    }
    for (const t of g.telegraphs) {
      const k = Math.min(1, (now - t.start) / t.dur);
      const c = sp(t.x, t.y);
      if (t.shape === 'circle') {
        this.groundEllipse(ctx, c, t.r, 'rgba(255,40,40,0.18)', true);
        this.groundEllipse(ctx, c, t.r * k, 'rgba(255,60,40,0.35)', true);
        this.groundEllipse(ctx, c, t.r, 'rgba(255,80,60,0.9)', false);
      } else this.groundArc(ctx, t.x, t.y, t.r, t.ang, t.arc, k, sp);
    }

    // click markers: move destination + selected target
    if (g.moveMarker && now - g.moveMarker.t < 600) {
      const k = (now - g.moveMarker.t) / 600;
      this.groundEllipse(ctx, sp(g.moveMarker.x, g.moveMarker.y), 0.5 * (1 - k) + 0.15, `rgba(120,230,255,${1 - k})`, false);
    }
    if (g.targetId !== null) {
      const t = g.ents.get(g.targetId);
      if (t && !t.dead) {
        const pulse = 0.55 + 0.25 * Math.sin(now / 150);
        this.groundEllipse(ctx, sp(t.x, t.y), 0.55, `rgba(255,70,60,${pulse})`, false);
        this.groundEllipse(ctx, sp(t.x, t.y), 0.62, `rgba(255,70,60,${pulse * 0.5})`, false);
      }
    }

    // collect drawables
    const list: Drawable[] = [];
    const forest = g.zone.biome === 'forest';
    for (let ty = minY; ty <= maxY; ty++) for (let tx = minX; tx <= maxX; tx++) {
      const t = tileAt(map, tx, ty);
      if (!BLOCKING.has(t) || t === T.WATER) continue;
      const c = sp(tx + 0.5, ty + 0.5);
      const v = Math.floor(pnoise(tx, ty, 9) * 6);
      if (t === T.TREE || t === T.PINE) {
        const spr = treeSprite(v, t === T.PINE, forest);
        list.push({ depth: tx + ty + 1, draw: () => ctx.drawImage(spr, c.x - spr.width / 2, c.y - spr.height + 5) });
      } else if (t === T.ROCK) {
        const spr = rockSprite(v);
        list.push({ depth: tx + ty + 1, draw: () => ctx.drawImage(spr, c.x - spr.width / 2, c.y - spr.height + 4) });
      } else if (BLOCK_STYLE[t]) {
        const spr = blockSprite(t, v % 3);
        const top = sp(tx, ty);
        list.push({ depth: tx + ty + 1, draw: () => ctx.drawImage(spr, top.x - TW / 2, top.y - BLOCK_STYLE[t].height) });
      }
    }

    const labels: (() => void)[] = [];
    for (const e of g.ents.values()) {
      if (!e.snaps.length && (e.meta.k === 1 || e.meta.k === 2)) continue;
      const c = sp(e.x, e.y);
      if (c.x < -60 || c.y < -60 || c.x > W + 60 || c.y > H + 80) continue;
      list.push({ depth: e.x + e.y, draw: () => this.drawEntity(ctx, g, e, c, now, labels) });
    }
    // self
    if (g.self) {
      const c = sp(me.x, me.y);
      list.push({ depth: me.x + me.y, draw: () => this.drawSelf(ctx, g, c, now, labels) });
    }
    for (const p of g.projectiles.values()) {
      const age = (now - p.born) / 1000;
      const x = p.x + p.vx * age, y = p.y + p.vy * age;
      const c = sp(x, y);
      list.push({ depth: x + y + 0.3, draw: () => this.drawProjectile(ctx, p.fx, c, p.r, now) });
    }
    list.sort((a, b) => a.depth - b.depth);
    for (const d of list) d.draw();

    // fx layer
    for (const f of g.fx) this.drawFx(ctx, f, sp, now, g);

    // present
    const vctx = this.view.getContext('2d')!;
    vctx.imageSmoothingEnabled = false;
    vctx.drawImage(this.low, 0, 0);

    // overlay text
    const o = this.octx;
    o.textAlign = 'center';
    o.textBaseline = 'alphabetic';
    for (const l of labels) l();
    for (const f of g.floaters) {
      const k = (now - f.start) / 1000;
      const c = sp(f.x, f.y);
      o.globalAlpha = Math.max(0, 1 - k * k);
      o.font = `${f.big ? 22 : 16}px ${FONT}`;
      o.lineWidth = 3; o.strokeStyle = '#000';
      const px = c.x * this.scale, py = (c.y - 24 - k * 18) * this.scale;
      o.strokeText(f.text, px, py);
      o.fillStyle = f.color; o.fillText(f.text, px, py);
    }
    o.globalAlpha = 1;
    for (const p of g.zone.portals) {
      const c = sp(p.x + p.w / 2, p.y + p.h / 2);
      this.label(c.x * this.scale, (c.y - 14) * this.scale, p.label, '#bfe8ff', 13);
    }
  }

  private label(x: number, y: number, text: string, color: string, size = 12) {
    const o = this.octx;
    o.font = `${size}px ${FONT}`;
    o.lineWidth = 3; o.strokeStyle = 'rgba(0,0,0,0.85)';
    o.strokeText(text, x, y);
    o.fillStyle = color; o.fillText(text, x, y);
  }

  private hpBar(x: number, y: number, w: number, pct: number, color: string) {
    const o = this.octx;
    o.fillStyle = 'rgba(0,0,0,0.7)'; o.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    o.fillStyle = '#3a1010'; o.fillRect(x - w / 2, y, w, 4);
    o.fillStyle = color; o.fillRect(x - w / 2, y, (w * Math.max(0, pct)) / 100, 4);
  }

  private groundEllipse(ctx: CanvasRenderingContext2D, c: { x: number; y: number }, r: number, color: string, fill: boolean) {
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r * (TW / 2) * Math.SQRT2, r * (TH / 2) * Math.SQRT2, 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = color; ctx.fill(); } else { ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); }
  }

  private groundArc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number, arc: number, k: number, sp: (x: number, y: number) => { x: number; y: number }) {
    const pts: { x: number; y: number }[] = [sp(x, y)];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = ang - arc / 2 + (arc * i) / n;
      pts.push(sp(x + Math.cos(a) * r, y + Math.sin(a) * r));
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,50,40,${0.15 + 0.3 * k})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,90,70,0.85)';
    ctx.stroke();
  }

  private shadow(ctx: CanvasRenderingContext2D, c: { x: number; y: number }, w: number) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, w, w / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawHumanoid(ctx: CanvasRenderingContext2D, pal: ReturnType<typeof paletteFor>, weapon: string | null, c: { x: number; y: number }, fx: number, fy: number, anim: number, flags: number, now: number, act: { until: number; id: string; x: number; y: number } | null, dead: boolean) {
    const sd = screenDir(fx, fy);
    const back = sd.dy < -0.05;
    const flip = sd.dx < 0;
    const moving = anim === ANIM.MOVE || anim === ANIM.BLOCK;
    const frame = moving ? 1 + (Math.floor(now / 140) % 2) : 0;
    this.shadow(ctx, c, 6);
    if (dead) {
      ctx.save();
      ctx.translate(c.x, c.y - 3);
      ctx.rotate(Math.PI / 2);
      const spr = characterSprite(pal, 0, false, false);
      ctx.globalAlpha = 0.7;
      ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
      ctx.restore();
      return;
    }
    const spr = characterSprite(pal, frame, back, flip);
    const bob = moving && frame === 1 ? -1 : 0;
    const dodge = anim === ANIM.DODGE;
    ctx.save();
    if (dodge) ctx.globalAlpha = 0.55;
    if (flags & FLAG.INVULN && !dodge) ctx.globalAlpha = 0.75;
    const drawWeapon = () => {
      if (!weapon) return;
      const w = weaponSprite(weapon);
      const acting = act && now < act.until;
      const base = Math.atan2(sd.dy, sd.dx);
      let rot = base - Math.PI / 4;
      if (acting) {
        const t = 1 - (act!.until - now) / 300;
        rot = base - Math.PI / 4 + (weapon === 'sword' ? -1.2 + Math.min(1, t) * 2.4 : 0);
      } else if (anim === ANIM.BLOCK) rot = base - Math.PI / 2;
      ctx.save();
      ctx.translate(c.x + (flip ? -3 : 3), c.y - 9 + bob);
      ctx.rotate(rot);
      ctx.drawImage(w, -3, -13);
      ctx.restore();
    };
    if (back) drawWeapon();
    ctx.drawImage(spr, c.x - spr.width / 2, c.y - spr.height + 1 + bob);
    if (!back) drawWeapon();
    ctx.restore();
    if (flags & FLAG.SHIELDED) {
      ctx.strokeStyle = `rgba(150,200,255,${0.6 + 0.3 * Math.sin(now / 120)})`;
      ctx.beginPath(); ctx.ellipse(c.x, c.y - 9, 10, 13, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (flags & FLAG.BLOCKING) {
      ctx.strokeStyle = 'rgba(255,240,160,0.8)';
      ctx.beginPath(); ctx.arc(c.x + sd.dx * 8, c.y - 8 + sd.dy * 8, 7, 0, Math.PI * 2); ctx.stroke();
    }
    if (flags & FLAG.STUNNED) {
      for (let i = 0; i < 3; i++) {
        const a = now / 200 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = '#ffe060';
        ctx.fillRect(Math.round(c.x + Math.cos(a) * 6), Math.round(c.y - 21 + Math.sin(a) * 2), 2, 2);
      }
    }
  }

  private drawSelf(ctx: CanvasRenderingContext2D, g: GameClient, c: { x: number; y: number }, now: number, labels: (() => void)[]) {
    const s = g.self!;
    if (!g.char) return;
    const pal = paletteFor(g.char.app);
    const moving = Math.hypot(g.input.mx, g.input.my) > 0.1;
    let anim: number = moving ? ANIM.MOVE : ANIM.IDLE;
    if (g.ms.dodgeT > 0) anim = ANIM.DODGE;
    if (g.input.buttons & 8) anim = ANIM.BLOCK;
    let flags = 0;
    if (s.shield > 0) flags |= FLAG.SHIELDED;
    if (anim === ANIM.BLOCK) flags |= FLAG.BLOCKING;
    if (s.rootT > 0) flags |= FLAG.STUNNED;
    this.drawHumanoid(ctx, pal, g.weapon?.type ?? null, c, g.facingX, g.facingY, anim, flags, now, g.localAct, s.dead);
    labels.push(() => this.label(c.x * this.scale, (c.y - 22) * this.scale, `${g.char!.name}  Lv.${g.char!.level}`, '#9fe8ff', 12));
  }

  private drawEntity(ctx: CanvasRenderingContext2D, g: GameClient, e: ClientEntity, c: { x: number; y: number }, now: number, labels: (() => void)[]) {
    const m = e.meta;
    const hovered = this.hoverId === e.id || this.interactId === e.id;
    switch (m.k) {
      case 1: {
        const fx = Math.cos(e.f), fy = Math.sin(e.f);
        const act = now < e.actUntil ? { until: e.actUntil, id: e.actId, x: e.actX, y: e.actY } : null;
        this.drawHumanoid(ctx, paletteFor(m.app), m.weapon, c, fx, fy, e.anim, e.flags, now, act, e.anim === ANIM.DEAD);
        labels.push(() => {
          this.label(c.x * this.scale, (c.y - 22) * this.scale, `${m.name}  Lv.${m.level}`, '#ffffff', 12);
          this.hpBar(c.x * this.scale, (c.y - 21) * this.scale, 40, e.hp, '#40d060');
        });
        break;
      }
      case 2: {
        const def = getMonster(m.def);
        if (!def) return;
        const sd = screenDir(Math.cos(e.f), Math.sin(e.f));
        const hurt = now < e.hurtUntil;
        const moving = e.anim === ANIM.MOVE || e.anim === ANIM.RETURN;
        const frame = moving ? Math.floor(now / 160) % 2 : e.anim === ANIM.WINDUP ? 1 : 0;
        const dead = e.anim === ANIM.DEAD || (e.dead && e.hp <= 0);
        const spr = monsterSprite(def, frame, sd.dx < 0, hurt);
        const sc = def.scale;
        const w = Math.round(spr.width * sc), h = Math.round(spr.height * sc);
        this.shadow(ctx, c, Math.max(5, w / 3));
        ctx.save();
        if (dead) ctx.globalAlpha = Math.max(0, 1 - (now - e.deadAt) / 800);
        if (e.flags & FLAG.INVULN) ctx.globalAlpha = 0.5;
        const wob = e.anim === ANIM.WINDUP ? Math.sin(now / 30) : 0;
        const hover = def.family === 'wisp' ? -6 + Math.sin(now / 200) * 2 : 0;
        ctx.drawImage(spr, Math.round(c.x - w / 2 + wob), c.y - h + 2 + hover, w, h);
        ctx.restore();
        if (!dead) labels.push(() => {
          const elite = m.tier !== 'normal';
          const y = (c.y - h - 2 + hover) * this.scale;
          if (hovered || e.hp < 100 || elite) {
            this.label(c.x * this.scale, y - 7, `${elite ? '★ ' : ''}${m.name} Lv.${m.level}`, elite ? '#ffb040' : '#ffd0d0', elite ? 13 : 11);
            this.hpBar(c.x * this.scale, y - 4, elite ? 60 : 36, e.hp, elite ? '#ff8020' : '#e04040');
          }
        });
        break;
      }
      case 3: {
        const bob = Math.round(Math.sin(now / 300 + e.id) * 1.5);
        const def = m.item === 'gold' ? null : getItem(m.item);
        const icon = def ? itemIcon(def.icon, def.color) : goldIcon();
        const rc = RARITY_INFO[(m.rarity as Rarity)] ?? RARITY_INFO.common;
        if (def && m.rarity !== 'common') {
          ctx.fillStyle = rc.color; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(now / 200);
          ctx.beginPath(); ctx.ellipse(c.x, c.y, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.drawImage(icon, c.x - icon.width / 2, c.y - icon.height + bob);
        if (hovered) labels.push(() => this.label(c.x * this.scale, (c.y - 14) * this.scale, def ? `${def.nameTh}${m.qty > 1 ? ' ×' + m.qty : ''}` : `${m.qty} Gold`, def ? rc.color : '#ffd040', 12));
        break;
      }
      case 4: {
        const pal = npcPalette(m.color, m.id);
        this.drawHumanoid(ctx, pal, null, c, 1, 1, ANIM.IDLE, 0, now, null, false);
        labels.push(() => {
          this.label(c.x * this.scale, (c.y - 22) * this.scale, m.name, '#ffe9a0', 12);
          this.label(c.x * this.scale, (c.y - 30) * this.scale, m.role === 'shop' ? '🛒' : '💬', '#fff', 14);
        });
        break;
      }
      case 5: {
        const spr = nodeSprite(m.kind, m.ready);
        ctx.drawImage(spr, c.x - spr.width / 2, c.y - spr.height + 3);
        if (hovered) labels.push(() => this.label(c.x * this.scale, (c.y - 16) * this.scale, m.ready ? (m.kind === 'herb' ? 'สมุนไพร [F]' : 'สายแร่ [F]') : 'กำลังฟื้นตัว...', '#d0ffd0', 12));
        break;
      }
    }
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, fx: string, c: { x: number; y: number }, r: number, now: number) {
    const size = Math.max(2, Math.round(r * 9));
    const colors: Record<string, [string, string]> = {
      orb_small: ['#b090ff', '#ffffff'], orb_large: ['#8060ff', '#e0d8ff'], arcane_bolt: ['#60c0ff', '#ffffff'],
      wisp_bolt: ['#fff080', '#ffffff'],
    };
    const [a, b] = colors[fx] ?? ['#ff8060', '#fff0c0'];
    const y = c.y - 9;
    ctx.fillStyle = a; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(c.x, y, size + 2 + Math.sin(now / 50), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = a; ctx.fillRect(c.x - size / 2, y - size / 2, size, size);
    ctx.fillStyle = b; ctx.fillRect(c.x - 1, y - 1, 2, 2);
    this.shadow(ctx, c, 3);
  }

  private drawFx(ctx: CanvasRenderingContext2D, f: GameClient['fx'][number], sp: (x: number, y: number) => { x: number; y: number }, now: number, g: GameClient) {
    const k = Math.min(1, (now - f.start) / f.dur);
    // follow the caster for self-centred effects
    let ox = f.x, oy = f.y;
    if (f.owner === g.selfId) { ox = g.ms.x; oy = g.ms.y; } else { const e = g.ents.get(f.owner); if (e && (f.kind === 'barrier' || f.kind === 'guard')) { ox = e.x; oy = e.y; } }
    const c = sp(ox, oy);
    const ang = Math.atan2(f.ay, f.ax);
    ctx.save();
    switch (f.kind) {
      case 'slash': case 'cleave': case 'rising': case 'bite': {
        const r = f.kind === 'cleave' ? 2.0 : f.kind === 'bite' ? 1.1 : 1.7;
        const arc = f.kind === 'cleave' ? 2.6 : 1.9;
        const col = f.kind === 'bite' ? '255,120,100' : f.kind === 'rising' ? '255,230,120' : '230,240,255';
        ctx.strokeStyle = `rgba(${col},${1 - k})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          const a = ang - arc / 2 + (arc * i) / 10 * Math.min(1, k * 2);
          const p = sp(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r);
          if (i === 0) ctx.moveTo(p.x, p.y - 8); else ctx.lineTo(p.x, p.y - 8);
        }
        ctx.stroke();
        break;
      }
      case 'rush': {
        const end = sp(f.x + f.ax * 4, f.y + f.ay * 4);
        const st = sp(f.x, f.y);
        ctx.strokeStyle = `rgba(200,230,255,${0.8 * (1 - k)})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(st.x, st.y - 8); ctx.lineTo(end.x, end.y - 8); ctx.stroke();
        break;
      }
      case 'wave': case 'slam': {
        const r = (f.kind === 'wave' ? 2.6 : 2.2) * k;
        this.groundEllipse(ctx, c, r, `rgba(${f.kind === 'wave' ? '140,170,255' : '255,140,90'},${0.8 * (1 - k)})`, false);
        this.groundEllipse(ctx, c, r, `rgba(${f.kind === 'wave' ? '140,170,255' : '255,140,90'},${0.2 * (1 - k)})`, true);
        break;
      }
      case 'barrier': {
        ctx.strokeStyle = `rgba(160,210,255,${1 - k})`;
        ctx.beginPath(); ctx.ellipse(c.x, c.y - 9, 10 + k * 4, 13 + k * 4, 0, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'guard': {
        ctx.strokeStyle = `rgba(255,240,150,${0.9 - k * 0.6})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(c.x, c.y - 9, 9, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'counter': {
        this.groundEllipse(ctx, c, 2.6 * k, `rgba(140,230,255,${1 - k})`, false);
        break;
      }
      case 'cast': {
        ctx.fillStyle = `rgba(190,160,255,${1 - k})`;
        const p = sp(f.x + f.ax * 0.6, f.y + f.ay * 0.6);
        ctx.beginPath(); ctx.arc(p.x, p.y - 9, 2 + k * 4, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'burst': {
        ctx.fillStyle = `rgba(255,255,255,${1 - k})`;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.fillRect(Math.round(c.x + Math.cos(a) * k * 6), Math.round(c.y - 9 + Math.sin(a) * k * 4), 1, 1);
        }
        break;
      }
      case 'dodge': {
        ctx.fillStyle = `rgba(255,255,255,${0.4 * (1 - k)})`;
        for (let i = 0; i < 4; i++) ctx.fillRect(c.x - 6 + i * 4, c.y - 2 - i, 2, 1);
        break;
      }
      case 'levelup': {
        ctx.fillStyle = `rgba(255,230,100,${1 - k})`;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + k * 2;
          ctx.fillRect(Math.round(c.x + Math.cos(a) * 10), Math.round(c.y - 8 - k * 20 + Math.sin(a) * 4), 2, 2);
        }
        break;
      }
    }
    ctx.restore();
  }

  /** Entity under a screen point (CSS px), using sprite-sized boxes; front-most wins. */
  pick(g: GameClient, px: number, py: number): number | null {
    const lx = px / this.scale + this.camX, ly = py / this.scale + this.camY;
    let best: number | null = null, bestDepth = -Infinity;
    for (const e of g.ents.values()) {
      const m = e.meta;
      if ((m.k === 1 || m.k === 2) && (!e.snaps.length || e.dead)) continue;
      const s = toScreen(e.x, e.y);
      let hw = 8, top = 22, bottom = 3;
      if (m.k === 2) { const def = getMonster(m.def); const sc = def?.scale ?? 1; hw = 9 * sc; top = (def?.family === 'sapling' ? 22 : def?.family === 'wisp' ? 20 : 15) * sc; }
      else if (m.k === 3) { hw = 7; top = 12; }
      else if (m.k === 5) { hw = 9; top = 14; }
      if (lx < s.sx - hw || lx > s.sx + hw || ly < s.sy - top || ly > s.sy + bottom) continue;
      const depth = e.x + e.y + (m.k === 3 ? 0.5 : 0); // drops win over the ground they lie on
      if (depth > bestDepth) { bestDepth = depth; best = e.id; }
    }
    return best;
  }

  /** Minimap image of the current zone (one pixel per tile). */
  minimap(g: GameClient): HTMLCanvasElement | null {
    if (!g.map) return null;
    const map = g.map;
    const [c, ctx] = makeCanvas(map.w, map.h);
    const img = ctx.createImageData(map.w, map.h);
    const col: Record<number, [number, number, number]> = {
      [T.GRASS]: [79, 154, 60], [T.GRASS2]: [70, 141, 54], [T.DIRT]: [160, 122, 74], [T.STONE]: [150, 150, 156], [T.WATER]: [47, 109, 181],
      [T.TREE]: [34, 90, 34], [T.PINE]: [26, 74, 34], [T.ROCK]: [120, 120, 130], [T.WALL]: [90, 90, 100], [T.FLOWERS]: [100, 170, 70],
      [T.HOUSE]: [176, 74, 58], [T.ROOF_SHOP]: [58, 106, 176], [T.ROOF_SMITH]: [74, 74, 82], [T.ROOF_HALL]: [122, 74, 176], [T.SAND]: [216, 196, 135],
      [T.FOREST]: [47, 106, 50], [T.BUSH]: [61, 127, 48], [T.FOUNTAIN]: [74, 154, 224],
    };
    for (let i = 0; i < map.tiles.length; i++) {
      const cc = col[map.tiles[i]] ?? [0, 0, 0];
      img.data[i * 4] = cc[0]; img.data[i * 4 + 1] = cc[1]; img.data[i * 4 + 2] = cc[2]; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
}
