import { useSettingsStore } from "@/lib/settings";

type SoundType = "click" | "delete" | "modifier";

const SOUND_URLS: Record<SoundType, string> = {
  click: "/sounds/key_press_click.m4a",
  delete: "/sounds/key_press_delete.m4a",
  modifier: "/sounds/key_press_modifier.m4a",
};

let audioCtx: AudioContext | null = null;
const bufferCache = new Map<SoundType, AudioBuffer>();
let loadingPromise: Promise<void> | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

async function loadBuffers() {
  const ctx = getAudioCtx();
  const entries = Object.entries(SOUND_URLS) as [SoundType, string][];
  await Promise.all(
    entries.map(async ([type, url]) => {
      if (bufferCache.has(type)) return;
      try {
        const res = await fetch(url);
        const arrayBuf = await res.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        bufferCache.set(type, audioBuf);
      } catch {}
    })
  );
}

function ensureLoaded() {
  if (!loadingPromise) {
    loadingPromise = loadBuffers();
  }
}

function playSound(type: SoundType) {
  const ctx = getAudioCtx();
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  const buffer = bufferCache.get(type);
  if (!buffer) return;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = 0.3;
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(0);
}

export function keyFeedback(keyValue: string, keyType: string) {
  ensureLoaded();
  const settings = useSettingsStore.getState().settings;

  if (settings.keyboardHaptic !== "false") {
    if (navigator.vibrate) {
      navigator.vibrate(12);
    }
  }

  if (settings.keyboardSound !== "false") {
    if (keyValue === "Backspace" || keyValue === "Delete") {
      playSound("delete");
    } else if (
      keyType === "modifier" ||
      keyValue === "Shift" ||
      keyValue === "Ctrl" ||
      keyValue === "Alt" ||
      keyValue === "Meta"
    ) {
      playSound("modifier");
    } else {
      playSound("click");
    }
  }
}
