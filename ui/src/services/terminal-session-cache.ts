export type TerminalLifecycleState = "hydrating" | "replaying" | "live" | "reconnecting" | "exited";

export interface TerminalSessionCache {
  terminalId: string;
  serialized: string;
  cursor: number;
  cols: number;
  rows: number;
  status: string;
  updatedAt: number;
}

const DB_NAME = "VibeGoTerminalCache";
const DB_VERSION = 1;
const STORE_NAME = "terminal_sessions";

function canUseIndexedDB(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!canUseIndexedDB()) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "terminalId" });
      }
    };
  });
}

export async function readTerminalSessionCache(terminalId: string): Promise<TerminalSessionCache | null> {
  if (!terminalId || !canUseIndexedDB()) {
    return null;
  }
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(terminalId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as TerminalSessionCache | undefined) ?? null);
    });
  } catch {
    return null;
  }
}

export async function writeTerminalSessionCache(cache: TerminalSessionCache): Promise<void> {
  if (!cache.terminalId || !canUseIndexedDB()) {
    return;
  }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(cache);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch {}
}

export async function deleteTerminalSessionCache(terminalId: string): Promise<void> {
  if (!terminalId || !canUseIndexedDB()) {
    return;
  }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(terminalId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch {}
}
