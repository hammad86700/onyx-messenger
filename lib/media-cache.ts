/**
 * Onyx Zero-Server-Load Local Media Caching Engine (WhatsApp-Style Device Persistence)
 * Stores binary Blobs in IndexedDB keyed by message_id and url.
 * Resolves media to local ObjectURLs (URL.createObjectURL(blob)) with 0 network requests on replay.
 */

const DB_NAME = 'onyx_media_cache_v2';
const DB_VERSION = 1;
const STORE_NAME = 'media_blobs';

const inMemoryUrlMap = new Map<string, string>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

export function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

/**
 * Request OS-level persistent browser storage so user's cached media is never pruned by the OS.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      return isPersisted;
    } catch (e) {
      console.warn('Storage persist request notice:', e);
    }
  }
  return false;
}

/**
 * Open or initialize IndexedDB for local device media caching.
 */
export function getMediaDatabase(): Promise<IDBDatabase | null> {
  if (!isIndexedDBAvailable()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('message_id', 'message_id', { unique: false });
          store.createIndex('url', 'url', { unique: false });
        }
      };

      request.onsuccess = () => {
        // Request storage persistence in the background
        requestPersistentStorage().catch(() => {});
        resolve(request.result);
      };

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

export interface CachedMediaRecord {
  key: string;
  message_id?: string;
  url: string;
  blob: Blob;
  mime_type: string;
  filename?: string;
  size: number;
  timestamp: number;
}

/**
 * Save a binary media Blob to local device IndexedDB storage.
 */
export async function saveMediaBlob(
  identifier: string,
  blob: Blob,
  remoteUrl?: string,
  filename?: string
): Promise<void> {
  if (!identifier || !blob) return;
  const db = await getMediaDatabase();
  if (!db) return;

  const primaryKey = identifier;
  const targetUrl = remoteUrl || (identifier.startsWith('http') ? identifier : '');
  const messageId = !identifier.startsWith('http') ? identifier : undefined;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record: CachedMediaRecord = {
        key: primaryKey,
        message_id: messageId,
        url: targetUrl,
        blob,
        mime_type: blob.type || 'application/octet-stream',
        filename,
        size: blob.size,
        timestamp: Date.now(),
      };

      store.put(record);

      // If both messageId and remoteUrl exist, also index by url for instant cross-lookup
      if (messageId && targetUrl && targetUrl !== primaryKey) {
        store.put({
          ...record,
          key: targetUrl,
        });
      }

      tx.oncomplete = () => {
        // Cache object URL in memory for 0ms synchronous access
        try {
          const objUrl = URL.createObjectURL(blob);
          inMemoryUrlMap.set(primaryKey, objUrl);
          if (targetUrl) inMemoryUrlMap.set(targetUrl, objUrl);
          if (messageId) inMemoryUrlMap.set(messageId, objUrl);
        } catch {}
        resolve();
      };

      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Retrieve a binary media Blob from local device IndexedDB storage.
 */
export async function getMediaBlob(identifier: string): Promise<Blob | null> {
  if (!identifier) return null;
  const db = await getMediaDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      // 1. Try direct primary key lookup
      const req = store.get(identifier);

      req.onsuccess = () => {
        if (req.result && req.result.blob) {
          resolve(req.result.blob as Blob);
          return;
        }

        // 2. Try index lookups if primary key didn't hit
        try {
          const urlIndex = store.index('url');
          const urlReq = urlIndex.get(identifier);
          urlReq.onsuccess = () => {
            if (urlReq.result && urlReq.result.blob) {
              resolve(urlReq.result.blob as Blob);
              return;
            }

            const msgIndex = store.index('message_id');
            const msgReq = msgIndex.get(identifier);
            msgReq.onsuccess = () => {
              if (msgReq.result && msgReq.result.blob) {
                resolve(msgReq.result.blob as Blob);
              } else {
                resolve(null);
              }
            };
            msgReq.onerror = () => resolve(null);
          };
          urlReq.onerror = () => resolve(null);
        } catch {
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
  messageId: string | undefined,
  remoteUrl: string | null
): Promise<string | null> {
  if (!remoteUrl) return null;

  // Already a local blob URL (e.g. optimistic send preview)
  if (remoteUrl.startsWith('blob:')) {
    return remoteUrl;
  }

  // 1. Check in-memory object URL cache
  if (messageId && inMemoryUrlMap.has(messageId)) {
    return inMemoryUrlMap.get(messageId)!;
  }
  if (inMemoryUrlMap.has(remoteUrl)) {
    return inMemoryUrlMap.get(remoteUrl)!;
  }

  // 2. Check local device IndexedDB storage
  const cachedBlob = (messageId ? await getMediaBlob(messageId) : null) || (await getMediaBlob(remoteUrl));
  if (cachedBlob) {
    const localUrl = URL.createObjectURL(cachedBlob);
    if (messageId) inMemoryUrlMap.set(messageId, localUrl);
    inMemoryUrlMap.set(remoteUrl, localUrl);
    return localUrl;
  }

  // 3. Concurrently fetch and cache binary blob in device storage
  try {
    fetch(remoteUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch media');
        return res.blob();
      })
      .then((blob) => {
        const id = messageId || remoteUrl;
        saveMediaBlob(id, blob, remoteUrl);
      })
      .catch(() => {});
  } catch {}

  return remoteUrl;
}

/**
 * Delete a media blob from local device storage.
 */
export async function deleteMediaBlob(identifier: string): Promise<void> {
  if (!identifier) return;

  const existingUrl = inMemoryUrlMap.get(identifier);
  if (existingUrl) {
    try {
      URL.revokeObjectURL(existingUrl);
    } catch {}
    inMemoryUrlMap.delete(identifier);
  }

  const db = await getMediaDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(identifier);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
