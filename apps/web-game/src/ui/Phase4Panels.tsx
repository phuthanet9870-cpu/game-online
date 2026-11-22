import { useEffect, useState, useSyncExternalStore } from 'react';
import { CONTENT, itemName } from '../core/content';
import type { QuestView, WorldSource } from '../core/worldSource';
import { uiEventStore, type HudSnapshot } from '../game/bridge';

interface ShopItem {
  itemId: string;
  price: number;
}

/** NPC dialog driven by the server's `npc` reply (online) or local data (sandbox). */
export function NpcDialog({
  hud,
  world,
  onTrial,
}: {
  hud: HudSnapshot;
  world: WorldSource;
  onTrial: () => void;
}) {
  const ev = useSyncExternalStore(uiEventStore.subscribe, uiEventStore.get);
  const [open, setOpen] = useState<{ npc: string; data: Record<string, unknown> } | null>(null);
  useEffect(() => {
    if (ev.kind === 'npc' && ev.npc) setOpen({ npc: ev.npc, data: ev.data ?? {} });
  }, [ev]);
  useEffect(() => {
    if (!hud.nearNpc) setOpen(null);
  }, [hud.nearNpc]);
  if (!open) return null;
  const items = hud.online?.items ?? [];
  const tmpl = (id: string) => CONTENT.items.find((i) => i.id === id);
  const name = String(open.data.name ?? hud.nearNpc);
  const close = () => setOpen(null);
  return (
    <div className="npc-dialog panel" data-testid={`npc-${open.npc}`}>
      <div className="panel-title">
        <span>💬 {name}</span>
        <button className="x" onClick={close} aria-label="ปิด">
          ×
        </button>
      </div>
      {open.npc === 'merchant' && (
        <div className="col">
          <h4>ซื้อ</h4>
          {((open.data.shop as ShopItem[]) ?? []).map((s) => (
            <div key={s.itemId} className="row between">
              <span>{itemName(s.itemId)}</span>
              <button
                className="btn-secondary small"
                onClick={() => world.shop?.('buy', s.itemId, 1)}
                data-testid={`buy-${s.itemId}`}
              >
                ซื้อ {s.price} G
              </button>
            </div>
          ))}
          <h4>ขาย (Gold {hud.online?.gold ?? 0})</h4>
          <button
            className="btn-primary small"
            onClick={() => world.shop?.('sellAllTrade')}
            data-testid="sell-all-trade"
          >
            ขาย Trade Loot ทั้งหมด
          </button>
          {items
            .filter((i) => (tmpl(i.templateId)?.sellPriceGold ?? 0) > 0)
            .map((i) => (
              <div key={i.templateId} className="row between">
                <span>
                  {itemName(i.templateId)} x{i.quantity}
                </span>
                <button className="btn-secondary small" onClick={() => world.shop?.('sell', i.templateId, 1)}>
                  ขาย 1 ({tmpl(i.templateId)?.sellPriceGold} G)
                </button>
              </div>
            ))}
        </div>
      )}
      {open.npc === 'storage' && (
        <div className="col">
          <h4>กระเป๋า → โกดัง</h4>
          {items.map((i) => (
            <div key={i.templateId} className="row between">
              <span>
                {itemName(i.templateId)} x{i.quantity}
              </span>
              <button
                className="btn-secondary small"
                onClick={() => world.storage?.('deposit', i.templateId, i.quantity)}
                data-testid={`deposit-${i.templateId}`}
              >
                ฝากทั้งหมด
              </button>
            </div>
          ))}
          <h4>โกดัง → กระเป๋า</h4>
          {(
            ((open.data.storage as Array<{ templateId: string; quantity: number }>) ?? []) as Array<{
              templateId: string;
              quantity: number;
            }>
          ).map((i) => (
            <div key={i.templateId} className="row between">
              <span>
                {itemName(i.templateId)} x{i.quantity}
              </span>
              <button
                className="btn-secondary small"
                onClick={() => world.storage?.('withdraw', i.templateId, i.quantity)}
                data-testid={`withdraw-${i.templateId}`}
              >
                ถอนทั้งหมด
              </button>
            </div>
          ))}
        </div>
      )}
      {open.npc === 'trial' && (
        <div className="col">
          <p className="hint">
            ห้อง Power Trial: ทดลองพลังทุกผลที่ Rank 3 กับหุ่นฝึกและมอนสเตอร์ — ไม่สร้างไอเทม ไม่มีของดรอป
            ไม่บันทึก
          </p>
          <button className="btn-primary small" onClick={onTrial} data-testid="enter-trial">
            เข้าห้อง Power Trial
          </button>
        </div>
      )}
      {open.npc === 'blacksmith' && <Blacksmith hud={hud} world={world} data={open.data} />}
      {open.npc === 'questboard' && <QuestBoard quests={hud.online?.quests ?? []} world={world} />}
      {!['merchant', 'storage', 'trial', 'blacksmith', 'questboard'].includes(open.npc) && (
        <p className="hint">บริการนี้กำลังพัฒนาใน Phase 4 (เควสต์ / ดันเจี้ยน / อารีน่า / ตีบวก)</p>
      )}
    </div>
  );
}

