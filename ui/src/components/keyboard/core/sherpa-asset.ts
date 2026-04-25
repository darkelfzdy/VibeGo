import { getTranslation, type Locale } from "@/lib/i18n";
import { useSettingsStore } from "@/lib/settings";
import type { SherpaStatus } from "./sherpa-asr";

const DB_NAME = "VibeGoSpeechAssets";
const DB_VERSION = 3;
const STORE_NAME = "assets";
const CACHE_PREFIX = "vibego-speech-v3";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function getFromDB(key: string): Promise<ArrayBuffer | undefined> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } catch (e) {
    console.warn("Failed to read from IndexedDB", e);
    return undefined;
  }
}

async function saveToDB(key: string, data: ArrayBuffer): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(data, key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (e) {
    console.warn("Failed to write to IndexedDB", e);
  }
}

function formatMegabytes(value: number): string {
  return (value / 1048576).toFixed(1);
}

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

function assetLabel(label: string): string {
  if (label === "speech-engine") return t("settings.speech.assets.engine");
  if (label === "speech-model") return t("settings.speech.assets.model");
  return label;
}

export function getBinaryAssetCacheKey(version: string, label: string): string {
  return `${CACHE_PREFIX}-${label}-${version || "dev"}`;
}

export function getBinaryAssetCacheKeyForURL(version: string, label: string, url: string): string {
  return `${getBinaryAssetCacheKey(version, label)}-${url}`;
}

export async function hasBinaryAsset(version: string, label: string, url = ""): Promise<boolean> {
  const cached = await getFromDB(getBinaryAssetCacheKeyForURL(version, label, url));
  return !!cached;
}

export async function deleteSpeechAssets(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function deleteBinaryAsset(version: string, label: string, url: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(getBinaryAssetCacheKeyForURL(version, label, url));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function fetchBinaryAsset(
  url: string,
  version: string,
  label: string,
  onStatus?: (status: SherpaStatus, progress?: string) => void
): Promise<ArrayBuffer> {
  const cacheKey = getBinaryAssetCacheKeyForURL(version, label, url);
  const displayLabel = assetLabel(label);

  onStatus?.("loading", t("settings.speech.status.checkingCache", { label: displayLabel }));
  const cached = await getFromDB(cacheKey);
  if (cached) {
    onStatus?.("loading", t("settings.speech.status.loadingCachedAsset", { label: displayLabel }));
    return cached;
  }

  onStatus?.("loading", t("settings.speech.status.downloadingAsset", { label: displayLabel }));
  const assetUrl =
    version && version !== "dev" ? `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}` : url;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", assetUrl, true);
    xhr.responseType = "arraybuffer";

    xhr.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        const pct = (e.loaded / e.total) * 100;
        onStatus?.(
          "loading",
          t("settings.speech.status.downloadProgress", {
            label: displayLabel,
            percent: pct.toFixed(0),
            loaded: formatMegabytes(e.loaded),
            total: formatMegabytes(e.total),
          })
        );
      } else {
        onStatus?.(
          "loading",
          t("settings.speech.status.downloadLoaded", { label: displayLabel, loaded: formatMegabytes(e.loaded) })
        );
      }
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const contentType = xhr.getResponseHeader("content-type");
        if (contentType && contentType.includes("text/html")) {
          reject(new Error(t("settings.speech.errors.htmlInsteadBinary", { label: displayLabel })));
          return;
        }

        const buffer = xhr.response as ArrayBuffer;
        if (buffer && buffer.byteLength > 0) {
          await saveToDB(cacheKey, buffer);
          resolve(buffer);
        } else {
          reject(new Error(t("settings.speech.errors.emptyAsset", { label: displayLabel })));
        }
      } else {
        reject(
          new Error(
            t("settings.speech.errors.assetHttpFailed", {
              label: displayLabel,
              status: `${xhr.status} ${xhr.statusText}`,
            })
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error(t("settings.speech.errors.assetNetworkFailed", { label: displayLabel })));
    };

    xhr.send();
  });
}
