export type KeyType = "char" | "modifier" | "action";

export interface SubKeys {
  nw?: string;
  n?: string;
  ne?: string;
  w?: string;
  e?: string;
  sw?: string;
  s?: string;
  se?: string;
}

export interface KeyDef {
  id: string;
  label: string;
  value: string;
  type: KeyType;
  width?: number;
  sub?: SubKeys;
  slider?: "horizontal";
}

export interface RowDef {
  keys: KeyDef[];
  height?: number;
}

export interface LayoutDef {
  name: string;
  rows: RowDef[];
}

export interface KeyEvent {
  type: "char" | "key";
  value: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  select: boolean;
  fn: boolean;
}

export interface ModifierState {
  active: boolean;
  locked: boolean;
}

export interface ModifiersState {
  ctrl: ModifierState;
  alt: ModifierState;
  shift: ModifierState;
  meta: ModifierState;
  select: ModifierState;
  fn: ModifierState;
}

export const SPECIAL_KEYS = new Set([
  "Escape",
  "Enter",
  "Tab",
  "Backspace",
  "Delete",
  "Insert",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  "Ctrl",
  "Alt",
  "Shift",
  "Meta",
  "Mic",
  "Keyboard",
  "DismissKeyboard",
  "Emoji",
  "Clipboard",
  "Select",
  "SelectAll",
  "Undo",
  "Cut",
  "Copy",
  "Paste",
  "Fn",
  "Caps",
]);

export const MODIFIER_KEYS = new Set(["Ctrl", "Alt", "Shift", "Meta", "Select", "Fn"]);

export const SWIPE_DIRS = ["nw", "n", "ne", "w", "e", "sw", "s", "se"] as const;
export type SwipeDir = (typeof SWIPE_DIRS)[number];

export function getSwipeDirection(
  dx: number,
  dy: number,
  threshold: number,
  availableDirs?: SwipeDir[]
): SwipeDir | null {
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < threshold) return null;
  const angle = Math.atan2(dy, dx);

  if (!availableDirs || availableDirs.length === 0) {
    const sector = Math.round(angle / (Math.PI / 4));
    const normalized = ((sector % 8) + 8) % 8;
    const dirs: SwipeDir[] = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];
    return dirs[normalized];
  }

  const dirAngles: { [key in SwipeDir]: number } = {
    e: 0,
    se: Math.PI / 4,
    s: Math.PI / 2,
    sw: (3 * Math.PI) / 4,
    w: Math.PI,
    nw: (-3 * Math.PI) / 4,
    n: -Math.PI / 2,
    ne: -Math.PI / 4,
  };

  let closestDir: SwipeDir | null = null;
  let minDiff = Infinity;

  for (const dir of availableDirs) {
    const targetAngle = dirAngles[dir];
    let diff = Math.abs(angle - targetAngle) % (2 * Math.PI);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;

    if (diff < minDiff) {
      minDiff = diff;
      closestDir = dir;
    }
  }

  if (closestDir && minDiff <= Math.PI / 2 + 0.01) {
    return closestDir;
  }

  const sector = Math.round(angle / (Math.PI / 4));
  const normalized = ((sector % 8) + 8) % 8;
  const dirs: SwipeDir[] = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];
  return dirs[normalized];
}

export function isSpecialKey(value: string): boolean {
  return SPECIAL_KEYS.has(value);
}
