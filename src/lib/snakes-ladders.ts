// Core data + pure helpers for the Snakes & Ladders game.

export const BOARD_SIZE = 10;
export const LAST_SQUARE = 100;

/** ladder bottom -> top (Mapped exactly from your image_6.png) */
export const LADDERS: Record<number, number> = {
  9: 29,
  41: 62,
  70: 89,
  30: 69,
  26: 65,
  64: 96,
  80: 100,
  48: 67,
};

/** snake head -> tail (Mapped exactly from your image_6.png) */
export const SNAKES: Record<number, number> = {
  38: 18,
  87: 66,
  98: 78,
  93: 73,
  33: 8,
  45: 14,
  58: 25,
  21: 2,
};

export type PlayerColor = { id: string; from: string; to: string; ring: string };

export const PLAYER_COLORS: PlayerColor[] = [
  { id: "red", from: "#ff6b6b", to: "#c0392b", ring: "#ff8f8f" },
  { id: "blue", from: "#6bb8ff", to: "#1b64c0", ring: "#8fcaff" },
  { id: "green", from: "#7ce87c", to: "#1e8b3a", ring: "#a5f0a5" },
  { id: "yellow", from: "#ffe066", to: "#d19a00", ring: "#ffee9c" },
];

export type GamePlayer = {
  id: string;
  name: string;
  avatar: string;
  color: PlayerColor;
  isHuman: boolean;
  position: number; // 0 = not yet on the board
  score?: number;
  connected?: boolean;
  token_url?: string;
  kicked?: boolean;
};

/** Percentage coordinates (0-100) of the centre of a square, origin bottom-left. */
export function squareCenter(square: number): { x: number; y: number } {
  const n = Math.max(1, Math.min(LAST_SQUARE, square));
  const row = Math.floor((n - 1) / BOARD_SIZE);
  const idx = (n - 1) % BOARD_SIZE;
  // This correctly maps the exact zig-zag pattern of your board starting from bottom-right
  const col = row % 2 === 0 ? BOARD_SIZE - 1 - idx : idx;
  return { x: (col + 0.5) * 10, y: (row + 0.5) * 10 };
}

/** Applies the bounce-back rule at 100. */
export function nextPosition(from: number, roll: number): number {
  const target = from + roll;
  if (target <= LAST_SQUARE) return target;
  return LAST_SQUARE - (target - LAST_SQUARE);
}

/** Sequence of squares a token steps through. */
export function walkPath(from: number, roll: number): number[] {
  const path: number[] = [];
  let cur = from;
  let remaining = roll;
  let direction = 1;
  while (remaining > 0) {
    if (cur === LAST_SQUARE) direction = -1;
    cur += direction;
    path.push(cur);
    remaining--;
  }
  return path;
}

export function jumpFor(square: number): { to: number; kind: "ladder" | "snake" } | null {
  if (LADDERS[square]) return { to: LADDERS[square]!, kind: "ladder" };
  if (SNAKES[square]) return { to: SNAKES[square]!, kind: "snake" };
  return null;
}

export const BOT_NAMES = ["ئارام", "شیلان", "هێمن"];

export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));