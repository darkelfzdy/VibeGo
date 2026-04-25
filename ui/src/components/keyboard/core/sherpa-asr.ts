import { type AsrInfo, type AsrSource, asrApi } from "@/api/asr";
import { getTranslation, type Locale } from "@/lib/i18n";
import { useSettingsStore } from "@/lib/settings";
import { fetchBinaryAsset, hasBinaryAsset } from "./sherpa-asset";

export type SherpaStatus = "idle" | "loading" | "recording" | "recognizing" | "error";
export type SherpaResultCallback = (text: string) => void;

declare global {
  interface Window {
    Module: any;
    createVad: any;
    CircularBuffer: any;
    OfflineRecognizer: any;
  }
}

const EXPECTED_SAMPLE_RATE = 16000;

let sherpaBase = "";
let sherpaVersion = "";
let sherpaWasmUrl = "";
let sherpaDataUrl = "";
let sherpaSources: AsrSource[] = [];
let selectedSpeechSource: AsrSource | null = null;
let selectedSpeechSourcePreference = "";
let moduleLoaded = false;
let moduleLoadingPromise: Promise<void> | null = null;
let binaryAssetsPromise: Promise<{ wasmBinary: ArrayBuffer; dataPackage: ArrayBuffer }> | null = null;
let loadError: string | null = null;
let assetInfoLoading: Promise<void> | null = null;

let vad: any = null;
let recognizer: any = null;

let audioCtx: AudioContext | null = null;
let mediaStreamNode: MediaStreamAudioSourceNode | null = null;
let recorder: ScriptProcessorNode | null = null;
let micStream: MediaStream | null = null;
let recordSampleRate = 0;

let recordedChunks: Float32Array[] = [];
let statusCb: ((status: SherpaStatus, progress?: string) => void) | null = null;

function currentLocale(): Locale {
  return ((useSettingsStore.getState().settings.locale || "zh") as Locale) === "en" ? "en" : "zh";
}

function t(key: string, vars?: Record<string, string>): string {
  let value = getTranslation(currentLocale(), key);
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, replacement);
    }
  }
  return value;
}

function sourceLabel(source: AsrSource): string {
  if (source.id === "official") return t("settings.speech.sources.official");
  if (source.id === "china") return t("settings.speech.sources.china");
  return source.label;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(t("settings.speech.errors.loadScriptFailed", { src })));
    document.head.appendChild(script);
  });
}

