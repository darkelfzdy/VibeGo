const focusedTerminalIds = new Set<string>();

let unloadGuardUntil = 0;

export const setTerminalBrowserShortcutFocus = (terminalId: string, focused: boolean) => {
  if (focused) {
    focusedTerminalIds.add(terminalId);
    return;
  }
  focusedTerminalIds.delete(terminalId);
};

export const armTerminalBrowserUnloadGuard = (durationMs = 1500) => {
  unloadGuardUntil = Math.max(unloadGuardUntil, Date.now() + durationMs);
};

export const shouldBlockTerminalBrowserUnload = () => {
  return focusedTerminalIds.size > 0 || Date.now() < unloadGuardUntil;
};
