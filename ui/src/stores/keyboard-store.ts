import { create } from "zustand";
import type { KeyEvent } from "@/components/keyboard/core/types";

export type KeyEventHandler = (event: KeyEvent) => boolean;

interface KeyboardState {
  useNativeKeyboard: boolean;
  setUseNativeKeyboard: (val: boolean) => void;
  handlers: KeyEventHandler[];
  registerHandler: (handler: KeyEventHandler) => () => void;
}

export const useKeyboardStore = create<KeyboardState>((set) => ({
  useNativeKeyboard: false,
  setUseNativeKeyboard: (useNativeKeyboard) => set({ useNativeKeyboard }),
  handlers: [],
  registerHandler: (handler) => {
    set((state) => ({ handlers: [...state.handlers, handler] }));
    return () => set((state) => ({ handlers: state.handlers.filter((h) => h !== handler) }));
  },
}));
