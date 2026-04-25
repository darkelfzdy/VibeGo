import type { LayoutDef } from "@/components/keyboard/core/types";

export const KEYBOARD_QWERTY: LayoutDef = {
  name: "Keyboard QWERTY",
  rows: [
    {
      keys: [
        { id: "q", label: "q", value: "q", type: "char", sub: { nw: "F1", ne: "Escape", sw: "!", se: "1" } },
        { id: "w", label: "w", value: "w", type: "char", sub: { nw: "F2", ne: "~", sw: "@", se: "2" } },
        { id: "e", label: "e", value: "e", type: "char", sub: { nw: "F3", ne: "`", sw: "#", se: "3" } },
        { id: "r", label: "r", value: "r", type: "char", sub: { nw: "F4", ne: "^", sw: "$", se: "4" } },
        { id: "t", label: "t", value: "t", type: "char", sub: { nw: "F5", ne: "%", sw: "&", se: "5" } },
        { id: "y", label: "y", value: "y", type: "char", sub: { nw: "F6", ne: "(", sw: ")", se: "6" } },
        { id: "u", label: "u", value: "u", type: "char", sub: { nw: "F7", ne: "<", sw: ">", se: "7" } },
        { id: "i", label: "i", value: "i", type: "char", sub: { nw: "F8", ne: "{", sw: "}", se: "8" } },
        { id: "o", label: "o", value: "o", type: "char", sub: { nw: "F9", ne: "[", sw: "]", se: "9" } },
        { id: "p", label: "p", value: "p", type: "char", sub: { nw: "F10", ne: "\\", sw: "|", se: "0" } },
      ],
    },
    {
      keys: [
        { id: "a", label: "a", value: "a", type: "char", sub: { nw: "Tab", se: "Caps" } },
        { id: "s", label: "s", value: "s", type: "char", sub: { ne: "-", sw: "_" } },
        { id: "d", label: "d", value: "d", type: "char", sub: { ne: "/" } },
        { id: "f", label: "f", value: "f", type: "char", sub: { ne: "?" } },
        { id: "g", label: "g", value: "g", type: "char", sub: { ne: "*" } },
        { id: "h", label: "h", value: "h", type: "char", sub: { ne: "=", sw: "+" } },
        { id: "j", label: "j", value: "j", type: "char", sub: { ne: ":", sw: ";", se: "PageUp" } },
        { id: "k", label: "k", value: "k", type: "char", sub: { nw: "F11", ne: '"', sw: "'", se: "Home" } },
        { id: "l", label: "l", value: "l", type: "char", sub: { nw: "F12", ne: "DismissKeyboard", se: "Insert" } },
      ],
    },
    {
      keys: [
        {
          id: "shift",
          label: "⇧",
          value: "Shift",
          type: "modifier",
          width: 1.5,
          sub: { ne: "SelectAll", se: "Select" },
        },
        { id: "z", label: "z", value: "z", type: "char", sub: { se: "Undo" } },
        { id: "x", label: "x", value: "x", type: "char", sub: { se: "Cut" } },
        { id: "c", label: "c", value: "c", type: "char", sub: { sw: ",", se: "Copy" } },
        { id: "v", label: "v", value: "v", type: "char", sub: { sw: ".", se: "Paste" } },
        { id: "b", label: "b", value: "b", type: "char" },
        { id: "n", label: "n", value: "n", type: "char", sub: { se: "PageDown" } },
        { id: "m", label: "m", value: "m", type: "char", sub: { se: "End" } },
        { id: "bksp", label: "⌫", value: "Backspace", type: "action", width: 1.5, sub: { se: "Delete" } },
      ],
    },
    {
      keys: [
        {
          id: "ctrl",
          label: "Ctrl",
          value: "Ctrl",
          type: "modifier",
          width: 1.5,
          sub: { nw: "Meta", se: "Clipboard" },
        },
        { id: "alt", label: "Alt", value: "Alt", type: "modifier", width: 1, sub: { nw: "Fn", se: "Emoji" } },
        { id: "keyboard", label: "Keyboard", value: "Keyboard", type: "action", width: 1 },
        { id: "space", label: " ", value: " ", type: "char", width: 3.5, slider: "horizontal", sub: { s: "Mic" } },
        {
          id: "arrows",
          label: " ",
          value: "",
          type: "action",
          width: 1.5,
          sub: { n: "ArrowUp", s: "ArrowDown", w: "ArrowLeft", e: "ArrowRight" },
        },
        { id: "enter", label: "↵", value: "Enter", type: "action", width: 1.5 },
      ],
    },
  ],
};
