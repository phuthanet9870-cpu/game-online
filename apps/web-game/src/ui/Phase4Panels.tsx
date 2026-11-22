import { useEffect, useState, useSyncExternalStore } from 'react';
import { CONTENT, itemName } from '../core/content';
import type { WorldSource } from '../core/worldSource';
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
      {!['merchant', 'storage', 'trial'].includes(open.npc) && (
        <p className="hint">บริการนี้กำลังพัฒนาใน Phase 4 (เควสต์ / ดันเจี้ยน / อารีน่า / ตีบวก)</p>
      )}
    </div>
  );
}