function withVersion(path: string): string {
  if (!sherpaVersion) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}v=${encodeURIComponent(sherpaVersion)}`;
}

function normalizeSource(source: AsrSource): AsrSource | null {
  const id = (source.id || "").trim().toLowerCase();
  const baseUrl = (source.baseUrl || "").trim();
  const wasmUrl = (source.wasmUrl || "").trim();
  const dataUrl = (source.dataUrl || "").trim();
  if (!id || !baseUrl || !wasmUrl || !dataUrl) return null;
  return {
    id,
    label: (source.label || id).trim(),
    region: source.region,
    baseUrl: baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    wasmUrl,
    dataUrl,
  };
}

function sourcesFromInfo(info: AsrInfo): AsrSource[] {
  const normalized = (info.sources || []).map(normalizeSource).filter((source): source is AsrSource => !!source);
  if (normalized.length > 0) return normalized;
  const fallback = normalizeSource({
    id: info.source || "official",
    label: "Official",
    baseUrl: info.baseUrl || "",
    wasmUrl: info.wasmUrl || "",
    dataUrl: info.dataUrl || "",
  });
  return fallback ? [fallback] : [];
}

function preferredSpeechSource(): string {
  return (useSettingsStore.getState().settings.speechAssetSource || "auto").trim().toLowerCase() || "auto";
}

async function ensureAssetInfo(): Promise<void> {
  if (sherpaSources.length > 0) return;
  if (assetInfoLoading) return assetInfoLoading;

  assetInfoLoading = (async () => {
    const info = await asrApi.info();
    if (!info.enabled) {
      throw new Error(info.message || t("settings.speech.errors.assetsUnavailable"));
    }
    sherpaSources = sourcesFromInfo(info);
    if (sherpaSources.length === 0) {
      throw new Error(info.message || t("settings.speech.errors.assetsUnavailable"));
    }
    sherpaVersion = info.version || "dev";
  })();

  try {
    await assetInfoLoading;
  } finally {
    assetInfoLoading = null;
  }
}

async function probeSource(source: AsrSource): Promise<number | null> {
  const url = withVersion(source.wasmUrl);
  const started = performance.now();
  if (await probeURL(url, "HEAD")) return performance.now() - started;
  if (await probeURL(url, "GET")) return performance.now() - started;
  return null;
}

async function probeURL(url: string, method: "HEAD" | "GET"): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method,
      headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    await res.body?.cancel();
    const contentType = res.headers.get("content-type") || "";
    return (res.ok || res.status === 206) && !contentType.includes("text/html");
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fastestSource(sources: AsrSource[]): Promise<AsrSource | null> {
  const results = await Promise.all(
    sources.map(async (source) => ({
      source,
      elapsed: await probeSource(source),
    }))
  );
  const available = results
    .filter((result): result is { source: AsrSource; elapsed: number } => result.elapsed !== null)
    .sort((a, b) => a.elapsed - b.elapsed);
  return available[0]?.source || null;
}

function applySpeechSource(source: AsrSource, preference: string) {
  selectedSpeechSource = source;
  selectedSpeechSourcePreference = preference;
  sherpaBase = source.baseUrl;
  sherpaWasmUrl = source.wasmUrl;
  sherpaDataUrl = source.dataUrl;
}

function localSpeechSource(preference: string): AsrSource | null {
  if (preference !== "auto") {
    const preferred = sherpaSources.find((source) => source.id === preference);
    if (preferred) return preferred;
  }
  return selectedSpeechSource || sherpaSources[0] || null;
}

async function ensureSelectedSource(
  onStatus?: (status: SherpaStatus, progress?: string) => void,
  failedSources = new Set<string>()
): Promise<AsrSource> {
  await ensureAssetInfo();
  const preference = preferredSpeechSource();
  if (
    selectedSpeechSource &&
    selectedSpeechSourcePreference === preference &&
    !failedSources.has(selectedSpeechSource.id)
  ) {
    return selectedSpeechSource;
  }

  const candidates = sherpaSources.filter((source) => !failedSources.has(source.id));
  if (candidates.length === 0) {
    throw new Error(t("settings.speech.errors.noSource"));
  }

  if (preference !== "auto") {
    const preferred = candidates.find((source) => source.id === preference);
    if (preferred) {
      onStatus?.("loading", t("settings.speech.status.checkingSource", { source: sourceLabel(preferred) }));
      if ((await probeSource(preferred)) !== null) {
        applySpeechSource(preferred, preference);
        return preferred;
      }
      failedSources.add(preferred.id);
    }
  }

  const remaining = sherpaSources.filter((source) => !failedSources.has(source.id));
  if (remaining.length === 0) {
    throw new Error(t("settings.speech.errors.noSource"));
  }

  onStatus?.("loading", t("settings.speech.status.selectingSource"));
  const fastest = await fastestSource(remaining);
  const selected = fastest || remaining[0];
  applySpeechSource(selected, preference);
  return selected;
}

export async function hasRequiredSpeechAssets(): Promise<boolean> {
  await ensureAssetInfo();
  const [hasWasm, hasData] = await Promise.all([
    hasBinaryAsset(sherpaVersion, "speech-engine"),
    hasBinaryAsset(sherpaVersion, "speech-model"),
  ]);
  return hasWasm && hasData;
}

export async function preloadSpeechAssets(onStatus?: (status: SherpaStatus, progress?: string) => void): Promise<void> {
  await ensureAssetInfo();
  await ensureBinaryAssets(onStatus);
}

function assignGlobals(code: string) {
  const script = document.createElement("script");
  script.textContent = code;
  document.head.appendChild(script);
  document.head.removeChild(script);
}

async function ensureBinaryAssets(
  onStatus?: (status: SherpaStatus, progress?: string) => void,
  failedSources = new Set<string>()
): Promise<{ wasmBinary: ArrayBuffer; dataPackage: ArrayBuffer }> {
  if (binaryAssetsPromise) return binaryAssetsPromise;

  binaryAssetsPromise = (async () => {
    await ensureAssetInfo();
    const preference = preferredSpeechSource();
    const cachedSource = localSpeechSource(preference);
    const [hasWasm, hasData] = await Promise.all([
      hasBinaryAsset(sherpaVersion, "speech-engine"),
      hasBinaryAsset(sherpaVersion, "speech-model"),
    ]);
    if (hasWasm && hasData && cachedSource && !failedSources.has(cachedSource.id)) {
      applySpeechSource(cachedSource, preference);
      const [wasmBinary, dataPackage] = await Promise.all([
        fetchBinaryAsset(cachedSource.wasmUrl, sherpaVersion, "speech-engine", onStatus),
        fetchBinaryAsset(cachedSource.dataUrl, sherpaVersion, "speech-model", onStatus),
      ]);
      return { wasmBinary, dataPackage };
    }

    let lastError: unknown = null;
    while (failedSources.size < sherpaSources.length) {
      const source = await ensureSelectedSource(onStatus, failedSources);
      try {
        const wasmBinary = await fetchBinaryAsset(source.wasmUrl, sherpaVersion, "speech-engine", onStatus);
        const dataPackage = await fetchBinaryAsset(source.dataUrl, sherpaVersion, "speech-model", onStatus);
        return { wasmBinary, dataPackage };
      } catch (e) {
        lastError = e;
        failedSources.add(source.id);
        selectedSpeechSource = null;
        onStatus?.("loading", t("settings.speech.status.sourceFailed", { source: sourceLabel(source) }));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(t("settings.speech.errors.downloadFailed"));
  })();

  try {
    return await binaryAssetsPromise;
  } finally {
    binaryAssetsPromise = null;
  }
}

function fileExists(filename: string): boolean {
  const M = window.Module;
  const len = M.lengthBytesUTF8(filename) + 1;
  const buf = M._malloc(len);
  M.stringToUTF8(filename, buf, len);
  const exists = M._SherpaOnnxFileExists(buf);
  M._free(buf);
  return exists === 1;
}

function initOfflineRecognizer() {
  const config: any = { modelConfig: { debug: 0, tokens: "./tokens.txt" } };
  if (fileExists("sense-voice.onnx")) {
    config.modelConfig.senseVoice = { model: "./sense-voice.onnx", useInverseTextNormalization: 1 };
  }
  recognizer = new window.OfflineRecognizer(config, window.Module);
}

export async function ensureLoaded(onStatus?: (status: SherpaStatus, progress?: string) => void): Promise<void> {
  if (moduleLoaded) return;
  if (moduleLoadingPromise) return moduleLoadingPromise;
  onStatus?.("loading", t("settings.speech.status.loadingModel"));

  loadError = null;
  moduleLoadingPromise = (async () => {
    const failedSources = new Set<string>();
    let lastError: unknown = null;
    try {
      await ensureAssetInfo();
      while (failedSources.size < sherpaSources.length) {
        try {
          const { wasmBinary, dataPackage } = await ensureBinaryAssets(onStatus, failedSources);
          window.Module = {
            wasmBinary,
            getPreloadedPackage: () => dataPackage,
            locateFile: (path: string) => {
              if (path.endsWith(".wasm")) return withVersion(sherpaWasmUrl);
              if (path.endsWith(".data")) return withVersion(sherpaDataUrl);
              return withVersion(sherpaBase + path);
            },
            setStatus(status: string) {
              if (status === "Running...") {
                onStatus?.("loading", t("settings.speech.status.initializing"));
              }
            },
            onRuntimeInitialized() {
              vad = window.createVad(window.Module);
              initOfflineRecognizer();
              moduleLoaded = true;
            },
          };

          await loadScript(withVersion(sherpaBase + "sherpa-onnx-vad.js"));
          assignGlobals("window.createVad = createVad; window.CircularBuffer = CircularBuffer;");
          await loadScript(withVersion(sherpaBase + "sherpa-onnx-asr.js"));
          assignGlobals("window.OfflineRecognizer = OfflineRecognizer;");
          await loadScript(withVersion(sherpaBase + "sherpa-onnx-wasm-main-vad-asr.js"));

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              if (!moduleLoaded) {
                loadError = t("settings.speech.errors.timeout");
                reject(new Error(loadError));
              }
            }, 300000);
            const check = setInterval(() => {
              if (moduleLoaded) {
                clearInterval(check);
                clearTimeout(timeout);
                resolve();
              }
            }, 100);
          });
          return;
        } catch (e) {
          lastError = e;
          if (selectedSpeechSource) {
            failedSources.add(selectedSpeechSource.id);
            onStatus?.(
              "loading",
              t("settings.speech.status.sourceFailed", { source: sourceLabel(selectedSpeechSource) })
            );
          }
          selectedSpeechSource = null;
          moduleLoaded = false;
          vad = null;
          recognizer = null;
        }
      }
      loadError = lastError instanceof Error ? lastError.message : t("settings.speech.errors.loadModelFailed");
      throw lastError instanceof Error ? lastError : new Error(loadError);
    } finally {
      moduleLoadingPromise = null;
    }
  })();

  return moduleLoadingPromise;
}

function downsample(buf: Float32Array, target: number): Float32Array {
  if (target === recordSampleRate) return buf;
  const ratio = recordSampleRate / target;
  const len = Math.round(buf.length / ratio);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const next = Math.round((i + 1) * ratio);
    let s = 0,
      c = 0;
    for (let j = Math.round(i * ratio); j < next && j < buf.length; j++) {
      s += buf[j];
      c++;
    }
    out[i] = s / c;
  }
  return out;
}

function mergeRecognizedText(parts: string[]): string {
  let merged = "";

  for (const part of parts) {
    if (!part) continue;
    if (!merged) {
      merged = part;
      continue;
    }

    if (merged.endsWith(part)) continue;

    const maxOverlap = Math.min(merged.length, part.length);
    let overlap = 0;
    for (let size = maxOverlap; size > 0; size--) {
      if (merged.endsWith(part.slice(0, size))) {
        overlap = size;
        break;
      }
    }

    merged += part.slice(overlap);
  }

  return merged;
}

function recognizeAudio(samples: Float32Array): string {
  if (!vad || !recognizer) return "";

  const circularBuffer = new window.CircularBuffer(samples.length + 1024, window.Module);
  circularBuffer.push(samples);

  const results: string[] = [];

  while (circularBuffer.size() > vad.config.sileroVad.windowSize) {
    const s = circularBuffer.get(circularBuffer.head(), vad.config.sileroVad.windowSize);
    vad.acceptWaveform(s);
    circularBuffer.pop(vad.config.sileroVad.windowSize);

    while (!vad.isEmpty()) {
      const seg = vad.front();
      vad.pop();
      const stream = recognizer.createStream();
      stream.acceptWaveform(EXPECTED_SAMPLE_RATE, seg.samples);
      recognizer.decode(stream);
      const r = recognizer.getResult(stream);
      stream.free();
      const t = r.text?.trim();
      if (t) results.push(t);
    }
  }

  vad.flush();
  while (!vad.isEmpty()) {
    const seg = vad.front();
    vad.pop();
    const stream = recognizer.createStream();
    stream.acceptWaveform(EXPECTED_SAMPLE_RATE, seg.samples);
    recognizer.decode(stream);
    const r = recognizer.getResult(stream);
    stream.free();
    const t = r.text?.trim();
    if (t) results.push(t);
  }

  vad.reset();
  circularBuffer.free();
  return mergeRecognizedText(results);
}

export async function startRecording(onStatus: (status: SherpaStatus, progress?: string) => void): Promise<void> {
  statusCb = onStatus;

  try {
    await ensureLoaded(onStatus);
  } catch (e) {
    onStatus("error", (e as Error).message || t("settings.speech.errors.loadModelFailed"));
    statusCb = null;
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStream = stream;
    recordedChunks = [];

    if (!audioCtx) {
      audioCtx = new AudioContext({ sampleRate: EXPECTED_SAMPLE_RATE });
    }
    recordSampleRate = audioCtx.sampleRate;
    mediaStreamNode = audioCtx.createMediaStreamSource(stream);
    recorder = audioCtx.createScriptProcessor(4096, 1, 2);

    recorder.onaudioprocess = (e) => {
      const raw = new Float32Array(e.inputBuffer.getChannelData(0));
      recordedChunks.push(downsample(raw, EXPECTED_SAMPLE_RATE));
    };

    mediaStreamNode.connect(recorder);
    recorder.connect(audioCtx.destination);
    onStatus("recording");
  } catch {
    onStatus("error", t("settings.speech.errors.microphoneDenied"));
    statusCb = null;
  }
}

function stopCapture() {
  if (recorder && audioCtx) {
    try {
      recorder.disconnect(audioCtx.destination);
    } catch {}
    try {
      mediaStreamNode?.disconnect(recorder);
    } catch {}
    recorder = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

export function cancelRecording(): void {
  stopCapture();
  recordedChunks = [];
  statusCb?.("idle");
  statusCb = null;
}

export function stopAndRecognize(): string {
  stopCapture();

  if (recordedChunks.length === 0) {
    statusCb?.("idle");
    statusCb = null;
    return "";
  }

  statusCb?.("recognizing");

  let total = 0;
  for (const c of recordedChunks) total += c.length;
  const merged = new Float32Array(total);
  let off = 0;
  for (const c of recordedChunks) {
    merged.set(c, off);
    off += c.length;
  }
  recordedChunks = [];

  const text = recognizeAudio(merged);
  statusCb?.("idle");
  statusCb = null;
  return text;
}

export function isLoaded(): boolean {
  return moduleLoaded;
}

export function isLoading(): boolean {
  return moduleLoadingPromise !== null;
}
