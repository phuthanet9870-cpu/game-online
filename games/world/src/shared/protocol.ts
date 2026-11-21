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

export interface JoinOptions {
  name?: string;
}
