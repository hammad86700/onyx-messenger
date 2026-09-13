/**
 * Onyx Cross-Platform Web & System Notification Manager
 * Handles browser desktop/mobile notifications like WhatsApp & Instagram Web.
 */

import { playReceiveSound } from './sound';

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string | null;
  badge?: string;
  tag?: string;
  conversationId?: string;
  onClick?: () => void;
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Prompts user for browser notification permission.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (err) {
    console.warn('Error requesting notification permission:', err);
    return false;
  }
}

/**
 * Fires a native system/browser notification that appears outside the browser window (Action Center / Notification Tray).
 */
export async function sendSystemNotification({
  title,
  body,
  icon = '/icon-192.png',
  badge = '/icon-192.png',
  tag,
  conversationId,
  onClick,
}: NotificationPayload): Promise<void> {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;

  const resolvedIcon = icon || '/icon-192.png';

  try {
    // 1. Try Service Worker showNotification (Best for Android PWA & Windows Action Center)
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg && 'showNotification' in reg) {
        await (reg as any).showNotification(title, {
          body,
          icon: resolvedIcon,
          badge,
          tag: tag || (conversationId ? `onyx-conv-${conversationId}` : undefined),
          data: {
            conversationId,
            url: '/',
          },
          vibrate: [200, 100, 200],
          renotify: true,
        });
        return;
      }
    }

    // 2. Fallback to standard HTML5 Notification API
    const notif = new Notification(title, {
      body,
      icon: resolvedIcon,
      badge,
      tag: tag || (conversationId ? `onyx-conv-${conversationId}` : undefined),
    });

    notif.onclick = (e) => {
      e.preventDefault();
      window.focus();
      notif.close();
      if (onClick) onClick();
      if (conversationId && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('onyx-open-conversation', { detail: { conversationId } })
        );
      }
    };
  } catch (err) {
    console.warn('Failed to display native system notification:', err);
  }
}

/**
 * Immediate test notification to verify OS push alert integration
 */
export async function sendTestNotification(): Promise<boolean> {
  let granted = Notification.permission === 'granted';
  if (!granted) {
    granted = await requestNotificationPermission();
  }

  if (!granted) return false;

  playReceiveSound();
  await sendSystemNotification({
    title: 'Onyx Messenger',
    body: '🔔 Notifications are working! You will receive alerts when new messages arrive.',
    icon: '/icon-192.png',
    tag: 'onyx-test',
  });

  return true;
}
