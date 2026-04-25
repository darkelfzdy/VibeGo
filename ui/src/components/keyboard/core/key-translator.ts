import type { KeyEvent } from "@/components/keyboard/core/types";

const SPECIAL_KEY_MAP: Record<string, string> = {
  Enter: "\r",
  Backspace: "\x7f",
  Delete: "\x1b[3~",
  Escape: "\x1b",
  Tab: "\t",
  ArrowUp: "\x1b[A",
  ArrowDown: "\x1b[B",
  ArrowRight: "\x1b[C",
  ArrowLeft: "\x1b[D",
  Home: "\x1b[H",
  End: "\x1b[F",
  PageUp: "\x1b[5~",
  PageDown: "\x1b[6~",
  Insert: "\x1b[2~",
  F1: "\x1bOP",
  F2: "\x1bOQ",
  F3: "\x1bOR",
  F4: "\x1bOS",
  F5: "\x1b[15~",
  F6: "\x1b[17~",
  F7: "\x1b[18~",
  F8: "\x1b[19~",
  F9: "\x1b[20~",
  F10: "\x1b[21~",
  F11: "\x1b[23~",
  F12: "\x1b[24~",
};

const CTRL_SPECIAL_MAP: Record<string, string> = {
  ArrowUp: "\x1b[1;5A",
  ArrowDown: "\x1b[1;5B",
  ArrowRight: "\x1b[1;5C",
  ArrowLeft: "\x1b[1;5D",
  Home: "\x1b[1;5H",
  End: "\x1b[1;5F",
};

const ALT_SPECIAL_MAP: Record<string, string> = {
  ArrowUp: "\x1b[1;3A",
  ArrowDown: "\x1b[1;3B",
  ArrowRight: "\x1b[1;3C",
  ArrowLeft: "\x1b[1;3D",
};

const SHIFT_SPECIAL_MAP: Record<string, string> = {
  ArrowUp: "\x1b[1;2A",
  ArrowDown: "\x1b[1;2B",
  ArrowRight: "\x1b[1;2C",
  ArrowLeft: "\x1b[1;2D",
  Home: "\x1b[1;2H",
  End: "\x1b[1;2F",
  Insert: "\x1b[2;2~",
  Delete: "\x1b[3;2~",
  PageUp: "\x1b[5;2~",
  PageDown: "\x1b[6;2~",
};

export type TranslatedAction =
  | { type: "input"; data: string }
  | { type: "copy" }
  | { type: "paste" }
  | { type: "cut" }
  | { type: "select" }
  | { type: "undo" }
  | { type: "clipboard" }
  | { type: "layout"; layout: string }
  | { type: "ui"; action: string }
  | { type: "none" };

const UI_KEYS = new Set(["Keyboard", "DismissKeyboard", "Emoji", "Settings", "Mic", "Fn"]);

export function translateKeyEvent(event: KeyEvent): TranslatedAction {
  const { value, ctrl, alt, shift, meta } = event;

  if (value === "Copy") return { type: "copy" };
  if (value === "Paste") return { type: "paste" };
  if (value === "Cut") return { type: "cut" };
  if (value === "Undo") return { type: "undo" };
  if (value === "Select") return { type: "select" };
  if (value === "Clipboard") return { type: "clipboard" };
  if (value === "123+") return { type: "layout", layout: "numpad" };
  if (UI_KEYS.has(value)) return { type: "ui", action: value };

  if (meta) return { type: "none" };

  if (event.type === "char") {
    let ch = value;
    if (ctrl && ch.length === 1) {
      const code = ch.toLowerCase().charCodeAt(0);
      if (code >= 97 && code <= 122) {
        return { type: "input", data: String.fromCharCode(code - 96) };
      }
    }
    if (alt && ch.length === 1) {
      return { type: "input", data: "\x1b" + ch };
    }
    return { type: "input", data: ch };
  }

  if (ctrl && CTRL_SPECIAL_MAP[value]) {
    return { type: "input", data: CTRL_SPECIAL_MAP[value] };
  }
  if (alt && ALT_SPECIAL_MAP[value]) {
    return { type: "input", data: ALT_SPECIAL_MAP[value] };
  }
  if (shift && SHIFT_SPECIAL_MAP[value]) {
    return { type: "input", data: SHIFT_SPECIAL_MAP[value] };
  }

  if (SPECIAL_KEY_MAP[value]) {
    return { type: "input", data: SPECIAL_KEY_MAP[value] };
  }

  if (value.length === 1) {
    return { type: "input", data: value };
  }

  return { type: "none" };
}
