// Onyx Media Storage & Auto-Download Engine (WhatsApp-Style Device Persistence)

export interface MediaStorageSettings {
  autoDownloadPhotos: boolean;
  autoDownloadAudio: boolean;
  autoDownloadVideos: boolean;
  autoDownloadDocs: boolean;
  saveToDeviceStorage: boolean;
}

const DEFAULT_SETTINGS: MediaStorageSettings = {
  autoDownloadPhotos: true,
  autoDownloadAudio: true,
  autoDownloadVideos: true,
  autoDownloadDocs: true,
  saveToDeviceStorage: true,
};

const SETTINGS_KEY = 'onyx_media_storage_settings';
const DB_NAME = 'onyx_media_cache';
const STORE_NAME = 'media_blobs';

/**
 * Retrieve user's auto-download settings from localStorage.
 */
export function getStorageSettings(): MediaStorageSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save user's auto-download settings.
 */
export function saveStorageSettings(settings: Partial<MediaStorageSettings>): MediaStorageSettings {
  const current = getStorageSettings();
  const updated = { ...current, ...settings };
  if (typeof window !== 'undefined') {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  }
  return updated;
}

/**
 * Request persistent browser storage so cache is never purged by the OS.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      return isPersisted;
    } catch (e) {
      console.warn('Storage persist request failed:', e);
    }
  }
  return false;
}

/**
 * Open IndexedDB for offline media caching.
 */
function openMediaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Cache a media blob into IndexedDB.
 */
export async function cacheMediaBlob(url: string, blob: Blob, filename: string): Promise<void> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({
        url,
        blob,
        filename,
        timestamp: Date.now(),
        size: blob.size,
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB cacheMediaBlob failed:', err);
  }
}

/**
 * Retrieve a cached media blob from IndexedDB.
 */
export async function getCachedMediaBlob(url: string): Promise<Blob | null> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(url);
      req.onsuccess = () => resolve(req.result?.blob || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Save / Download a media file directly to the user's mobile device or desktop storage.
 */
export async function saveMediaToDevice(
  url: string,
  preferredFilename?: string,
  mimeType?: string
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    // 1. Check local IndexedDB cache first
    let blob = await getCachedMediaBlob(url);

    // 2. If not cached, fetch from network
    if (!blob) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      blob = await res.blob();
      // Cache for future instant access
      if (preferredFilename) {
        await cacheMediaBlob(url, blob, preferredFilename);
      }
    }

    const filename =
      preferredFilename ||
      url.split('/').pop()?.split('?')[0] ||
      `onyx_media_${Date.now()}.${mimeType ? mimeType.split('/')[1] : 'bin'}`;

    // 3. Fallback to HTML5 anchor blob download (supported on all mobile & desktop browsers)
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 1500);

    return true;
  } catch (err) {
    console.error('Save media to device error:', err);
    // Ultimate fallback: open URL in new window
    window.open(url, '_blank');
    return false;
  }
}

/**
 * Check whether an incoming media message should auto-download to device storage.
 */
export async function handleIncomingMediaAutoDownload(media: {
  url?: string | null;
  type?: 'image' | 'voice' | 'pdf' | 'file' | 'text';
  filename?: string | null;
}): Promise<void> {
  if (!media.url || media.type === 'text') return;

  const settings = getStorageSettings();
  let shouldDownload = false;

  if (media.type === 'image' && settings.autoDownloadPhotos) shouldDownload = true;
  else if (media.type === 'voice' && settings.autoDownloadAudio) shouldDownload = true;
  else if ((media.type === 'pdf' || media.type === 'file') && settings.autoDownloadDocs) shouldDownload = true;

  if (!shouldDownload) return;

  try {
    // Automatically cache blob locally
    const res = await fetch(media.url);
    if (res.ok) {
      const blob = await res.blob();
      const fn = media.filename || `onyx_${Date.now()}`;
      await cacheMediaBlob(media.url, blob, fn);

      // If user enabled direct device storage save, trigger it
      if (settings.saveToDeviceStorage) {
        saveMediaToDevice(media.url, fn);
      }
    }
  } catch (err) {
    console.warn('Auto-download media error:', err);
  }
}

/**
 * Get storage estimate (used bytes and quota).
 */
export async function getStorageUsage(): Promise<{ usedMB: string; quotaMB: string }> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      const used = ((est.usage || 0) / (1024 * 1024)).toFixed(1);
      const quota = ((est.quota || 0) / (1024 * 1024)).toFixed(0);
      return { usedMB: `${used} MB`, quotaMB: `${quota} MB` };
    } catch {}
  }
  return { usedMB: '0.0 MB', quotaMB: 'Unlimited' };
}

/**
 * Clear all cached media blobs from IndexedDB.
 */
export async function clearMediaCache(): Promise<boolean> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}
