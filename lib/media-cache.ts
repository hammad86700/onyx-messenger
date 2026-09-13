/**
 * Local-Device Media Caching (WhatsApp Model) for Onyx.
 * Stores binary Blobs in IndexedDB keyed by message_id.
 * Resolves media to local ObjectURLs (URL.createObjectURL(blob)) with 0 network requests on replay.
 */

const DB_NAME = 'onyx_media_cache';
const DB_VERSION = 1;
const STORE_NAME = 'media_blobs';

const inMemoryUrlMap = new Map<string, string>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function getMediaDatabase(): Promise<IDBDatabase | null> {
  if (!isIndexedDBAvailable()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'message_id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => {
        console.warn('Failed to open media cache IndexedDB:', e);
        resolve(null);
      };
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Save a binary media Blob to local device IndexedDB storage
 */
export async function saveMediaBlob(messageId: string, blob: Blob): Promise<void> {
  if (!messageId || !blob) return;
  const db = await getMediaDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        message_id: messageId,
        blob,
        mime_type: blob.type,
        timestamp: Date.now(),
      });
      tx.oncomplete = () => {
        // Cache object URL in memory
        const objUrl = URL.createObjectURL(blob);
        inMemoryUrlMap.set(messageId, objUrl);
        resolve();
      };
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Retrieve a binary media Blob from local device IndexedDB storage
 */
export async function getMediaBlob(messageId: string): Promise<Blob | null> {
  if (!messageId) return null;
  const db = await getMediaDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(messageId);

      req.onsuccess = () => {
        if (req.result && req.result.blob) {
          resolve(req.result.blob as Blob);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Resolve a media URL locally using WhatsApp-style offline-first caching.
 * 1. Checks in-memory object URL cache (0ms).
 * 2. Checks local IndexedDB storage for binary Blob (0 network calls).
 * 3. If missing, downloads binary Blob in background and persists to IndexedDB.
 */
export async function resolveLocalMediaUrl(
  messageId: string,
  remoteUrl: string | null
): Promise<string | null> {
  if (!remoteUrl) return null;

  // Already a local blob URL (e.g. optimistic send preview)
  if (remoteUrl.startsWith('blob:')) {
    return remoteUrl;
  }

  // 1. Check in-memory object URL cache
  const memoryCached = inMemoryUrlMap.get(messageId);
  if (memoryCached) {
    return memoryCached;
  }

  // 2. Check local device IndexedDB
  const cachedBlob = await getMediaBlob(messageId);
  if (cachedBlob) {
    const localUrl = URL.createObjectURL(cachedBlob);
    inMemoryUrlMap.set(messageId, localUrl);
    return localUrl;
  }

  // 3. Concurrently fetch and cache binary blob in the background
  try {
    fetch(remoteUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch media');
        return res.blob();
      })
      .then((blob) => {
        saveMediaBlob(messageId, blob);
      })
      .catch(() => {});
  } catch {
    // Return remoteUrl fallback
  }

  return remoteUrl;
}

/**
 * Delete a media blob from local device storage
 */
export async function deleteMediaBlob(messageId: string): Promise<void> {
  if (!messageId) return;

  const existingUrl = inMemoryUrlMap.get(messageId);
  if (existingUrl) {
    URL.revokeObjectURL(existingUrl);
    inMemoryUrlMap.delete(messageId);
  }

  const db = await getMediaDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(messageId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
