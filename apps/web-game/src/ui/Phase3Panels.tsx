import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CONTENT, itemName, type WeaponType } from '../core/content';
import {
  isBindableKey,
  keyLabel,
  slotMeta,
  defaultLayout,
  validateLayout,
  type HotbarAction,
  type HotbarLayoutEntry,
} from '../core/hotbar';
import type { AutoSettings, WorldSource } from '../core/worldSource';
import { hotbarStore, sendCommand, showToast, uiEventStore, type HudSnapshot } from '../game/bridge';
import { SlotIcon } from './icons';

const useLayout = () => useSyncExternalStore(hotbarStore.subscribe, hotbarStore.get);
const POWER_ACTIONS = new Set<HotbarAction>([
  'power1',
  'power2',
  'power3',
  'power4',
  'power5',
  'powerUlt',
  'powerToggle',
]);

/* ------------------------------------------------------------------ hotbar */

export function Hotbar3({ hud, world }: { hud: HudSnapshot; world: WorldSource }) {
  const layout = useLayout();
  const [edit, setEdit] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);

  // offline: restore the browser-local layout once
  useEffect(() => {
    if (world.mode !== 'offline') return;
    try {
      const saved = JSON.parse(localStorage.getItem('tpe.hotbar') ?? 'null');
      if (saved && validateLayout(saved)) hotbarStore.set(saved);
    } catch {
      /* ignore */
    }
  }, [world.mode]);

  const commit = (next: HotbarLayoutEntry[]) => {
    if (!validateLayout(next)) return showToast('layout ไม่ถูกต้อง');
    hotbarStore.set(next);
    world.saveHotbar(next);
  };

  // key capture while a slot is selected in edit mode
  useEffect(() => {
    if (!edit || picked === null) return;
    sendCommand({ type: 'setInputEnabled', enabled: false });
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') return setPicked(null);
      const code = e.code === 'Backspace' || e.code === 'Delete' ? '' : e.code;
      if (!isBindableKey(code)) return showToast(`ปุ่ม ${e.code} ถูกสงวนไว้ (เดิน/แชท/H/J/F3 ฯลฯ)`);
      const next = layout.map((s) => ({ ...s }));
      const other = next.findIndex((s, i) => i !== picked && s.key === code && code !== '');
      const cur = next[picked] as HotbarLayoutEntry;
      if (other >= 0) (next[other] as HotbarLayoutEntry).key = cur.key; // swap on conflict
      cur.key = code;
      commit(next);
      setPicked(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      sendCommand({ type: 'setInputEnabled', enabled: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, picked, layout]);

  const click = (i: number) => {
    const s = layout[i] as HotbarLayoutEntry;
    if (!edit) {
      const meta = slotMeta(s.action);
      const phase = hud.mode === 'online' ? 3 : 1;
      if (meta.availableInPhase > phase && !(s.action === 'hpPotion' && hud.mode === 'online'))
        return showToast(`${meta.label}: ปลดล็อกใน Phase ${meta.availableInPhase}`);
      return sendCommand({ type: 'hotbar', action: s.action });
    }
    if (picked === null) return setPicked(i);
    if (picked === i) return setPicked(null);
    // swap actions between two slots (keys stay with the slot position)
    const next = layout.map((x) => ({ ...x }));
    const a = next[picked] as HotbarLayoutEntry;
    const b = next[i] as HotbarLayoutEntry;
    [a.action, b.action] = [b.action, a.action];
    commit(next);
    setPicked(null);
  };

  const slot = (s: HotbarLayoutEntry, i: number) => {
    const meta = slotMeta(s.action);
    const phase = hud.mode === 'online' ? 3 : 1;
    const locked = meta.availableInPhase > phase && !(s.action === 'hpPotion' && hud.mode === 'online');
    const cd = hud.cooldowns[s.action];
    const cost = hud.staminaCosts[s.action];
    const ecost = hud.energyCosts[s.action];
    const name = hud.skillNames[s.action] ?? meta.label;
    const powerEmpty = POWER_ACTIONS.has(s.action) && s.action !== 'powerToggle' && !hud.skillNames[s.action];
    const noRes = (cost !== undefined && hud.stamina < cost) || (ecost !== undefined && hud.energy < ecost);
    const deg = cd ? Math.round(cd.fraction * 360) : 0;
    const stanceOn = s.action === 'powerToggle' && hud.power?.stance;
    return (
      <button
        key={i}
        className={`slot ${locked || powerEmpty ? 'locked' : ''} ${noRes ? 'nostam' : ''} ${picked === i ? 'picked' : ''} ${stanceOn ? 'stance-on' : ''}`}
        data-testid={`slot-${i + 1}`}
        data-action={s.action}
        title={`${name}${cost ? ` · ST ${cost}` : ''}${ecost ? ` · PE ${ecost}` : ''}${edit ? ' — คลิกเพื่อเลือก/สลับ แล้วกดปุ่มเพื่อ rebind' : ''}`}
        onClick={() => click(i)}
        tabIndex={-1}
      >
        <span className="slot-icon">
          <SlotIcon action={s.action} />
        </span>
        {deg > 0 && (
          <span
            className="cd"
            style={{ background: `conic-gradient(rgba(8,4,14,0.78) ${deg}deg, transparent ${deg}deg)` }}
          />
        )}
        {cd && cd.remainingMs > 500 && <span className="cd-text">{(cd.remainingMs / 1000).toFixed(1)}</span>}
        <span className="key">{keyLabel(s.key)}</span>
        {ecost ? (
          <span className="cost pe">{ecost}</span>
        ) : cost ? (
          <span className="cost">{cost}</span>
        ) : null}
        {(locked || powerEmpty) && <span className="lock">🔒</span>}
        {POWER_ACTIONS.has(s.action) && hud.skillNames[s.action] && (
          <span className="sname">{hud.skillNames[s.action]}</span>
        )}
      </button>
    );
  };

  return (
    <div className={`hotbar panel ${edit ? 'editing' : ''}`} data-testid="hotbar" aria-label="Hotbar 20 ช่อง">
      <div className="hotbar-row">{layout.slice(0, 10).map((s, i) => slot(s, i))}</div>
      <div className="hotbar-row">{layout.slice(10).map((s, i) => slot(s, i + 10))}</div>
      <div className="hotbar-tools">
        <button
          className={edit ? 'active' : ''}
          data-testid="hotbar-edit"
          onClick={() => {
            setEdit((v) => !v);
            setPicked(null);
          }}
          tabIndex={-1}
          title="แก้ไข hotbar: คลิก 2 ช่องเพื่อสลับ หรือคลิก 1 ช่องแล้วกดปุ่มเพื่อเปลี่ยนคีย์"
        >
          {edit ? '🔓 เสร็จ' : '🔒 แก้ไข'}
        </button>
        {edit && (
          <button onClick={() => commit(defaultLayout())} tabIndex={-1}>
            ค่าเริ่มต้น
          </button>
        )}
        {edit && (
          <span className="hint">
            {picked === null ? 'เลือกช่อง' : 'กดปุ่มใหม่ / คลิกอีกช่องเพื่อสลับ / Esc'}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ The Power */

export function PowerPanel({
  hud,
  world,
  onClose,
}: {
  hud: HudSnapshot;
  world: WorldSource;
  onClose: () => void;
}) {
  const pv = hud.power;
  const [lo, setLo] = useState(pv?.loadout ?? { actives: [], ultimate: '', passives: [] });
  useEffect(() => {
    if (pv) setLo(pv.loadout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pv?.id, pv?.rank, JSON.stringify(pv?.loadout)]);
  const unlocked = (cat: string) =>
    pv?.skills.filter((s) => s.category === cat && s.unlocked && s.implemented) ?? [];
  const set = (k: 'actives' | 'passives', i: number, v: string) => {
    const arr = [...lo[k]];
    arr[i] = v;
    setLo({ ...lo, [k]: arr.filter(Boolean) });
  };
  return (
    <div className="side-panel panel" data-testid="power-panel">
      <div className="panel-title">
        <span>🔮 The Power</span>
        <button className="x" onClick={onClose} aria-label="ปิด">
          ×
        </button>
      </div>
      {!pv ? (
        world.mode === 'offline' ? (
          <div className="col">
            <p className="hint">
              Power Trial (sandbox): ทดลองพลังที่ Rank 3 ได้ทันที — ไม่สร้างไอเทม ไม่บันทึก ไม่มีของดรอป
            </p>
            {CONTENT.powers.powers.map((p) => {
              const impl = [...p.active, ...p.ultimate, ...p.passive].some((s) => s.implemented);
              return (
                <button
                  key={p.id}
                  className="btn-secondary"
                  disabled={!impl}
                  onClick={() => world.bind(p.id)}
                  data-testid={`trial-${p.id}`}
                >
                  {p.name} · {p.type} {impl ? '' : '(Phase 7)'}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="hint">
            ยังไม่ได้ผูกพลัง — หา Fruit จากมอนสเตอร์ (1%) หรือคราฟต์จาก Fragment 10 ชิ้นในกระเป๋า แล้วกด
            “ผูกพลัง”
          </p>
        )
      ) : (
        <div className="col">
          <div className="power-head">
            <b>{pv.name}</b> <span className="hint">{pv.type}</span>
            <span className={`conn ${pv.stance ? 'conn-online' : ''}`}>
              {pv.stance ? 'STANCE ON' : 'stance off'}
            </span>
          </div>
          <div className="kv">
            <span>Proficiency</span>
            <b>
              Rank {pv.rank} · {pv.points}
              {pv.nextRankPoints ? ` / ${pv.nextRankPoints}` : ' (MAX)'}
            </b>
            <span>อาวุธที่ใช้ได้</span>
            <b className={pv.weaponOk ? '' : 'bad'}>
              {pv.allowedWeapons.length === 6 ? 'ทั้ง 6' : pv.allowedWeapons.join(', ')}
            </b>
            <span>Power Energy</span>
            <b>
              {hud.energy}/{hud.maxEnergy}
            </b>
          </div>
          {!pv.weaponOk && <p className="form-error">อาวุธปัจจุบันใช้พลังนี้ไม่ได้ — Activate ไม่ได้</p>}
          <h4>Loadout (5 Active · 1 Ultimate · 2 Passive)</h4>
          {[0, 1, 2, 3, 4].map((i) => (
            <select
              key={i}
              id={`lo-a${i}`}
              value={lo.actives[i] ?? ''}
              onChange={(e) => set('actives', i, e.target.value)}
            >
              <option value="">— Active {i + 1} —</option>
              {unlocked('power-active').map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (PE {s.energyCost})
                </option>
              ))}
            </select>
          ))}
          <select
            id="lo-ult"
            value={lo.ultimate}
            onChange={(e) => setLo({ ...lo, ultimate: e.target.value })}
          >
            <option value="">— Ultimate —</option>
            {unlocked('power-ultimate').map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (PE {s.energyCost})
              </option>
            ))}
          </select>
          {[0, 1].map((i) => (
            <select
              key={i}
              id={`lo-p${i}`}
              value={lo.passives[i] ?? ''}
              onChange={(e) => set('passives', i, e.target.value)}
            >
              <option value="">— Passive {i + 1} —</option>
              {unlocked('power-passive').map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ))}
          <div className="row">
            <button
              className="btn-primary small"
              onClick={() => world.setLoadout(lo)}
              data-testid="save-loadout"
            >
              บันทึก Loadout
            </button>
            {world.mode === 'offline' && (
              <button className="btn-secondary small" onClick={() => world.unbind('')}>
                ยกเลิก Trial
              </button>
            )}
          </div>
          <details>
            <summary>สกิลทั้งหมด 25 (15/5/5)</summary>
            <ul className="skill-list">
              {pv.skills.map((s) => (
                <li key={s.id} className={s.unlocked && s.implemented ? '' : 'dim'} title={s.description}>
                  <span>
                    {s.category === 'power-active' ? 'A' : s.category === 'power-ultimate' ? 'U' : 'P'}
                  </span>{' '}
                  {s.name}
                  {!s.implemented ? ' · Phase 7' : !s.unlocked ? ' · 🔒 rank' : ''}
                </li>
              ))}
            </ul>
          </details>
          <p className="hint">ถอดพลังต้องคุยกับ NPC The Severer (กด H ข้าง NPC) — ผลพลังจะถูกทำลายถาวร</p>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------- character / weapons */

export function CharPanel({
  hud,
  world,
  onClose,
}: {
  hud: HudSnapshot;
  world: WorldSource;
  onClose: () => void;
}) {
  const w = CONTENT.weapons.find((x) => x.id === hud.weaponId);
  const owned = new Set(
    (hud.online?.items ?? [])
      .map((i) => CONTENT.items.find((t) => t.id === i.templateId)?.weaponType)
      .filter(Boolean) as string[],
  );
  return (
    <div className="side-panel panel" data-testid="char-panel">
      <div className="panel-title">
        <span>👤 ตัวละคร · อาวุธ</span>
        <button className="x" onClick={onClose} aria-label="ปิด">
          ×
        </button>
      </div>
      <div className="weapon-grid">
        {CONTENT.weapons.map((x) => {
          const can = world.mode === 'offline' || owned.has(x.id);
          return (
            <button
              key={x.id}
              className={`weapon ${hud.weaponId === x.id ? 'active' : ''}`}
              disabled={!can}
              data-testid={`equip-${x.id}`}
              onClick={() => world.equip(x.id as WeaponType)}
              title={can ? 'สวมใส่ (นอกการต่อสู้)' : 'ต้องมีอาวุธชนิดนี้ในกระเป๋า'}
            >
              <b>{x.name}</b>
              <span>{x.role}</span>
            </button>
          );
        })}
      </div>
      {w && (
        <ul className="skill-list">
          <li>
            <span>B</span> {w.basicAttack?.name}
          </li>
          {w.skills.map((s, i) => (
            <li key={s.id} title={'description' in s ? s.description : ''}>
              <span>{i + 2}</span> {s.name} — {'description' in s ? s.description : ''}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        {world.mode === 'offline'
          ? 'Sandbox: เปลี่ยนอาวุธได้ทันที'
          : 'ออนไลน์: เปลี่ยนได้เฉพาะอาวุธที่มีในกระเป๋า นอกการต่อสู้ · cooldown ไม่รีเซ็ต · ถ้าพลังไม่รองรับ stance จะปิดเอง'}
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------- bag */

const EQUIP_LABEL: Record<string, string> = {
  weapon: 'อาวุธ',
  helmet: 'หมวก',
  chest: 'เสื้อ',
  armguard: 'ปลอกแขน',
  legs: 'กางเกง',
  boots: 'รองเท้า',
};

export function Bag3({ hud, world, onClose }: { hud: HudSnapshot; world: WorldSource; onClose: () => void }) {
  const o = hud.online;
  if (!o) return null;
  const have = (id: string) => o.items.find((i) => i.templateId === id)?.quantity ?? 0;
  return (
    <div className="bag panel" data-testid="bag">
      <div className="panel-title">
        <span>
          🎒 กระเป๋า ({o.items.length}/{o.slots})
        </span>
        <button className="x" onClick={onClose} aria-label="ปิด">
          ×
        </button>
      </div>
      <ul>
        {o.items.map((it) => {
          const t = CONTENT.items.find((x) => x.id === it.templateId);
          return (
            <li key={it.templateId}>
              <span>
                {itemName(it.templateId)}
                {o.enhance[it.templateId] ? ` +${o.enhance[it.templateId]}` : ''}
              </span>
              <b>x{it.quantity}</b>
              <span className="actions">
                {t?.slot && (
                  <button
                    disabled={o.equipment[t.slot] === it.templateId}
                    onClick={() => world.equipItem?.(it.templateId)}
                    data-testid={`equip-item-${it.templateId}`}
                  >
                    {o.equipment[t.slot] === it.templateId ? 'สวมอยู่' : 'สวมใส่'}
                  </button>
                )}
                {t?.powerId && (
                  <button data-testid={`bind-${it.templateId}`} onClick={() => world.bind(it.templateId)}>
                    ผูกพลัง
                  </button>
                )}
                {it.templateId === 'CON-001' && (
                  <button onClick={() => sendCommand({ type: 'hotbar', action: 'hpPotion' })}>ใช้</button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <h4>อุปกรณ์ที่สวมใส่</h4>
      <div className="equip-grid" data-testid="equipment">
        {(['weapon', 'helmet', 'chest', 'armguard', 'legs', 'boots'] as const).map((slot) => {
          const id = o.equipment[slot];
          return (
            <div key={slot} className="equip-slot">
              <span className="hint">{EQUIP_LABEL[slot]}</span>
              <b>{id ? `${itemName(id)}${o.enhance[id] ? ` +${o.enhance[id]}` : ''}` : '—'}</b>
              {id && slot !== 'weapon' && (
                <button
                  className="x"
                  onClick={() => world.unequip?.(slot)}
                  aria-label={`ถอด ${EQUIP_LABEL[slot]}`}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      <h4>คราฟต์ผลพลัง (Fragment → Fruit)</h4>
      {CONTENT.recipes
        .filter((r) => r.id.startsWith('RCP-PWR'))
        .map((r) => {
          const input = r.inputs[0];
          const n = input ? have(input.itemId) : 0;
          return (
            <div key={r.id} className="row">
              <span className="hint">
                {r.name}: {input && itemName(input.itemId)} {n}/{input?.quantity}
              </span>
              <button
                className="btn-secondary small"
                disabled={!input || n < input.quantity}
                onClick={() => world.craft?.(r.id)}
                data-testid={`craft-${r.id}`}
              >
                คราฟต์
              </button>
            </div>
          );
        })}
      <p className="hint">Gold: {o.gold.toLocaleString()} · ผูกพลังได้ครั้งละ 1 ผล</p>
    </div>
  );
}

/* --------------------------------------------------------------- Severer */

export function SevererDialog({ hud, world }: { hud: HudSnapshot; world: WorldSource }) {
  const ev = useSyncExternalStore(uiEventStore.subscribe, uiEventStore.get);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  useEffect(() => {
    if (ev.kind === 'severer') {
      setOpen(true);
      setConfirm('');
    }
  }, [ev]);
  useEffect(() => {
    if (!hud.nearSeverer) setOpen(false);
  }, [hud.nearSeverer]);
  if (!open) return null;
  const pv = hud.power;
  return (
    <div className="conn-overlay" data-testid="severer">
      <div className="panel conn-card severer">
        <h3>The Severer — พิธีตัดพลัง</h3>
        {!pv ? (
          <p>เจ้าไม่มีพลังให้ตัด กลับมาเมื่อผลพลังผูกกับวิญญาณเจ้าแล้ว</p>
        ) : (
          <>
            <p>
              พลังปัจจุบัน: <b>{pv.name}</b> (Rank {pv.rank})
            </p>
            <p className="form-error">
              ⚠ ผล {pv.name} จะถูกทำลายถาวร ไม่คืนไอเทม — ต้องหาผลใหม่ถ้าต้องการใช้อีก (proficiency เก็บไว้ใน
              Archive)
            </p>
            <input
              id="severer-confirm"
              placeholder={`พิมพ์ “${pv.name}” เพื่อยืนยัน`}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onFocus={() => sendCommand({ type: 'setInputEnabled', enabled: false })}
              onBlur={() => sendCommand({ type: 'setInputEnabled', enabled: true })}
            />
            <button
              className="btn-secondary danger"
              disabled={confirm.trim().toLowerCase() !== pv.name.toLowerCase()}
              onClick={() => {
                world.unbind(confirm);
                setOpen(false);
              }}
              data-testid="severer-confirm-btn"
            >
              ทำลายพลังถาวร
            </button>
          </>
        )}
        <button className="link" onClick={() => setOpen(false)}>
          ปิด
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- Auto */

const DEFAULT_AUTO: AutoSettings = {
  radiusTiles: 10,
  useSkills: true,
  skillOrder: ['skill1', 'skill2', 'skill3', 'p1', 'p2', 'p3', 'p4', 'p5'],
  autoPotion: true,
  potionPct: 0.4,
  autoLoot: true,
  lootCategories: [],
  targets: [],
  blacklist: [],
  stopNoPotion: true,
  maxMinutes: 0,
};

export function AutoPanel({
  hud,
  world,
  onClose,
}: {
  hud: HudSnapshot;
  world: WorldSource;
  onClose: () => void;
}) {
  const a = hud.auto;
  const [s, setS] = useState<AutoSettings>(a?.settings ?? DEFAULT_AUTO);
  useEffect(() => {
    if (a?.settings) setS({ ...DEFAULT_AUTO, ...a.settings });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(a?.settings)]);
  const r = a?.enabled ? a.live : a?.report;
  const fmt = (ms: number) =>
    `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  return (
    <div className="side-panel panel" data-testid="auto-panel">
      <div className="panel-title">
        <span>🤖 Auto Farm (PvE)</span>
        <button className="x" onClick={onClose} aria-label="ปิด">
          ×
        </button>
      </div>
      {world.mode === 'offline' ? (
        <p className="hint">Auto ทำงานบน server เท่านั้น (ไม่มีใน sandbox ออฟไลน์)</p>
      ) : (
        <div className="col">
          <label>
            รัศมีจากจุดเริ่ม: {s.radiusTiles} tiles
            <input
              type="range"
              id="auto-radius"
              min={5}
              max={25}
              value={s.radiusTiles}
              onChange={(e) => setS({ ...s, radiusTiles: Number(e.target.value) })}
            />
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={s.useSkills}
              onChange={(e) => setS({ ...s, useSkills: e.target.checked })}
            />{' '}
            Auto Skill (สกิลอาวุธ + พลังถ้า Activate)
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={s.autoPotion}
              onChange={(e) => setS({ ...s, autoPotion: e.target.checked })}
            />{' '}
            Auto Potion เมื่อ HP &lt;
            {Math.round(s.potionPct * 100)}%
          </label>
          <input
            type="range"
            id="auto-potion"
            min={10}
            max={80}
            value={Math.round(s.potionPct * 100)}
            onChange={(e) => setS({ ...s, potionPct: Number(e.target.value) / 100 })}
          />
          <label className="row">
            <input
              type="checkbox"
              checked={s.autoLoot}
              onChange={(e) => setS({ ...s, autoLoot: e.target.checked })}
            />{' '}
            Auto Loot
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={s.stopNoPotion}
              onChange={(e) => setS({ ...s, stopNoPotion: e.target.checked })}
            />{' '}
            หยุดเมื่อ HP ต่ำและยาหมด
          </label>
          <label>
            จำกัดเวลา (นาที, 0 = ไม่จำกัด)
            <input
              type="number"
              id="auto-max"
              min={0}
              max={600}
              value={s.maxMinutes}
              onChange={(e) => setS({ ...s, maxMinutes: Number(e.target.value) })}
            />
          </label>
          <div className="row">
            {a?.enabled ? (
              <button
                className="btn-secondary small danger"
                onClick={() => world.setAuto?.(false)}
                data-testid="auto-stop"
              >
                หยุด Auto
              </button>
            ) : (
              <button
                className="btn-primary small"
                onClick={() => world.setAuto?.(true, s)}
                data-testid="auto-start"
              >
                เริ่ม Auto
              </button>
            )}
            <button className="btn-secondary small" onClick={() => world.setAuto?.(null, s)}>
              บันทึกค่า
            </button>
          </div>
          {r && (
            <div className="kv" data-testid="auto-report">
              <span>{a?.enabled ? 'กำลังทำงาน' : `หยุด (${r.reason})`}</span>
              <b>{fmt(r.durationMs ?? 0)}</b>
              <span>กำจัด</span>
              <b>{r.kills}</b>
              <span>EXP / Gold</span>
              <b>
                {r.xp} / {r.gold}
              </b>
              <span>ยาที่ใช้</span>
              <b>{r.potionsUsed}</b>
              <span>ไอเทม</span>
              <b>
                {Object.entries(r.items ?? {})
                  .map(([k, v]) => `${itemName(k)} x${v}`)
                  .join(', ') || '—'}
              </b>
            </div>
          )}
          <p className="hint">
            ไม่ตี/ไม่ไล่ผู้เล่น · ไม่เปิดวงแดง/พิธีบอส · ไม่เข้าดันเจี้ยน · หยุดเมื่อหลุดการเชื่อมต่อ ·
            กดเดินเองเพื่อแทรก
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- GM HUD */

export function GmHud({ hud, world }: { hud: HudSnapshot; world: WorldSource }) {
  const gm = hud.online?.gm;
  const [tab, setTab] = useState<'players' | 'items' | 'monsters' | 'power'>('players');
  const [itemId, setItemId] = useState('PWR-001');
  const [qty, setQty] = useState(1);
  const [target, setTarget] = useState('');
  const [mon, setMon] = useState('MON-SLIME-001');
  const [count, setCount] = useState(3);
  const [pts, setPts] = useState(200);
  const players = useMemo(
    () =>
      hud.gmResult?.op === 'inspect' ? ((hud.gmResult.players as Array<Record<string, unknown>>) ?? []) : [],
    [hud.gmResult],
  );
  if (!gm?.open) return null;
  const focusOff = {
    onFocus: () => sendCommand({ type: 'setInputEnabled', enabled: false }),
    onBlur: () => sendCommand({ type: 'setInputEnabled', enabled: true }),
  };
  return (
    <div className="gm panel gm-hud" data-testid="gm-panel">
      <div className="panel-title">
        <span>👑 GM Control Center · {gm.role}</span>
        <span className="hint">{hud.online?.testWorld ? 'TEST WORLD' : 'LIVE'}</span>
      </div>
      <div className="tabs">
        {(['players', 'items', 'monsters', 'power'] as const).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)} tabIndex={-1}>
            {{ players: 'ผู้เล่น', items: 'เสกไอเทม', monsters: 'เสกมอนสเตอร์', power: 'Power' }[t]}
          </button>
        ))}
      </div>
      {tab === 'players' && (
        <div className="col">
          <button
            className="btn-secondary small"
            onClick={() => world.gm?.('inspect', {})}
            data-testid="gm-inspect"
          >
            ตรวจผู้เล่นทั้งหมด
          </button>
          <div className="gm-table">
            {players.map((p) => (
              <div key={String(p.name)} className="gm-row">
                <b>{String(p.name)}</b> Lv.{String(p.level)} · {String(p.weapon)} · HP {String(p.hp)}/
                {String(p.maxHp)} · Gold {String(p.gold)} · {String(p.power || '-')} {p.auto ? '· AUTO' : ''}{' '}
                {p.online ? '' : '· (หลุด)'}
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'items' && (
        <div className="col">
          <select id="gm-item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {CONTENT.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.id} · {i.name}
              </option>
            ))}
          </select>
          <div className="row">
            <input
              id="gm-qty"
              type="number"
              min={1}
              max={999}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              {...focusOff}
            />
            <input
              id="gm-target"
              placeholder="ชื่อเป้าหมาย (ว่าง = ตัวเอง)"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              {...focusOff}
            />
          </div>
          <button
            className="btn-primary small"
            onClick={() => world.gm?.('spawnItem', { itemId, qty, target })}
            data-testid="gm-spawn-item"
          >
            เสกไอเทม (บันทึก audit)
          </button>
        </div>
      )}
      {tab === 'monsters' && (
        <div className="col">
          <select id="gm-mon" value={mon} onChange={(e) => setMon(e.target.value)}>
            {CONTENT.monsters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} · {m.name}
              </option>
            ))}
          </select>
          <input
            id="gm-count"
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            {...focusOff}
          />
          <button
            className="btn-primary small"
            onClick={() => world.gm?.('spawnMonster', { itemId: mon, count })}
            data-testid="gm-spawn-monster"
          >
            เสกรอบตัว (ไม่มีดรอป · 2 นาที)
          </button>
        </div>
      )}
      {tab === 'power' && (
        <div className="col">
          <input
            id="gm-pts"
            type="number"
            min={0}
            value={pts}
            onChange={(e) => setPts(Number(e.target.value))}
            {...focusOff}
          />
          <button className="btn-primary small" onClick={() => world.gm?.('setPoints', { points: pts })}>
            ตั้ง Proficiency ตัวเอง
          </button>
        </div>
      )}
      <div className="row quick">
        <button onClick={() => world.sendChat?.('/gm heal')} tabIndex={-1}>
          Heal
        </button>
        <button onClick={() => world.sendChat?.('/gm god on')} tabIndex={-1}>
          God ON
        </button>
        <button onClick={() => world.sendChat?.('/gm god off')} tabIndex={-1}>
          God OFF
        </button>
        <button onClick={() => world.sendChat?.('/gmstefanonline')} tabIndex={-1}>
          ปิด
        </button>
      </div>
    </div>
  );
}
