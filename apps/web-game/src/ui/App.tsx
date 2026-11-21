import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { CONTENT } from '../core/content';
import { createDefaultHotbar, type HotbarSlot } from '../core/hotbar';
import { gatePassed } from '../game/phaseGate';
import { createPortraitDataUrl } from '../game/textures';
import {
  hudStore,
  logStore,
  pushLog,
  sendCommand,
  showToast,
  toastStore,
  type HudSnapshot,
  type LogEntry,
} from '../game/bridge';
import { SlotIcon } from './icons';

const useHud = () => useSyncExternalStore(hudStore.subscribe, hudStore.get);
const useLogs = () => useSyncExternalStore(logStore.subscribe, logStore.get);
const useToast = () => useSyncExternalStore(toastStore.subscribe, toastStore.get);

const PHASE_LABEL = 'PHASE 1 · COMBAT PROTOTYPE · ออฟไลน์ · ภาพ PLACEHOLDER';

export function App() {
  const hud = useHud();
  const [started, setStarted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(true);
  const [uiScale, setUiScale] = useState(1);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    sendCommand({ type: 'setInputEnabled', enabled: started });
  }, [started]);

  const start = () => {
    setStarted(true);
    (document.querySelector('#game-root canvas') as HTMLCanvasElement | null)?.focus();
  };

  return (
    <div id="hud" className={highContrast ? 'hc' : ''} style={{ ['--ui-scale' as string]: uiScale }}>
      <div className="phase-badge" title="ข้อมูลทั้งหมดเป็นการจำลองฝั่ง client ใน Phase 1 — ยังไม่มี server">
        {PHASE_LABEL}
      </div>

      {hud.ready && (
        <>
          <StatusPanel hud={hud} />
          {gateOpen && <GatePanel hud={hud} onClose={() => setGateOpen(false)} />}
          <TargetFrame hud={hud} />
          <Minimap hud={hud} />
          <Hotbar hud={hud} />
          <ChatPanel />
          <MenuDock onSettings={() => setSettingsOpen((v) => !v)} onGate={() => setGateOpen((v) => !v)} />
          <Toast />
          {hud.charState === 'DEAD' && <DeathOverlay hud={hud} />}
          {hud.debug && (
            <div className="debug-fps">
              DEBUG · FPS {hud.fps} · {hud.combatState} · {hud.charState}
            </div>
          )}
        </>
      )}

      {settingsOpen && (
        <SettingsPanel
          uiScale={uiScale}
          setUiScale={setUiScale}
          highContrast={highContrast}
          setHighContrast={setHighContrast}
          debug={hud.debug}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {!started && <StartScreen onStart={start} />}
    </div>
  );
}

/* ---------------------------------------------------------------- start */

function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="start-screen" role="dialog" aria-label="Start">
      <div className="start-card panel">
        <div className="logo">
          <span className="logo-the">THE</span>
          <span className="logo-power">POWER</span>
          <span className="logo-eclipse">ECLIPSE</span>
        </div>
        <p className="start-sub">Phase 1 — HTML5 Combat Prototype</p>
        <p className="start-note">
          โหมดผู้เล่นเดียวแบบออฟไลน์สำหรับทดสอบระบบต่อสู้ · ไม่มีบัญชี/เซิร์ฟเวอร์/ไอเทม/เงิน (มาใน Phase 2+)
          · ภาพทั้งหมดเป็น placeholder
        </p>
        <div className="controls-grid">
          <kbd>W A S D</kbd>
          <span>เดิน 8 ทิศ (หรือปุ่มลูกศร)</span>
          <kbd>1 / คลิกซ้าย</kbd>
          <span>Basic Attack (คลิก = เล็งตามเมาส์)</span>
          <kbd>2</kbd>
          <span>Triple Slash — ฟัน 3 ครั้ง</span>
          <kbd>3</kbd>
          <span>Guard Break — ลดเกราะ + ขัดจังหวะ</span>
          <kbd>4</kbd>
          <span>Counter Slash — ตั้งท่ารับแล้วสวนกลับ</span>
          <kbd>Space / E</kbd>
          <span>Dodge (ใช้ Stamina, อมตะชั่วครู่)</span>
          <kbd>Enter</kbd>
          <span>แชท · F3 = Debug overlay</span>
        </div>
        <p className="narrow-note">
          Phase 1 ทดสอบด้วยคีย์บอร์ด + เมาส์บนเดสก์ท็อป · ปุ่มสัมผัสสำหรับมือถือยังไม่อยู่ใน Phase นี้
        </p>
        <button className="btn-primary" onClick={onStart} autoFocus>
          เริ่มทดสอบ
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- status */

function Bar({
  label,
  value,
  max,
  kind,
  locked,
}: {
  label: string;
  value: number;
  max: number;
  kind: string;
  locked?: string;
}) {
  const pct = locked ? 0 : Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className={`bar bar-${kind} ${locked ? 'locked' : ''}`} title={locked}>
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
        <span className="bar-text">{locked ? `🔒 ${locked}` : `${value} / ${max}`}</span>
      </div>
    </div>
  );
}

