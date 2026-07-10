/**
 * Minimal Promise-based wrapper around the browser IndexedDB API.
 *
 * This module is browser-only. Every exported function guards against
 * server-side rendering and environments without IndexedDB support by
 * resolving with a safe fallback instead of throwing.
 */

const DB_NAME = "avatarstudio";
const DB_VERSION = 1;

export const PROJECTS_STORE = "projects";
export const DRAFTS_STORE = "drafts";

let dbPromise: Promise<IDBDatabase> | null = null;

/** Returns true when running in a browser with IndexedDB available. */
function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

/**
 * Opens (and caches) the connection to the "avatarstudio" database,
 * creating the "projects" and "drafts" object stores on first use.
 */
function openDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }

  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          db.createObjectStore(PROJECTS_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
          db.createObjectStore(DRAFTS_STORE, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
}

/** Reads every record from the given object store. Resolves to [] when IndexedDB is unavailable. */
export async function idbGetAll<T>(store: string): Promise<T[]> {
  if (!isIndexedDbAvailable()) return [];

  try {
    const db = await openDb();
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const request = tx.objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

/** Reads a single record by key from the given object store. Resolves to undefined when unavailable or missing. */
export async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  if (!isIndexedDbAvailable()) return undefined;

  try {
    const db = await openDb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const request = tx.objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  }
}

/** Writes (creates or updates) a record in the given object store. No-op when IndexedDB is unavailable. */
export async function idbPut<T>(store: string, value: T): Promise<void> {
  if (!isIndexedDbAvailable()) return;

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const request = tx.objectStore(store).put(value);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // fail soft
  }
}

/** Deletes a record by key from the given object store. No-op when IndexedDB is unavailable. */
export async function idbDelete(store: string, key: string): Promise<void> {
  if (!isIndexedDbAvailable()) return;

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const request = tx.objectStore(store).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // fail soft
  }
}

/** Removes every record from the given object store. No-op when IndexedDB is unavailable. */
export async function idbClear(store: string): Promise<void> {
  if (!isIndexedDbAvailable()) return;

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const request = tx.objectStore(store).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // fail soft
  }
}
