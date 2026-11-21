import Phaser from 'phaser';
import { CONTENT } from '../core/content';
import { DIR8, type Dir8 } from '../core/direction';
import type { HotbarAction } from '../core/hotbar';
import type { Vec2 } from '../core/math';
import type { ActionRequest, ActionSlot, SimEvent } from '../core/simulation';
import type { MonsterView, OtherPlayerView, WorldSource } from '../core/worldSource';
import {
  hudStore,
  onCommand,
  pushLog,
  REJECT_TEXT,
  runtimeErrors,
  showToast,
  type HudSnapshot,
  type SlotCooldown,
} from './bridge';
import { KeyboardInput } from './input';
import { computePhase1Gate } from './phaseGate';
import {
  createPlayerSheet,
  createSlimeSheet,
  createSwordTexture,
  createTilesheet,
  createWolfSheet,
  PLAYER_COL_COUNT,
  PLAYER_COLS,
  PLAYER_FRAME,
  SLIME_COLS,
  SLIME_FRAME,
  TILE,
  WOLF_COLS,
  WOLF_FRAME,
} from './textures';

const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5;
const HUD_INTERVAL_MS = 100;
const LOGICAL_W = 640;
const LOGICAL_H = 360;

const ACTION_TO_SLOT: Partial<Record<HotbarAction, ActionSlot>> = {
  basic: 'basic',
  skill1: 'skill1',
  skill2: 'skill2',
  skill3: 'skill3',
};

export const computeZoom = (w: number, h: number): number =>
  Math.max(1, Math.min(6, Math.round(Math.min(w / LOGICAL_W, h / LOGICAL_H))));

interface MonsterSprites {
  sprite: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  lastAi: string;
}

export class WorldScene extends Phaser.Scene {
  sim!: WorldSource;
  private keys!: KeyboardInput;
  private player!: Phaser.GameObjects.Sprite;
  private sword!: Phaser.GameObjects.Image;
  private monsterViews = new Map<string, MonsterSprites>();
  private otherViews = new Map<
    string,
    { sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; hpBar: Phaser.GameObjects.Graphics }
  >();
  private debugGfx!: Phaser.GameObjects.Graphics;
  private collisionGfx!: Phaser.GameObjects.Graphics;
  private debug = false;
  private reducedEffects = false;
  private accumulator = 0;
  private hudTimer = 0;
  private pendingAim: Vec2 | null = null;
  private pendingActions: ActionRequest[] = [];
  readonly facingsSeen = new Set<Dir8>();
  private actionNames = new Map<string, string>();
  private unsub: Array<() => void> = [];
  private lastSwing: { origin: Vec2; angle: number; radius: number; arcDeg: number; at: number } | null =
    null;

  constructor() {
    super('world');
  }

  init(data: { world: WorldSource }): void {
    this.sim = data.world;
  }

  create(): void {
    const weapon = this.sim.weapon;
    this.actionNames.set('sword_basic', 'Basic Attack');
    for (const s of weapon.skills) this.actionNames.set(s.id, s.name);

    this.registerTextures();
    this.buildMap();
    this.createPlayer();
    for (const m of this.sim.monsters) this.createMonsterView(m);

    this.debugGfx = this.add.graphics().setDepth(20000);
    this.collisionGfx = this.add.graphics().setDepth(19999).setVisible(false);
    this.drawCollision();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.sim.grid.pixelWidth, this.sim.grid.pixelHeight);
    cam.setRoundPixels(true);
    cam.startFollow(this.player, true, 0.2, 0.2);
    cam.setZoom(computeZoom(this.scale.width, this.scale.height));
    this.scale.on('resize', (size: Phaser.Structs.Size) => cam.setZoom(computeZoom(size.width, size.height)));