interface RecipeView {
  id: string;
  name: string;
  goldCost?: number;
  inputs: Array<{ itemId: string; quantity: number }>;
  output: { itemId: string; quantity: number };
}
interface EnhanceCfg {
  maxLevel: number;
  statPctPerLevel: number;
  levels: Array<{ to: number; gold: number; stones: number; chance: number }>;
}

function Blacksmith({
  hud,
  world,
  data,
}: {
  hud: HudSnapshot;
  world: WorldSource;
  data: Record<string, unknown>;
}) {
  const o = hud.online;
  if (!o) return null;
  const have = (id: string) => o.items.find((i) => i.templateId === id)?.quantity ?? 0;
  const recipes = (data.recipes as RecipeView[]) ?? [];
  const enh = data.enhance as EnhanceCfg | undefined;
  const gear = o.items.filter((i) => CONTENT.items.find((t) => t.id === i.templateId)?.slot);
  return (
    <div className="col">
      <h4>คราฟต์ (Gold {o.gold})</h4>
      {recipes.map((r) => {
        const ok = r.inputs.every((i) => have(i.itemId) >= i.quantity) && o.gold >= (r.goldCost ?? 0);
        return (
          <div key={r.id} className="recipe">
            <div className="row between">
              <b>{r.name}</b>
              <button
                className="btn-secondary small"
                disabled={!ok}
                onClick={() => world.smith?.('craft', r.id)}
                data-testid={`smith-craft-${r.id}`}
              >
                คราฟต์ {r.goldCost ?? 0} G
              </button>
            </div>
            <span className="hint">
              {r.inputs.map((i) => `${itemName(i.itemId)} ${have(i.itemId)}/${i.quantity}`).join(' · ')}
            </span>
          </div>
        );
      })}
      {enh && (
        <>
          <h4>
            ตีบวก (+0 → +{enh.maxLevel}, ล้มเหลวไม่ทำลายของ) · Enhancement Stone {have('MAT-ORE-002')}
          </h4>
          {gear.map((g) => {
            const lvl = o.enhance[g.templateId] ?? 0;
            const next = enh.levels[lvl];
            return (
              <div key={g.templateId} className="row between">
                <span>
                  {itemName(g.templateId)} +{lvl}
                </span>
                {next ? (
                  <button
                    className="btn-secondary small"
                    disabled={o.gold < next.gold || have('MAT-ORE-002') < next.stones}
                    onClick={() => world.smith?.('enhance', g.templateId)}
                    data-testid={`smith-enhance-${g.templateId}`}
                  >
                    +{next.to}: {next.gold}G · หิน {next.stones} · {Math.round(next.chance * 100)}%
                  </button>
                ) : (
                  <span className="hint">MAX</span>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

const QUEST_STATE: Record<QuestView['state'], string> = {
  locked: '🔒 ยังไม่ปลดล็อก',
  available: 'รับได้',
  active: 'กำลังทำ',
  ready: '✅ ส่งได้',
  completed: 'สำเร็จแล้ว',
};

function objectiveText(q: QuestView): string {
  return q.objectives.map((o, i) => `${o.label ?? o.type} ${q.counts[i] ?? 0}/${o.count}`).join(' · ');
}

function QuestBoard({ quests, world }: { quests: QuestView[]; world: WorldSource }) {
  const groups: Array<[string, QuestView[]]> = [
    ['เควสต์หลัก', quests.filter((q) => q.kind === 'main')],
    ['เควสต์รอง', quests.filter((q) => q.kind === 'side')],
  ];
  return (
    <div className="col">
      {groups.map(([title, list]) => (
        <div key={title} className="col">
          <h4>{title}</h4>
          {list.map((q) => (
            <div key={q.id} className="recipe" data-testid={`quest-${q.id}`} data-state={q.state}>
              <div className="row between">
                <b>{q.name}</b>
                <span className="hint">
                  {QUEST_STATE[q.state]}
                  {q.state === 'locked' && q.levelReq > 1 ? ` (Lv.${q.levelReq})` : ''}
                </span>
              </div>
              <span className="hint">{q.description}</span>
              <span className="hint">{objectiveText(q)}</span>
              <span className="hint">
                รางวัล: EXP {q.rewards.xp} · Gold {q.rewards.gold}
                {(q.rewards.items ?? []).map((i) => ` · ${itemName(i.itemId)} x${i.quantity}`).join('')}
                {q.repeatable ? ' · ทำซ้ำได้' : ''}
              </span>
              <div className="row">
                {q.state === 'available' && (
                  <button
                    className="btn-primary small"
                    onClick={() => world.quest?.('accept', q.id)}
                    data-testid={`quest-accept-${q.id}`}
                  >
                    รับเควสต์
                  </button>
                )}
                {q.state === 'ready' && (
                  <button
                    className="btn-primary small"
                    onClick={() => world.quest?.('turnin', q.id)}
                    data-testid={`quest-turnin-${q.id}`}
                  >
                    ส่งเควสต์
                  </button>
                )}
                {(q.state === 'active' || q.state === 'ready') && (
                  <button className="btn-secondary small" onClick={() => world.quest?.('abandon', q.id)}>
                    ยกเลิก
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Small always-on tracker for active quests (top-right, under the minimap). */
export function QuestTracker({ hud }: { hud: HudSnapshot }) {
  const active = (hud.online?.quests ?? []).filter((q) => q.state === 'active' || q.state === 'ready');
  if (active.length === 0) return null;
  return (
    <div className="quest-tracker panel" data-testid="quest-tracker">
      <div className="panel-title">
        <span>📜 เควสต์</span>
      </div>
      {active.slice(0, 4).map((q) => (
        <div key={q.id} className="qt-row">
          <b>{q.name}</b>
          <span className="hint">{q.state === 'ready' ? 'กลับไปส่งที่ Quest Board' : objectiveText(q)}</span>
        </div>
      ))}
    </div>
  );
}

/** Party management + Party Finder (all rules enforced by the server). */
export function PartyPanel({
  hud,
  world,
  onClose,
}: {
  hud: HudSnapshot;
  world: WorldSource;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const o = hud.online;
  useEffect(() => {
    world.party?.('finder');
  }, [world]);
  if (!o) return null;
  const pt = o.party;
  const myName = hud.playerName;
  const iAmLeader = !!pt && pt.members.some((m) => m.leader && m.name === myName);
  return (
    <div className="panel side-panel party-panel" data-testid="party-panel">
      <div className="panel-title">
        <span>👥 ปาร์ตี้ {pt ? `(${pt.members.length}/4)` : ''}</span>
        <button className="x" onClick={onClose} aria-label="ปิด">
          ×
        </button>
      </div>
      {pt ? (
        <div className="col">
          {pt.members.map((m) => (
            <div key={m.charId} className="row between" data-testid={`party-member-${m.name}`}>
              <span>
                {m.leader ? '👑 ' : ''}
                {m.name} Lv.{m.level} {m.online ? '' : '(หลุด)'}
              </span>
              {iAmLeader && m.name !== myName && (
                <span className="row">
                  <button
                    className="btn-secondary small"
                    onClick={() => world.party?.('promote', { target: m.name })}
                  >
                    ตั้งหัวหน้า
                  </button>
                  <button
                    className="btn-secondary small"
                    onClick={() => world.party?.('kick', { target: m.name })}
                    data-testid={`party-kick-${m.name}`}
                  >
                    เตะ
                  </button>
                </span>
              )}
            </div>
          ))}
          <button
            className="btn-secondary small"
            onClick={() => world.party?.('leave')}
            data-testid="party-leave"
          >
            ออกจากปาร์ตี้
          </button>
          <span className="hint">
            แชทปาร์ตี้: พิมพ์ /p ข้อความ · EXP แชร์ให้สมาชิกใกล้ ๆ · ของดรอปเป็นของคนที่ช่วยตี
          </span>
        </div>
      ) : (
        <p className="hint">ยังไม่มีปาร์ตี้ — เชิญผู้เล่นหรือเข้าร่วมจาก Party Finder</p>
      )}
      {(!pt || iAmLeader) && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) world.party?.('invite', { target: name.trim() });
            setName('');
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อตัวละคร"
            maxLength={16}
            data-testid="party-invite-name"
          />
          <button className="btn-primary small" type="submit" data-testid="party-invite">
            เชิญ
          </button>
        </form>
      )}
      <h4>Party Finder</h4>
      {(!pt || iAmLeader) &&
        (pt?.listed ? (
          <button className="btn-secondary small" onClick={() => world.party?.('unlist')}>
            ปิดประกาศ ({pt.note})
          </button>
        ) : (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              world.party?.('list', { text: note });
              setNote('');
            }}
          >
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ข้อความประกาศหาทีม"
              maxLength={60}
              data-testid="finder-note"
            />
            <button className="btn-primary small" type="submit" data-testid="finder-post">
              ประกาศ
            </button>
          </form>
        ))}
      <button className="btn-secondary small" onClick={() => world.party?.('finder')}>
        รีเฟรชรายการ
      </button>
      {o.finder.length === 0 && <p className="hint">ยังไม่มีประกาศ</p>}
      {o.finder.map((l) => (
        <div key={l.id} className="row between" data-testid={`finder-${l.leader}`}>
          <span>
            {l.leader} Lv.{l.level} · {l.size}/{l.max} · {l.note}
          </span>
          {!pt && (
            <button
              className="btn-primary small"
              onClick={() => world.party?.('join', { id: l.id })}
              data-testid={`finder-join-${l.leader}`}
            >
              เข้าร่วม
            </button>
          )}
        </div>
      ))}
      <p className="hint">การเข้าดันเจี้ยนยังต้องคุยกับ Dungeon Gatekeeper ในเมือง (ไม่มีวาร์ปอัตโนมัติ)</p>
    </div>
  );
}

/** Always-on party frames + incoming invite prompt. */
export function PartyFrames({ hud, world }: { hud: HudSnapshot; world: WorldSource }) {
  const o = hud.online;
  if (!o) return null;
  const others = (o.party?.members ?? []).filter((m) => m.name !== hud.playerName);
  return (
    <>
      {o.partyInvite && (
        <div className="party-invite panel" data-testid="party-invite-prompt">
          <span>{o.partyInvite.from} ชวนคุณเข้าปาร์ตี้</span>
          <div className="row">
            <button
              className="btn-primary small"
              onClick={() => world.party?.('accept')}
              data-testid="party-accept"
            >
              ตอบรับ
            </button>
            <button className="btn-secondary small" onClick={() => world.party?.('decline')}>
              ปฏิเสธ
            </button>
          </div>
        </div>
      )}
      {others.length > 0 && (
        <div className="party-frames" data-testid="party-frames">
          {others.map((m) => (
            <div key={m.charId} className="pf panel">
              <span>
                {m.leader ? '👑' : ''}
                {m.name} Lv.{m.level}
                {m.map !== hud.mapId ? ' · ต่างแมพ' : ''}
                {m.online ? '' : ' · หลุด'}
              </span>
              <div className="bar-track">
                <div
                  className="bar-fill hp"
                  style={{ width: `${m.maxHp ? Math.max(0, (100 * (m.hp ?? 0)) / m.maxHp) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