function StatusPanel({ hud }: { hud: HudSnapshot }) {
  const portrait = useMemo(() => createPortraitDataUrl(), []);
  return (
    <div className="status panel" data-testid="status">
      <div className="portrait">
        <img src={portrait} alt="" />
        <span className="lv">Lv.{hud.level}</span>
      </div>
      <div className="status-body">
        <div className="status-name">
          {hud.playerName} <span className="weapon-tag">Sword</span>
          {hud.charState === 'IN_COMBAT' && <span className="combat-tag">IN COMBAT</span>}
          {hud.invulnerable && <span className="inv-tag">IMMUNE</span>}
        </div>
        <Bar label="HP" value={hud.hp} max={hud.maxHp} kind="hp" />
        <Bar label="ST" value={hud.stamina} max={hud.maxStamina} kind="st" />
        <Bar label="PE" value={0} max={1} kind="pe" locked="Power Energy · Phase 3" />
        <Bar label="EXP" value={0} max={1} kind="exp" locked="EXP/Level · Phase 2 (server)" />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- gate */

function GatePanel({ hud, onClose }: { hud: HudSnapshot; onClose: () => void }) {
  const passed = gatePassed(hud.gate);
  const required = hud.gate.filter((g) => g.required);
  const done = required.filter((g) => g.done).length;
  return (
    <div className="gate panel" data-testid="gate">
      <div className="panel-title">
        <span>◆ Phase 1 · Acceptance Gate</span>
        <button className="x" onClick={onClose} aria-label="ปิด">
          ×
        </button>
      </div>
      <div className="gate-progress">
        <div style={{ width: `${(done / Math.max(1, required.length)) * 100}%` }} />
      </div>
      <ul>
        {hud.gate.map((g) => (
          <li key={g.id} className={g.done ? 'done' : g.required ? '' : 'opt'}>
            <span className="check">{g.done ? '✔' : '○'}</span>
            {g.label}
            {g.detail && <span className="detail"> ({g.detail})</span>}
          </li>
        ))}
      </ul>
      <div className={`gate-summary ${passed ? 'ok' : ''}`}>
        {passed ? '✅ ผ่านเงื่อนไขฝั่ง client ครบแล้ว' : `ทำแล้ว ${done}/${required.length} รายการ`}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- target */

function TargetFrame({ hud }: { hud: HudSnapshot }) {
  const t = hud.target;
  if (!t) return null;
  return (
    <div className="target panel" data-testid="target">
      <div className="target-name">
        Lv.{t.level} {t.name} <span className="ai">{t.ai}</span>
      </div>
      <div className="bar-track">
        <div className="bar-fill hp" style={{ width: `${(t.hp / t.maxHp) * 100}%` }} />
        <span className="bar-text">
          {t.hp} / {t.maxHp}
        </span>
      </div>
      {t.statuses.includes('guard_break') && <div className="debuff">▼ GUARD BREAK (DEF −50%)</div>}
    </div>
  );
}

/* -------------------------------------------------------------- minimap */

function Minimap({ hud }: { hud: HudSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const base = useMemo(() => {
    const m = CONTENT.trainingMap;
    const cv = document.createElement('canvas');
    cv.width = m.width;
    cv.height = m.height;
    const c = cv.getContext('2d');
    if (!c) return cv;
    const colors = [
      '#4d8a3c',
      '#4d8a3c',
      '#4d8a3c',
      '#b99a68',
      '#2f5fa8',
      '#5d5870',
      '#1f4a1f',
      '#3e7531',
      '#d8c58f',
    ];
    m.ground.forEach((t, i) => {
      c.fillStyle = colors[t] ?? '#000';
      c.fillRect(i % m.width, Math.floor(i / m.width), 1, 1);
    });
    return cv;
  }, []);
  useEffect(() => {
    const cv = ref.current;
    const c = cv?.getContext('2d');
    if (!cv || !c) return;
    c.imageSmoothingEnabled = false;
    c.drawImage(base, 0, 0, cv.width, cv.height);
    const sx = cv.width / hud.mapSize.w;
    const sy = cv.height / hud.mapSize.h;
    for (const e of hud.minimap) {
      if (e.kind === 'dead') continue;
      c.fillStyle = e.kind === 'player' ? '#ffffff' : '#ff4a5c';
      const s = e.kind === 'player' ? 4 : 3;
      c.fillRect(e.x * sx - s / 2, e.y * sy - s / 2, s, s);
    }
  }, [hud, base]);
  return (
    <div className="minimap panel">
      <div className="map-name">{hud.mapName}</div>
      <canvas ref={ref} width={192} height={120} />
      <div className="map-zone">PvP: OFF · Dev Map (ไม่นับใน 32 แมพ)</div>
    </div>
  );
}

/* --------------------------------------------------------------- hotbar */

function HotbarSlotView({ slot, hud }: { slot: HotbarSlot; hud: HudSnapshot }) {
  const locked = slot.availableInPhase > 1;
  const cd = hud.cooldowns[slot.action];
  const cost = hud.staminaCosts[slot.action];
  const name = hud.skillNames[slot.action] ?? slot.label;
  const noStamina = cost !== undefined && hud.stamina < cost;
  const deg = cd ? Math.round(cd.fraction * 360) : 0;
  return (
    <button
      className={`slot ${locked ? 'locked' : ''} ${noStamina ? 'nostam' : ''}`}
      data-testid={`slot-${slot.index}`}
      title={
        locked
          ? `${slot.label} — ปลดล็อก Phase ${slot.availableInPhase}`
          : `${name}${cost ? ` · Stamina ${cost}` : ''}`
      }
      onClick={() =>
        locked
          ? showToast(`${slot.label}: ปลดล็อกใน Phase ${slot.availableInPhase}`)
          : sendCommand({ type: 'hotbar', action: slot.action })
      }
      tabIndex={-1}
    >
      <span className="slot-icon">
        <SlotIcon action={slot.action} />
      </span>
      {deg > 0 && (
        <span
          className="cd"
          style={{ background: `conic-gradient(rgba(8,4,14,0.78) ${deg}deg, transparent ${deg}deg)` }}
        />
      )}
      {cd && cd.remainingMs > 500 && <span className="cd-text">{(cd.remainingMs / 1000).toFixed(1)}</span>}
      <span className="key">{slot.keyLabel}</span>
      {cost ? <span className="cost">{cost}</span> : null}
      {locked && <span className="lock">🔒</span>}
    </button>
  );
}

function Hotbar({ hud }: { hud: HudSnapshot }) {
  const slots = useMemo(() => createDefaultHotbar(), []);
  return (
    <div className="hotbar panel" data-testid="hotbar" aria-label="Hotbar 20 ช่อง">
      <div className="hotbar-row">
        {slots.slice(0, 10).map((s) => (
          <HotbarSlotView key={s.index} slot={s} hud={hud} />
        ))}
      </div>
      <div className="hotbar-row">
        {slots.slice(10).map((s) => (
          <HotbarSlotView key={s.index} slot={s} hud={hud} />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- chat */

type Tab = 'all' | 'combat' | 'system';

function ChatPanel() {
  const logs = useLogs();
  const [tab, setTab] = useState<Tab>('all');
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const shown = logs.filter((l: LogEntry) => tab === 'all' || l.channel === tab);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [shown.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const msg = text.trim();
    setText('');
    (document.activeElement as HTMLElement | null)?.blur();
    if (!msg) return;
    if (msg === '/gmstefanonline') {
      // LOCKED §19.1: never granted client-side. Server AdminAuthorizationService arrives in Phase 2/3.
      pushLog(
        'system',
        'Permission Denied — ต้องยืนยันสิทธิ์ GM จาก server (ยังไม่มีใน Phase 1) · บันทึกความพยายามแล้ว',
        'bad',
      );
      return;
    }
    if (msg === '/help') {
      pushLog('system', 'คำสั่ง: /help · แชทออนไลน์และ GM HUD จะใช้งานได้เมื่อมี server (Phase 2–3)');
      return;
    }
    pushLog('system', `[ออฟไลน์] ${msg} — แชทยังไม่ส่งถึงผู้เล่นอื่นจนกว่าจะมี server (Phase 2)`);
  };

  return (
    <div className="chat panel">
      <div className="tabs">
        {(['all', 'combat', 'system'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)} tabIndex={-1}>
            {t === 'all' ? 'ทั้งหมด' : t === 'combat' ? 'ต่อสู้' : 'ระบบ'}
          </button>
        ))}
      </div>
      <div className="log" ref={listRef} data-testid="log">
        {shown.slice(-40).map((l) => (
          <div key={l.id} className={`line ${l.tone ?? ''}`}>
            <span className="ch">[{l.channel === 'combat' ? 'ต่อสู้' : 'ระบบ'}]</span> {l.text}
          </div>
        ))}
      </div>
      <form onSubmit={submit}>
        <input
          id="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="กด Enter เพื่อพิมพ์ · Esc เพื่อกลับเกม"
          onFocus={() => sendCommand({ type: 'setInputEnabled', enabled: false })}
          onBlur={() => sendCommand({ type: 'setInputEnabled', enabled: true })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
          maxLength={120}
          autoComplete="off"
        />
      </form>
    </div>
  );
}

/* ----------------------------------------------------------------- menu */

const MENU: Array<{ id: string; label: string; icon: string; phase?: number }> = [
  { id: 'char', label: 'ตัวละคร', icon: '👤', phase: 2 },
  { id: 'bag', label: 'กระเป๋า', icon: '🎒', phase: 2 },
  { id: 'skill', label: 'สกิล', icon: '📜', phase: 3 },
  { id: 'power', label: 'The Power', icon: '🔮', phase: 3 },
  { id: 'map', label: 'แผนที่', icon: '🗺️', phase: 4 },
  { id: 'gate', label: 'QA Gate', icon: '✅' },
  { id: 'settings', label: 'ตั้งค่า', icon: '⚙️' },
];

function MenuDock({ onSettings, onGate }: { onSettings: () => void; onGate: () => void }) {
  return (
    <div className="menu-dock">
      {MENU.map((m) => (
        <button
          key={m.id}
          className={`menu-btn ${m.phase ? 'locked' : ''}`}
          tabIndex={-1}
          onClick={() => {
            if (m.id === 'settings') onSettings();
            else if (m.id === 'gate') onGate();
            else showToast(`${m.label}: เปิดใช้งานใน Phase ${m.phase}`);
          }}
        >
          <span className="mi">{m.icon}</span>
          <span className="ml">{m.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- toast */

function Toast() {
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1200);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || !visible) return null;
  return (
    <div className="toast" key={toast.id} role="status">
      {toast.text}
    </div>
  );
}

/* ---------------------------------------------------------------- death */

function DeathOverlay({ hud }: { hud: HudSnapshot }) {
  const total = hud.deathRecap.reduce((a, r) => a + r.amount, 0);
  return (
    <div className="death" data-testid="death">
      <div className="death-card panel">
        <h2>คุณเสียชีวิต</h2>
        <p>
          เกิดใหม่ใน {(hud.respawnInMs / 1000).toFixed(1)} วินาที ที่จุดเกิด (PvE: ไม่มีของหล่นใน Phase 1)
        </p>
        <h3>Death Recap · 10 วินาทีล่าสุด</h3>
        <table>
          <thead>
            <tr>
              <th>เวลา</th>
              <th>ผู้โจมตี</th>
              <th>ดาเมจ</th>
              <th>ลดด้วยเกราะ</th>
            </tr>
          </thead>
          <tbody>
            {hud.deathRecap.slice(-6).map((r, i) => (
              <tr key={i}>
                <td>{(r.time / 1000).toFixed(1)}s</td>
                <td>{r.attackerName}</td>
                <td className={r.isCrit ? 'crit' : ''}>
                  {r.amount}
                  {r.isCrit ? '!' : ''}
                </td>
                <td>{Math.round(r.mitigation * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="recap-total">รวมดาเมจที่ได้รับ: {total}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- settings */

function SettingsPanel(props: {
  uiScale: number;
  setUiScale: (v: number) => void;
  highContrast: boolean;
  setHighContrast: (v: boolean) => void;
  debug: boolean;
  onClose: () => void;
}) {
  const [reduced, setReduced] = useState(false);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      void document.documentElement
        .requestFullscreen?.()
        .catch(() => showToast('เบราว์เซอร์ไม่อนุญาต fullscreen'));
  };
  return (
    <div className="settings panel" role="dialog" aria-label="ตั้งค่า">
      <div className="panel-title">
        <span>⚙ ตั้งค่า</span>
        <button className="x" onClick={props.onClose} aria-label="ปิด">
          ×
        </button>
      </div>
      <label>
        ขนาด UI ({props.uiScale.toFixed(2)}x)
        <input
          type="range"
          min={0.75}
          max={1.4}
          step={0.05}
          value={props.uiScale}
          onChange={(e) => props.setUiScale(Number(e.target.value))}
        />
      </label>
      <label className="row">
        <input
          type="checkbox"
          checked={props.highContrast}
          onChange={(e) => props.setHighContrast(e.target.checked)}
        />{' '}
        High contrast
      </label>
      <label className="row">
        <input
          type="checkbox"
          checked={reduced}
          onChange={(e) => {
            setReduced(e.target.checked);
            sendCommand({ type: 'setReducedEffects', value: e.target.checked });
          }}
        />{' '}
        ลดเอฟเฟกต์/สั่นจอ
      </label>
      <label className="row">
        <input type="checkbox" checked={props.debug} onChange={() => sendCommand({ type: 'toggleDebug' })} />{' '}
        Debug overlay (F3) — QA เท่านั้น
      </label>
      <button className="btn-secondary" onClick={toggleFullscreen}>
        สลับ Fullscreen
      </button>
      <p className="hint">การปรับปุ่ม (keybind remap) และบันทึก preset hotbar จะมาใน Phase 3</p>
    </div>
  );
}
