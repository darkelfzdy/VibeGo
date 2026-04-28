export interface KeyRepeater {
  start: (action: () => void) => void;
  stop: () => void;
}

export function createKeyRepeater(delay = 400, interval = 60): KeyRepeater {
  let delayTimer: ReturnType<typeof setTimeout> | undefined;
  let intervalTimer: ReturnType<typeof setInterval> | undefined;

  function stop() {
    if (delayTimer) {
      clearTimeout(delayTimer);
      delayTimer = undefined;
    }
    if (intervalTimer) {
      clearInterval(intervalTimer);
      intervalTimer = undefined;
    }
  }

  function start(action: () => void) {
    stop();
    action();
    delayTimer = setTimeout(() => {
      intervalTimer = setInterval(action, interval);
    }, delay);
  }

  return { start, stop };
}
