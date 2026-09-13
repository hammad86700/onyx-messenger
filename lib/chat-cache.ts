import { Message } from '@/types/database';

const DB_NAME = 'onyx_chat_cache';
const DB_VERSION = 1;
const STORE_NAME = 'messages';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function isIndexedDBSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

/**
 * Open or initialize the IndexedDB instance
 */
function getDatabase(): Promise<IDBDatabase | null> {
  if (!isIndexedDBSupported()) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('conversation_id', 'conversation_id', { unique: false });
          store.createIndex('created_at', 'created_at', { unique: false });
          store.createIndex('conversation_created_at', ['conversation_id', 'created_at'], {
            unique: false,
          });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (err) => {
        console.warn('Failed to open IndexedDB for Onyx chat cache:', err);
        resolve(null);
      };

      request.onblocked = () => {
        console.warn('IndexedDB database upgrade blocked.');
        resolve(null);
      };
    } catch (e) {
      console.warn('IndexedDB error during initialization:', e);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Instantly get the most recent cached messages for a conversation (0ms latency).
 * Returns messages sorted in chronological order (oldest to newest).
 */
export async function getCachedMessages(
  conversationId: string,
  limit: number = 30
): Promise<Message[]> {
  const db = await getDatabase();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      if (store.indexNames.contains('conversation_created_at')) {
        const index = store.index('conversation_created_at');
        // Range bound strictly for this conversation
        const range = IDBKeyRange.bound(
          [conversationId, ''],
          [conversationId, '\uffff']
        );

        // Read in 'prev' direction to fetch the newest messages first
        const request = index.openCursor(range, 'prev');
        const results: Message[] = [];

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            // Reverse so they are chronological (ascending by created_at)
            resolve(results.reverse());
          }
        };

        request.onerror = () => resolve([]);
      } else {
        // Fallback using conversation_id index
        const index = store.index('conversation_id');
        const request = index.getAll(conversationId);

        request.onsuccess = () => {
          const all = (request.result as Message[]) || [];
          all.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          const slice = all.slice(-limit);
          resolve(slice);
        };

        request.onerror = () => resolve([]);
      }
    } catch (err) {
      console.warn('Error reading from IndexedDB:', err);
      resolve([]);
    }
  });
}

/**
 * Get older cached messages before a specific timestamp cursor.
 */
export async function getCachedMessagesBefore(
  conversationId: string,
  beforeCreatedAt: string,
  limit: number = 30
): Promise<Message[]> {
  const db = await getDatabase();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      if (store.indexNames.contains('conversation_created_at')) {
        const index = store.index('conversation_created_at');
        // Upper bound strictly before the given cursor
        const range = IDBKeyRange.bound(
          [conversationId, ''],
          [conversationId, beforeCreatedAt],
          false,
          true // Exclude upper bound
        );

        const request = index.openCursor(range, 'prev');
        const results: Message[] = [];

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results.reverse());
          }
        };

        request.onerror = () => resolve([]);
      } else {
        resolve([]);
      }
    } catch {
      resolve([]);
    }
  });
}

/**
 * Get the latest created_at timestamp among cached messages for a conversation
 */
export async function getLatestCachedTimestamp(conversationId: string): Promise<string | null> {
  const db = await getDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      if (store.indexNames.contains('conversation_created_at')) {
        const index = store.index('conversation_created_at');
        const range = IDBKeyRange.bound(
          [conversationId, ''],
          [conversationId, '\uffff']
        );
        const request = index.openCursor(range, 'prev');

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && cursor.value) {
            resolve(cursor.value.created_at || null);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => resolve(null);
      } else {
        resolve(null);
      }
    } catch {
      resolve(null);
    }
  });
}

/**
 * Save multiple messages to IndexedDB cache
 */
export async function saveCachedMessages(
  conversationId: string,
  messages: Message[]
): Promise<void> {
  if (!messages || messages.length === 0) return;
  const db = await getDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const msg of messages) {
        if (msg && msg.id) {
          // Normalize conversation_id
          const item = { ...msg, conversation_id: msg.conversation_id || conversationId };
          store.put(item);
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (err) {
      console.warn('Error saving messages to IndexedDB:', err);
      resolve();
    }
  });
}

/**
 * Save or update a single message in IndexedDB
 */
export async function saveCachedMessage(message: Message): Promise<void> {
  if (!message || !message.id) return;
  const db = await getDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(message);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Partially update a cached message (e.g. edit text, deletion, reaction toggle)
 */
export async function updateCachedMessage(
  messageId: string,
  partial: Partial<Message>
): Promise<void> {
  if (!messageId) return;
  const db = await getDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(messageId);

      getReq.onsuccess = () => {
        const existing = getReq.result as Message | undefined;
        if (existing) {
          const updated = { ...existing, ...partial };
          store.put(updated);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Remove a cached message from IndexedDB
 */
export async function deleteCachedMessage(messageId: string): Promise<void> {
  if (!messageId) return;
  const db = await getDatabase();
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

/**
 * Clear cached messages for a specific conversation
 */
export async function clearConversationCache(conversationId: string): Promise<void> {
  const db = await getDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('conversation_id');
      const request = index.openCursor(conversationId);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursor>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