    this.keys = new KeyboardInput();
    this.keys.onToggleDebug = () => this.toggleDebug();
    this.keys.onFocusChat = () => document.getElementById('chat-input')?.focus();

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.leftButtonDown()) return;
      this.pendingAim = { x: p.worldX, y: p.worldY };
      this.pendingActions.push({ type: 'attack', slot: 'basic' });
    });

    this.unsub.push(
      onCommand((c) => {
        if (c.type === 'hotbar') this.keys.queue(c.action);
        else if (c.type === 'toggleDebug') this.toggleDebug();
        else if (c.type === 'setInputEnabled') this.keys.setEnabled(c.enabled);
        else if (c.type === 'setReducedEffects') this.reducedEffects = c.value;
      }),
    );

    this.game.events.on(Phaser.Core.Events.HIDDEN, () => {
      pushLog('system', 'แท็บถูกซ่อน — หยุดเกมชั่วคราว (ไม่มีการฟาร์มเบื้องหลัง)', 'warn');
    });
    this.game.events.on(Phaser.Core.Events.VISIBLE, () => {
      this.accumulator = 0; // never fast-forward simulated time after the tab returns
      pushLog('system', 'กลับมาที่แท็บ — เล่นต่อ', 'normal');
    });
    this.game.canvas.addEventListener('webglcontextlost', () =>
      pushLog('system', 'WebGL context lost — กำลังรอกู้คืน', 'warn'),
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.keys.destroy();
      this.unsub.forEach((u) => u());
    });

    pushLog(
      'system',
      this.sim.mode === 'online'
        ? 'ยินดีต้อนรับสู่ THE POWER: ECLIPSE — Phase 2 Online Test World'
        : 'ยินดีต้อนรับสู่ THE POWER: ECLIPSE — Phase 1 Sandbox (ออฟไลน์ ไม่บันทึกข้อมูล)',
      'good',
    );
    pushLog(
      'system',
      'WASD/ลูกศร เดิน · 1 หรือคลิกซ้าย = Basic · 2/3/4 = สกิลดาบ · Space/E = Dodge · T = Potion · F3 = Debug',
    );

    // QA hook for automated browser tests. Single-player prototype only — removed/gated once the
    // authoritative server lands in Phase 2 (client must never be a source of truth).
    (window as unknown as { __TPE__: unknown }).__TPE__ = {
      sim: this.sim,
      facings: this.facingsSeen,
      gate: () => computePhase1Gate(this.sim.telemetry, this.facingsSeen, runtimeErrors.count),
      zoom: () => this.cameras.main.zoom,
    };
    this.pushHud();
  }

  /* --------------------------------------------------------------- setup */

  private registerTextures(): void {
    const sheet = (key: string, canvas: HTMLCanvasElement, fw: number, fh: number) => {
      if (this.textures.exists(key)) return;
      const tex = this.textures.addCanvas(key, canvas);
      if (!tex) return;
      const cols = canvas.width / fw;
      const rows = canvas.height / fh;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) tex.add(r * cols + c, 0, c * fw, r * fh, fw, fh);
    };
    sheet('player', createPlayerSheet(), PLAYER_FRAME.w, PLAYER_FRAME.h);
    sheet('slime', createSlimeSheet(), SLIME_FRAME.w, SLIME_FRAME.h);
    sheet('wolf', createWolfSheet(), WOLF_FRAME.w, WOLF_FRAME.h);
    if (!this.textures.exists('tiles')) this.textures.addCanvas('tiles', createTilesheet());
    if (!this.textures.exists('sword')) this.textures.addCanvas('sword', createSwordTexture());

    const pf = (row: number, col: number) => ({ key: 'player', frame: row * PLAYER_COL_COUNT + col });
    DIR8.forEach((d, row) => {
      this.anims.create({
        key: `p-idle-${d}`,
        frames: [pf(row, PLAYER_COLS.idle0), pf(row, PLAYER_COLS.idle1)],
        frameRate: 2,
        repeat: -1,
      });
      this.anims.create({
        key: `p-walk-${d}`,
        frames: [PLAYER_COLS.walk0, PLAYER_COLS.walk1, PLAYER_COLS.walk2, PLAYER_COLS.walk3].map((c) =>
          pf(row, c),
        ),
        frameRate: 9,
        repeat: -1,
      });
    });
    this.anims.create({
      key: 'slime-idle',
      frames: [
        { key: 'slime', frame: SLIME_COLS.idle0 },
        { key: 'slime', frame: SLIME_COLS.idle1 },
      ],
      frameRate: 3,
      repeat: -1,
    });
    this.anims.create({
      key: 'wolf-idle',
      frames: [{ key: 'wolf', frame: WOLF_COLS.idle0 }],
      frameRate: 1,
      repeat: -1,
    });
    this.anims.create({
      key: 'wolf-run',
      frames: [WOLF_COLS.run0, WOLF_COLS.idle0, WOLF_COLS.run1, WOLF_COLS.idle0].map((f) => ({
        key: 'wolf',
        frame: f,
      })),
      frameRate: 10,
      repeat: -1,
    });
  }

  private buildMap(): void {
    const m = CONTENT.trainingMap;
    const rows: number[][] = [];
    for (let y = 0; y < m.height; y++) rows.push(m.ground.slice(y * m.width, (y + 1) * m.width));
    const map = this.make.tilemap({ data: rows, tileWidth: TILE, tileHeight: TILE });
    const tiles = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);
    if (tiles) map.createLayer(0, tiles, 0, 0)?.setDepth(-10);
  }

  private createPlayer(): void {
    const p = this.sim.player;
    this.player = this.add.sprite(p.pos.x, p.pos.y, 'player', 0).setOrigin(0.5, 26 / 32);
    this.player.play('p-idle-S');
    this.sword = this.add.image(p.pos.x, p.pos.y, 'sword').setOrigin(0.5, 1).setVisible(false);
  }

  private createMonsterView(m: MonsterView): void {
    const key = m.def.sprite;
    const sprite = this.add.sprite(m.pos.x, m.pos.y, key, 0).setOrigin(0.5, 0.8);
    sprite.play(key === 'slime' ? 'slime-idle' : 'wolf-idle');
    const hpBar = this.add.graphics();
    const label = this.add
      .text(m.pos.x, m.pos.y, `Lv.${m.def.level} ${m.def.name}`, {
        fontFamily: 'monospace',
        fontSize: '6px',
        color: '#ffe9a8',
        stroke: '#140a1e',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setResolution(4)
      .setVisible(false);
    const statusText = this.add
      .text(m.pos.x, m.pos.y, '', {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: '#ff9b5c',
        stroke: '#140a1e',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setResolution(4);
    this.monsterViews.set(m.id, { sprite, hpBar, label, statusText, lastAi: '' });
  }

  private drawCollision(): void {
    const g = this.collisionGfx;
    g.clear();
    g.fillStyle(0xff2050, 0.28);
    const grid = this.sim.grid;
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++)
        if (grid.isSolidTile(x, y)) g.fillRect(x * TILE, y * TILE, TILE, TILE);
  }

  toggleDebug(): void {
    this.debug = !this.debug;
    this.collisionGfx.setVisible(this.debug);
    if (!this.debug) {
      this.debugGfx.clear();
      for (const v of this.monsterViews.values()) v.label.setVisible(false);
    }
    pushLog('system', `Debug overlay ${this.debug ? 'เปิด' : 'ปิด'} (QA/dev เท่านั้น)`);
    this.pushHud();
  }

  /* ---------------------------------------------------------------- loop */

  override update(_time: number, delta: number): void {
    this.accumulator += Math.min(delta, 250);
    let steps = 0;
    let first = true;
    while (this.accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      const actions: ActionRequest[] = [];
      let aim: Vec2 | null = null;
      if (first) {
        for (const a of this.keys.drainPressed()) this.mapHotbar(a, actions);
        actions.push(...this.pendingActions);
        aim = this.pendingAim;
        this.pendingActions = [];
        this.pendingAim = null;
        first = false;
      }
      const move = this.keys.moveVector();
      this.sim.step(STEP_MS, { move, aim, actions });
      if (this.sim.player.moving) this.facingsSeen.add(this.sim.player.facing);
      this.accumulator -= STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;

    for (const e of this.sim.drainEvents()) this.handleEvent(e);
    this.syncPlayer();
    this.syncMonsters();
    this.syncOthers();
    if (this.debug) this.drawDebug();

    this.hudTimer += delta;
    if (this.hudTimer >= HUD_INTERVAL_MS) {
      this.hudTimer = 0;
      this.pushHud();
    }
  }

  private mapHotbar(a: HotbarAction, out: ActionRequest[]): void {
    const slot = ACTION_TO_SLOT[a];
    if (slot) out.push({ type: 'attack', slot });
    else if (a === 'dodge') out.push({ type: 'dash' });
    else if (a === 'hpPotion') {
      if (this.sim.usePotion) this.sim.usePotion();
      else showToast('HP Potion ใช้ได้ในโหมดออนไลน์ (กระเป๋าอยู่บน server)');
    } else showToast('ช่องนี้จะปลดล็อกใน Phase ถัดไป');
  }

  /* -------------------------------------------------------------- events */

  private handleEvent(e: SimEvent): void {
    switch (e.type) {
      case 'damage': {
        const other = this.otherViews.get(e.targetId);
        if (other) {
          this.floatText(e.pos.x, e.pos.y - 14, `${e.amount}`, '#ff9aa5', 8);
          this.flash(other.sprite);
          break;
        }
        if (e.sourceId !== 'player' && e.targetId !== 'player' && this.sim.mode === 'online') {
          // another player's hit on a monster: show the number, keep our combat log focused on us
          this.floatText(e.pos.x, e.pos.y - 14, `${e.amount}`, '#c9c3e0', 8);
          this.flash(this.monsterViews.get(e.targetId)?.sprite);
          break;
        }
        const toPlayer = e.targetId === 'player';
        this.floatText(
          e.pos.x,
          e.pos.y - 14,
          e.isCrit ? `${e.amount}!` : `${e.amount}`,
          toPlayer ? '#ff5a6a' : e.isCrit ? '#ffd24a' : '#ffffff',
          e.isCrit ? 12 : 9,
        );
        this.flash(toPlayer ? this.player : this.monsterViews.get(e.targetId)?.sprite);
        if (toPlayer) {
          if (!this.reducedEffects) this.cameras.main.shake(90, 0.004);
          const src = this.sim.getMonster(e.sourceId);
          pushLog(
            'combat',
            `${src?.def.name ?? e.sourceId} โจมตีคุณ ${e.amount}${e.isCrit ? ' (คริติคอล)' : ''}`,
            'bad',
          );
        } else {
          const t = this.sim.getMonster(e.targetId);
          pushLog(
            'combat',
            `${this.actionNames.get(e.actionId) ?? e.actionId} → ${t?.def.name ?? e.targetId} ${e.amount}${e.isCrit ? ' CRITICAL' : ''}`,
            e.isCrit ? 'crit' : 'normal',
          );
        }
        break;
      }
      case 'heal':
        if (e.targetId === 'player') {
          this.floatText(e.pos.x, e.pos.y - 16, `+${e.amount}`, '#7dffa8', 10);
          pushLog('combat', `ใช้ HP Potion ฟื้นฟู ${e.amount} HP`, 'good');
        }
        break;
      case 'evade':
        this.floatText(
          e.pos.x,
          e.pos.y - 14,
          e.reason === 'dash' ? 'DODGE' : e.reason === 'reset' ? 'EVADE' : 'IMMUNE',
          '#9fe8ff',
          8,
        );
        break;
      case 'swing':
        this.slashVfx(
          e.origin,
          e.angle,
          e.radius,
          e.arcDeg,
          e.actionId === 'sword_counter_slash'
            ? 0xffd24a
            : e.actionId === 'sword_guard_break'
              ? 0xff8a3c
              : 0xd8f4ff,
        );
        this.lastSwing = {
          origin: e.origin,
          angle: e.angle,
          radius: e.radius,
          arcDeg: e.arcDeg,
          at: this.time.now,
        };
        break;
      case 'dash':
        this.dashVfx();
        break;
      case 'rejected':
        showToast(`${REJECT_TEXT[e.reason]}`);
        break;
      case 'status':
        if (e.statusId === 'guard_break')
          pushLog('combat', `Guard Break! เกราะเป้าหมายลดลง 50% (${e.durationMs / 1000} วิ)`, 'good');
        break;
      case 'counter':
        this.floatText(e.pos.x, e.pos.y - 22, 'COUNTER!', '#ffd24a', 10);
        pushLog('combat', 'Counter Slash สำเร็จ! ปัดป้องและสวนกลับ', 'good');
        break;
      case 'interrupt':
        pushLog('combat', 'ขัดจังหวะท่าโจมตีของศัตรู!', 'good');
        break;
      case 'monster-windup':
        this.telegraph(e.pos, e.radius, e.windupMs);
        break;
      case 'death':
        if (e.entityId === 'player') {
          pushLog('system', 'คุณเสียชีวิต — จะเกิดใหม่ที่จุดเกิดในไม่กี่วินาที', 'bad');
          this.player.setFrame(DIR8.indexOf(this.sim.player.facing) * PLAYER_COL_COUNT + PLAYER_COLS.dead);
        } else if (this.otherViews.has(e.entityId)) {
          const o = this.sim.others.find((x) => x.id === e.entityId);
          pushLog('system', `${o?.name ?? 'ผู้เล่น'} เสียชีวิต`, 'warn');
        } else {
          const m = this.sim.getMonster(e.entityId);
          if (e.killerId === 'player') pushLog('combat', `กำจัด ${m?.def.name ?? e.entityId} สำเร็จ`, 'good');
          this.puff(e.pos, m?.def.sprite === 'slime' ? 0x6fe07f : 0xb0b6c6);
        }
        break;
      case 'respawn':
        if (e.entityId === 'player') pushLog('system', 'เกิดใหม่แล้ว (ป้องกันการโจมตี 2 วินาที)', 'good');
        else {
          const v = this.monsterViews.get(e.entityId);
          if (v) {
            v.sprite.setAlpha(0);
            this.tweens.add({ targets: v.sprite, alpha: 1, duration: 400 });
          }
        }
        break;
      default:
        break;
    }
  }

  /* ----------------------------------------------------------------- vfx */

  private floatText(x: number, y: number, text: string, color: string, size: number): void {
    const t = this.add
      .text(x, y, text, {
        fontFamily: 'monospace',
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color,
        stroke: '#120818',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setResolution(4)
      .setDepth(30000);
    this.tweens.add({
      targets: t,
      y: y - 18,
      alpha: 0,
      duration: 750,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private flash(sprite: Phaser.GameObjects.Sprite | undefined): void {
    if (!sprite) return;
    sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => sprite.clearTint());
  }

  private slashVfx(origin: Vec2, angle: number, radius: number, arcDeg: number, color: number): void {
    const g = this.add.graphics().setDepth(origin.y + 5);
    const half = (arcDeg * Math.PI) / 360;
    g.fillStyle(color, this.reducedEffects ? 0.25 : 0.55);
    g.slice(origin.x, origin.y - 4, radius, angle - half, angle + half, false);
    g.fillPath();
    g.lineStyle(1, 0xffffff, 0.9);
    g.beginPath();
    g.arc(origin.x, origin.y - 4, radius, angle - half, angle + half, false);
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 170, onComplete: () => g.destroy() });
  }

  private telegraph(pos: Vec2, radius: number, ms: number): void {
    const g = this.add.graphics().setDepth(pos.y - 1);
    const state = { r: 2 };
    this.tweens.add({
      targets: state,
      r: radius,
      duration: ms,
      onUpdate: () => {
        g.clear();
        g.lineStyle(1, 0xff3048, 0.9);
        g.strokeCircle(pos.x, pos.y, radius);
        g.fillStyle(0xff3048, 0.22);
        g.fillCircle(pos.x, pos.y, state.r);
      },
      onComplete: () => g.destroy(),
    });
  }

  private dashVfx(): void {
    if (this.reducedEffects) return;
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 45, () => {
        const ghost = this.add
          .sprite(this.player.x, this.player.y, 'player', this.player.frame.name)
          .setOrigin(0.5, 26 / 32)
          .setTintFill(0x9b6cff)
          .setAlpha(0.5)
          .setDepth(this.player.depth - 1);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
      });
    }
  }

  private puff(pos: Vec2, color: number): void {
    const n = this.reducedEffects ? 3 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = this.add.circle(pos.x, pos.y - 4, 2, color, 0.9).setDepth(pos.y + 1);
      this.tweens.add({
        targets: c,
        x: pos.x + Math.cos(a) * 12,
        y: pos.y - 4 + Math.sin(a) * 8,
        alpha: 0,
        duration: 400,
        onComplete: () => c.destroy(),
      });
    }
  }

  /* ---------------------------------------------------------------- sync */

  private syncPlayer(): void {
    const p = this.sim.player;
    this.player.setPosition(p.pos.x, p.pos.y).setDepth(p.pos.y);
    const blink = this.sim.time < p.invulnerableUntil && !p.dash && Math.floor(this.sim.time / 100) % 2 === 0;
    this.player.setAlpha(blink ? 0.5 : 1);
    if (p.charState === 'DEAD') {
      this.player.anims.stop();
      this.sword.setVisible(false);
      return;
    }
    const walking = p.moving || !!p.dash;
    const key = `${walking ? 'p-walk' : 'p-idle'}-${p.facing}`;
    if (this.player.anims.currentAnim?.key !== key) this.player.play(key);

    const a = p.action;
    if (a) {
      const elapsed = this.sim.time - a.startedAt;
      const half = ((a.def.hits?.[0]?.arcDeg ?? a.def.counter?.arcDeg ?? 90) * Math.PI) / 360;
      let ang: number;
      if (a.def.counter && p.combatState === 'counter')
        ang = a.angle - Math.PI / 2; // guard pose
      else {
        const hits = a.def.hits ?? [];
        // swing from -half to +half around each hit time
        let t = 1;
        for (const h of hits) {
          if (elapsed <= h.atMs + 60) {
            t = Math.min(1, Math.max(0, (elapsed - (h.atMs - 60)) / 120));
            break;
          }
        }
        ang = a.angle - half + t * half * 2;
      }
      this.sword
        .setVisible(true)
        .setPosition(p.pos.x + Math.cos(a.angle) * 3, p.pos.y - 8 + Math.sin(a.angle) * 3)
        .setRotation(ang + Math.PI / 2)
        .setDepth(p.pos.y + (Math.sin(a.angle) > -0.2 ? 1 : -1))
        .setTint(p.combatState === 'counter' ? 0xffd24a : 0xffffff);
    } else this.sword.setVisible(false);
  }

  private syncMonsters(): void {
    const now = this.sim.time;
    for (const m of this.sim.monsters) {
      const v = this.monsterViews.get(m.id);
      if (!v) continue;
      const { sprite, hpBar, label, statusText } = v;
      sprite.setPosition(m.pos.x, m.pos.y).setDepth(m.pos.y);
      if (m.ai === 'DEAD') {
        const corpse = now - m.diedAt < m.def.corpseMs;
        sprite.anims.stop();
        sprite.setFrame(m.def.sprite === 'slime' ? SLIME_COLS.dead : WOLF_COLS.dead);
        sprite.setAlpha(corpse ? 1 - (now - m.diedAt) / m.def.corpseMs : 0);
        hpBar.clear();
        statusText.setText('');
        label.setVisible(false);
        v.lastAi = 'DEAD';
        continue;
      }
      sprite.setFlipX(m.def.sprite === 'wolf' ? m.facingX < 0 : false);
      if (m.ai !== v.lastAi || (m.ai !== 'ATTACK' && !sprite.anims.isPlaying)) {
        if (m.ai === 'ATTACK') {
          sprite.anims.stop();
          sprite.setFrame(m.def.sprite === 'slime' ? SLIME_COLS.windup : WOLF_COLS.windup);
        } else if (m.def.sprite === 'slime') sprite.play('slime-idle', true);
        else
          sprite.play(
            m.ai === 'CHASE' || m.ai === 'PATROL' || m.ai === 'RESET' ? 'wolf-run' : 'wolf-idle',
            true,
          );
        v.lastAi = m.ai;
      }
      if (m.ai === 'ATTACK' && now - m.attackStartedAt >= m.def.attackWindupMs)
        sprite.setFrame(m.def.sprite === 'slime' ? SLIME_COLS.idle1 : WOLF_COLS.run1);

      // HP bar (shown when damaged or targeted)
      hpBar.clear();
      const targeted = this.sim.targetId === m.id;
      const top = m.pos.y - sprite.displayHeight * 0.8 - 3;
      if (m.hp < m.def.maxHp || targeted) {
        const w = 18;
        hpBar.setDepth(m.pos.y + 2);
        hpBar.fillStyle(0x140a1e, 0.9).fillRect(m.pos.x - w / 2 - 1, top - 1, w + 2, 4);
        hpBar.fillStyle(0xd23a4c, 1).fillRect(m.pos.x - w / 2, top, Math.max(0, (m.hp / m.def.maxHp) * w), 2);
      }
      if (m.ai === 'ALERT') statusText.setText('!').setColor('#ffd24a');
      else if (m.statuses.some((s) => s.id === 'guard_break'))
        statusText.setText('GUARD BREAK').setColor('#ff9b5c');
      else if (m.ai === 'RESET') statusText.setText('RESET').setColor('#9fe8ff');
      else statusText.setText('');
      statusText.setPosition(m.pos.x, top - 2).setDepth(29000);
      label
        .setVisible(targeted || this.debug)
        .setText(this.debug ? `${m.def.name} [${m.ai}]` : `Lv.${m.def.level} ${m.def.name}`)
        .setPosition(m.pos.x, top - (statusText.text ? 9 : 2))
        .setDepth(29000);
    }
  }

  private syncOthers(): void {
    const seen = new Set<string>();
    for (const o of this.sim.others) {
      seen.add(o.id);
      let v = this.otherViews.get(o.id);
      if (!v) {
        v = {
          sprite: this.add
            .sprite(o.pos.x, o.pos.y, 'player', 0)
            .setOrigin(0.5, 26 / 32)
            .setTint(0xd9d2ff),
          label: this.add
            .text(o.pos.x, o.pos.y, '', {
              fontFamily: 'monospace',
              fontSize: '6px',
              color: '#bfe6ff',
              stroke: '#140a1e',
              strokeThickness: 2,
            })
            .setOrigin(0.5, 1)
            .setResolution(4),
          hpBar: this.add.graphics(),
        };
        this.otherViews.set(o.id, v);
      }
      this.syncOther(o, v);
    }
    for (const [id, v] of this.otherViews)
      if (!seen.has(id)) {
        v.sprite.destroy();
        v.label.destroy();
        v.hpBar.destroy();
        this.otherViews.delete(id);
      }
  }

  private syncOther(
    o: OtherPlayerView,
    v: {
      sprite: Phaser.GameObjects.Sprite;
      label: Phaser.GameObjects.Text;
      hpBar: Phaser.GameObjects.Graphics;
    },
  ): void {
    v.sprite
      .setPosition(o.pos.x, o.pos.y)
      .setDepth(o.pos.y)
      .setAlpha(o.connected ? 1 : 0.45);
    if (o.charState === 'DEAD') {
      v.sprite.anims.stop();
      v.sprite.setFrame(DIR8.indexOf(o.facing) * PLAYER_COL_COUNT + PLAYER_COLS.dead);
    } else {
      const key = `${o.moving || o.dashing ? 'p-walk' : 'p-idle'}-${o.facing}`;
      if (v.sprite.anims.currentAnim?.key !== key) v.sprite.play(key);
    }
    const top = o.pos.y - 30;
    v.label
      .setText(`Lv.${o.level} ${o.name}${o.connected ? '' : ' (หลุด)'}`)
      .setPosition(o.pos.x, top - 3)
      .setDepth(29000);
    v.hpBar.clear().setDepth(o.pos.y + 2);
    v.hpBar.fillStyle(0x140a1e, 0.9).fillRect(o.pos.x - 10, top - 1, 20, 3);
    v.hpBar
      .fillStyle(0x4ad27a, 1)
      .fillRect(o.pos.x - 9, top, Math.max(0, (o.hp / Math.max(1, o.maxHp)) * 18), 1);
  }

  private drawDebug(): void {
    const g = this.debugGfx;
    g.clear();
    const p = this.sim.player;
    g.lineStyle(1, 0x37ff8b, 1).strokeCircle(p.pos.x, p.pos.y, p.base.radius);
    g.lineStyle(1, 0x37ff8b, 0.5).strokeRect(
      p.pos.x - p.base.radius,
      p.pos.y - p.base.radius,
      p.base.radius * 2,
      p.base.radius * 2,
    );
    for (const m of this.sim.monsters) {
      if (!m.alive) continue;
      g.lineStyle(1, 0xffe14a, 0.35).strokeCircle(m.pos.x, m.pos.y, m.def.aggroRadius);
      g.lineStyle(1, 0xff3048, 0.6).strokeCircle(
        m.pos.x,
        m.pos.y,
        m.def.attackRange + m.def.radius + p.base.radius,
      );
      g.lineStyle(1, 0x5cc8ff, 0.9).strokeCircle(m.pos.x, m.pos.y, m.def.radius);
      g.lineStyle(1, 0x9b6cff, 0.25).strokeCircle(m.spawn.x, m.spawn.y, m.def.leashRadius);
    }
    const s = this.lastSwing;
    if (s && this.time.now - s.at < 400) {
      const half = (s.arcDeg * Math.PI) / 360;
      g.lineStyle(1, 0xff4af0, 1);
      g.beginPath();
      g.slice(s.origin.x, s.origin.y, s.radius, s.angle - half, s.angle + half, false);
      g.strokePath();
    }
  }

  /* ----------------------------------------------------------------- hud */

  private pushHud(): void {
    const sim = this.sim;
    const p = sim.player;
    const now = sim.time;
    const cd = (id: string): SlotCooldown => ({
      remainingMs: p.cooldowns.remaining(id, now),
      fraction: p.cooldowns.fraction(id, now),
    });
    const defs = {
      basic: sim.getActionDef('basic'),
      skill1: sim.getActionDef('skill1'),
      skill2: sim.getActionDef('skill2'),
      skill3: sim.getActionDef('skill3'),
    };
    const t = sim.getMonster(sim.targetId);
    const snapshot: HudSnapshot = {
      ready: true,
      playerName: p.name,
      level: p.base.level,
      hp: Math.ceil(p.hp),
      maxHp: p.maxHp,
      stamina: Math.floor(p.stamina.current),
      maxStamina: p.stamina.max,
      charState: p.charState,
      combatState: p.combatState,
      cooldowns: {
        basic: cd(defs.basic.id),
        skill1: cd(defs.skill1.id),
        skill2: cd(defs.skill2.id),
        skill3: cd(defs.skill3.id),
        dodge: cd('dash'),
      },
      staminaCosts: {
        skill1: defs.skill1.staminaCost,
        skill2: defs.skill2.staminaCost,
        skill3: defs.skill3.staminaCost,
        dodge: p.base.dash.staminaCost,
      },
      skillNames: {
        basic: defs.basic.name,
        skill1: defs.skill1.name,
        skill2: defs.skill2.name,
        skill3: defs.skill3.name,
        dodge: 'Dodge',
      },
      target:
        t && t.alive
          ? {
              id: t.id,
              name: t.def.name,
              level: t.def.level,
              hp: t.hp,
              maxHp: t.def.maxHp,
              ai: t.ai,
              statuses: t.statuses.map((s) => s.id),
            }
          : null,
      respawnInMs: p.charState === 'DEAD' ? Math.max(0, p.respawnAt - now) : 0,
      deathRecap: p.lastDeathRecap,
      mapName: CONTENT.trainingMap.displayName,
      mapSize: { w: sim.grid.pixelWidth, h: sim.grid.pixelHeight },
      minimap: [
        ...sim.monsters.map((m) => ({
          x: m.pos.x,
          y: m.pos.y,
          kind: m.alive ? ('monster' as const) : ('dead' as const),
        })),
        ...sim.others.map((o) => ({ x: o.pos.x, y: o.pos.y, kind: 'other' as const })),
        { x: p.pos.x, y: p.pos.y, kind: 'player' as const },
      ],
      gate: computePhase1Gate(sim.telemetry, this.facingsSeen, runtimeErrors.count),
      mode: sim.mode,
      online: sim.online ? { ...sim.online, items: [...sim.online.items] } : null,
      othersCount: sim.others.length,
      fps: Math.round(this.game.loop.actualFps),
      debug: this.debug,
      invulnerable: now < p.invulnerableUntil,
    };
    hudStore.set(snapshot);
  }
}
