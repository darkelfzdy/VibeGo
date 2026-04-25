const TERMINAL_FONT_FAMILIES: Record<string, string> = {
  default: "Menlo, Monaco, 'Courier New', monospace",
  "jetbrains-mono": '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  "system-mono": "var(--font-mono)",
};

export function getTerminalFontFamily(value?: string): string {
  return TERMINAL_FONT_FAMILIES[value || "default"] || TERMINAL_FONT_FAMILIES.default;
}
