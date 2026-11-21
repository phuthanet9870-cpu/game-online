/** Client → server messages. */
export interface MoveMessage {
  x: number;
  y: number;
}
export interface ChatMessage {
  text: string;
}

/** Server → client broadcast for a chat line. */
export interface ChatBroadcast {
  sessionId: string;
  name: string;
  text: string;
}


export interface WorldJoinOptions {
  characterId: number;
}

export interface AttackMessage { id: string }
export interface PickupMessage { id: string }

/** Server → client, once per tick, only to players near where the hits happened. */
export interface HitEvent {
  /** Attacker id: a player session id or a monster id. */
  from: string;
  to: string;
  damage: number;
  miss: boolean;
}

export interface InventoryEntry { item: string; amount: number }
/** Server → client: the full bag, sent on join and after every change. */
export interface InventoryMessage { items: InventoryEntry[] }
/** Server → client: a short line for the chat log. */
export interface NoticeMessage { text: string }
