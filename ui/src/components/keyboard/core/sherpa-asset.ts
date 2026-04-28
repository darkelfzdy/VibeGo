import type { SherpaStatus } from "./sherpa-asr";

const DB_NAME = "VibeGoSpeechAssets";
const DB_VERSION = 2;
const STORE_NAME = "assets";

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

export function getBinaryAssetCacheKey(version: string, label: string): string {
  return `vibego-speech-v2-${label}-${version || "dev"}`;
}

export async function hasBinaryAsset(version: string, label: string): Promise<boolean> {
  const cached = await getFromDB(getBinaryAssetCacheKey(version, label));
  return !!cached;
}

export async function fetchBinaryAsset(
  url: string,
  version: string,
  label: string,
  onStatus?: (status: SherpaStatus, progress?: string) => void
): Promise<ArrayBuffer> {
  const cacheKey = getBinaryAssetCacheKey(version, label);

  onStatus?.("loading", `Checking cache for ${label}...`);
  const cached = await getFromDB(cacheKey);
  if (cached) {
    onStatus?.("loading", `Loaded ${label} from local cache.`);
    return cached;
  }

  onStatus?.("loading", `Downloading ${label}...`);
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
          `${label} ${pct.toFixed(0)}% (${formatMegabytes(e.loaded)}/${formatMegabytes(e.total)}MB)`
        );
      } else {
        onStatus?.("loading", `${label} downloading... (${formatMegabytes(e.loaded)}MB)`);
      }
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const contentType = xhr.getResponseHeader("content-type");
        if (contentType && contentType.includes("text/html")) {
          reject(new Error(`Server returned HTML instead of binary file for ${label}. Check your proxy config.`));
          return;
        }

        const buffer = xhr.response as ArrayBuffer;
        if (buffer && buffer.byteLength > 0) {
          await saveToDB(cacheKey, buffer);
          resolve(buffer);
        } else {
          reject(new Error(`Downloaded ${label} is empty`));
        }
      } else {
        reject(new Error(`Failed to download ${label}: HTTP ${xhr.status} ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error(`Network error while downloading ${label}`));
    };

    xhr.send();
  });
}
