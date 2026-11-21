import type { ReactElement } from 'react';
import type { HotbarAction } from '../core/hotbar';

/** Placeholder vector skill icons (to be replaced by real art). */
const P: Partial<Record<HotbarAction, ReactElement>> = {
  basic: (
    <g>
      <path d="M6 26 L22 10 L25 7 L25 10 L10 26 Z" fill="#e6ecf5" />
      <path d="M5 23 L9 27" stroke="#f0c24b" strokeWidth="3" />
      <path d="M4 28 L6 26" stroke="#7a4a26" strokeWidth="3" />
    </g>
  ),
  skill1: (
    <g stroke="#d8f4ff" strokeWidth="2.4" fill="none" strokeLinecap="round">
      <path d="M6 10 Q16 4 26 12" />
      <path d="M5 17 Q16 11 27 19" />
      <path d="M6 24 Q16 18 26 26" stroke="#ffd24a" />
    </g>
  ),
  skill2: (
    <g>
      <path
        d="M16 4 L26 8 L25 18 Q22 25 16 28 Q10 25 7 18 L6 8 Z"
        fill="#5d5870"
        stroke="#c9c3e0"
        strokeWidth="1.5"
      />
      <path d="M17 5 L13 14 L18 16 L12 27" stroke="#ff8a3c" strokeWidth="2.6" fill="none" />
    </g>
  ),
  skill3: (
    <g>
      <path d="M8 24 L22 6" stroke="#e6ecf5" strokeWidth="3" />
      <path d="M24 24 L10 6" stroke="#ffd24a" strokeWidth="3" />
      <circle cx="16" cy="16" r="4" fill="none" stroke="#ffd24a" strokeWidth="1.5" />
    </g>
  ),
  dodge: (
    <g fill="none" strokeLinecap="round">
      <path d="M5 12 H20" stroke="#9fe8ff" strokeWidth="2.4" />
      <path d="M8 18 H24" stroke="#9b6cff" strokeWidth="2.4" />
      <path d="M5 24 H18" stroke="#9fe8ff" strokeWidth="2.4" />
      <path d="M22 8 L28 15 L22 22" stroke="#ffffff" strokeWidth="2" />
    </g>
  ),
  hpPotion: (
    <g>
      <rect x="13" y="4" width="6" height="5" fill="#c9b47c" />
      <path
        d="M11 9 H21 V13 Q27 17 24 24 Q16 31 8 24 Q5 17 11 13 Z"
        fill="#d23a4c"
        stroke="#ffd0d6"
        strokeWidth="1"
      />
    </g>
  ),
  powerToggle: <circle cx="16" cy="16" r="9" fill="none" stroke="#9b6cff" strokeWidth="3" />,
  guard: (
    <path
      d="M16 4 L26 8 L25 18 Q22 25 16 28 Q10 25 7 18 L6 8 Z"
      fill="#5d5870"
      stroke="#c9c3e0"
      strokeWidth="1.5"
    />
  ),
};

const POWER = (
  <path
    d="M16 4 C20 10 26 13 22 21 C20 26 12 27 10 21 C8 16 13 15 12 10 C15 12 15 8 16 4 Z"
    fill="#6c3fc4"
    opacity="0.8"
  />
);
const GENERIC = <rect x="8" y="8" width="16" height="16" rx="3" fill="#3a2a52" stroke="#6b5590" />;

export function SlotIcon({ action }: { action: HotbarAction }) {
  const content = P[action] ?? (action.startsWith('power') ? POWER : GENERIC);
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">
      {content}
    </svg>
  );
}
