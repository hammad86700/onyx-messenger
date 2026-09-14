// Onyx Media Storage & Auto-Download Engine (WhatsApp-Style Device Persistence)
import {
  saveMediaBlob,
  getMediaBlob,
  deleteMediaBlob,
  requestPersistentStorage,
  getMediaDatabase,
} from './media-cache';

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

export { requestPersistentStorage };

/**
 * Cache a media blob into IndexedDB (delegated to unified media-cache).
 */
export async function cacheMediaBlob(
  url: string,
  blob: Blob,
  filename?: string,
  messageId?: string
): Promise<void> {
  const primaryKey = messageId || url;
  await saveMediaBlob(primaryKey, blob, url, filename);
}

/**
 * Retrieve a cached media blob from IndexedDB (delegated to unified media-cache).
 */
export async function getCachedMediaBlob(urlOrId: string): Promise<Blob | null> {
  return await getMediaBlob(urlOrId);
}

/**
 * Save / Download a media file directly to the user's mobile device or desktop storage.
 * Uses local Blob first so no server bandwidth is consumed.
 */
export async function saveMediaToDevice(
  url: string,
  preferredFilename?: string,
  mimeType?: string,
  messageId?: string
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    // 1. Check local device IndexedDB cache first
    let blob = (messageId ? await getMediaBlob(messageId) : null) || (await getMediaBlob(url));

    // 2. If not cached locally yet, fetch once and cache for future
    if (!blob) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      blob = await res.blob();
      await saveMediaBlob(messageId || url, blob, url, preferredFilename);
    }

    const filename =
      preferredFilename ||
      url.split('/').pop()?.split('?')[0] ||
      `onyx_media_${Date.now()}.${mimeType ? mimeType.split('/')[1] : 'bin'}`;

    // 3. Trigger direct browser/OS file download to user's device Downloads / Storage
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      try {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch {}
    }, 2000);

    return true;
  } catch (err) {
    console.error('Save media to device error:', err);
    // Fallback: open in new window
    window.open(url, '_blank');
    return false;
  }
}

/**
 * Check whether an incoming media message should auto-download to device storage.
 * Caches blob into local IndexedDB and optionally triggers file save.
 */
export async function handleIncomingMediaAutoDownload(media: {
  id?: string;
  url?: string | null;
  type?: 'image' | 'voice' | 'pdf' | 'file' | 'text' | string;
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
    // Check if already cached
    const existing = (media.id ? await getMediaBlob(media.id) : null) || (await getMediaBlob(media.url));
    if (!existing) {
      const res = await fetch(media.url);
      if (res.ok) {
        const blob = await res.blob();
        const fn = media.filename || `onyx_${Date.now()}`;
        await saveMediaBlob(media.id || media.url, blob, media.url, fn);

        // If user enabled direct device storage save, trigger it
        if (settings.saveToDeviceStorage) {
          saveMediaToDevice(media.url, fn, blob.type, media.id);
        }
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
    const db = await getMediaDatabase();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction('media_blobs', 'readwrite');
      const store = tx.objectStore('media_blobs');
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}
