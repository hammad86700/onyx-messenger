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
  actions?: Array<{ action: string; title: string }>;
  requireInteraction?: boolean;
}

export interface CallNotificationPayload {
  callerName: string;
  callerAvatar?: string | null;
  callId: string;
  type: 'voice' | 'video';
  conversationId?: string;
  onAnswer?: () => void;
  onDecline?: () => void;
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
 * Set the app icon badge count for unread messages (PWA & Desktop).
 */
export async function updateAppBadge(count: number): Promise<void> {
  if (typeof navigator === 'undefined') return;

  try {
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    if (!nav) return;

    if ('setAppBadge' in nav) {
      if (count > 0) {
        await nav.setAppBadge(count);
      } else {
        await nav.clearAppBadge();
      }
    } else if (nav.serviceWorker?.controller) {
      nav.serviceWorker.controller.postMessage({
        type: 'SET_BADGE',
        count,
      });
    }
  } catch {}
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
  actions,
  requireInteraction = false,
}: NotificationPayload): Promise<void> {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;

  const resolvedIcon = icon || '/icon-192.png';

  try {
    // 1. Try Service Worker showNotification (Supports rich actions on Android, Windows Action Center & macOS)
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg && 'showNotification' in reg) {
        const swOptions: any = {
          body,
          icon: resolvedIcon,
          badge,
          tag: tag || (conversationId ? `onyx-conv-${conversationId}` : undefined),
          data: {
            conversationId,
            url: conversationId ? `/?conversation=${conversationId}` : '/',
          },
          vibrate: [200, 100, 200],
          renotify: true,
          requireInteraction,
        };

        if (actions && actions.length > 0) {
          swOptions.actions = actions;
        }

        await reg.showNotification(title, swOptions);
        return;
      }
    }

    // 2. Fallback to standard HTML5 Notification API
    const notif = new Notification(title, {
      body,
      icon: resolvedIcon,
      badge,
      tag: tag || (conversationId ? `onyx-conv-${conversationId}` : undefined),
      requireInteraction,
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
 * Send an immediate, high-priority Incoming Call alert with ring vibration & Action Center buttons.
 */
export async function sendCallNotification({
  callerName,
  callerAvatar,
  callId,
  type,
  conversationId,
}: CallNotificationPayload): Promise<void> {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;

  const title = `📞 Incoming ${type === 'video' ? 'Video' : 'Voice'} Call`;
  const body = `${callerName} is calling you on Onyx...`;
  const icon = callerAvatar || '/icon-192.png';

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg && 'showNotification' in reg) {
        await (reg as any).showNotification(title, {
          body,
          icon,
          badge: '/icon-192.png',
          tag: 'onyx-incoming-call',
          data: {
            callId,
            conversationId,
            type: 'call',
          },
          requireInteraction: true,
          renotify: true,
          vibrate: [500, 200, 500, 200, 500, 200, 500, 200],
          actions: [
            { action: 'answer', title: '📞 Answer' },
            { action: 'decline', title: '❌ Decline' },
          ],
        });
        return;
      }
    }

    // Fallback
    new Notification(title, {
      body,
      icon,
      tag: 'onyx-incoming-call',
      requireInteraction: true,
    });
  } catch (e) {
    console.warn('Failed to send call notification:', e);
  }
}

/**
 * Dismiss active incoming call notification from Action Center when answered or rejected.
 */
export async function dismissCallNotification(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg) {
        const notifications = await reg.getNotifications({ tag: 'onyx-incoming-call' });
        notifications.forEach((n) => n.close());
      }
    }
  } catch {}
}

/**
 * Immediate test notification to verify OS push alert integration.
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
    body: '🔔 Notifications are working! You will receive alerts for messages and calls.',
    icon: '/icon-192.png',
    tag: 'onyx-test',
  });

  return true;
}
