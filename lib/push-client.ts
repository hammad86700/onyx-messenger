/**
 * Onyx Client-Side Web Push Manager
 * Subscribes the device to Google FCM / Apple APNs via VAPID and syncs with server.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Registers device with Push Service (Google FCM / Apple APNs) and syncs subscription to Onyx backend.
 */
export async function syncPushSubscription(): Promise<boolean> {
  if (!isWebPushSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.warn('Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY');
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg || !reg.pushManager) return false;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey as any,
      });
    }

    if (!sub) return false;

    // Send subscription payload to Onyx backend
    const res = await fetch('/api/notifications/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });

    return res.ok;
  } catch (err) {
    console.warn('Failed to subscribe device for Web Push notifications:', err);
    return false;
  }
}

/**
 * Unsubscribes current device from Web Push and removes it from backend.
 */
export async function unsubscribePush(): Promise<boolean> {
  if (!isWebPushSupported()) return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg || !reg.pushManager) return false;

    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;

    await fetch('/api/notifications/push', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });

    await sub.unsubscribe();
    return true;
  } catch (err) {
    console.warn('Failed to unsubscribe push:', err);
    return false;
  }
}
