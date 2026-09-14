import webpush from 'web-push';
import { supabaseAdmin } from './supabase/admin';

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@onyx-messenger.com';

let vapidConfigured = false;
if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  } catch (err) {
    console.error('Failed to configure VAPID details:', err);
  }
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  conversationId?: string;
  type?: 'message' | 'call';
  isCall?: boolean;
  callId?: string;
  url?: string;
}

/**
 * Send Web Push notification to all active devices of a user.
 */
export async function sendPushToUser(userId: string, payload: PushNotificationPayload): Promise<void> {
  if (!vapidConfigured) return;

  try {
    const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !userData?.user) return;

    const subscriptions: any[] = userData.user.user_metadata?.push_subscriptions || [];
    if (subscriptions.length === 0) return;

    const pushPayloadString = JSON.stringify(payload);
    const deadEndpoints: string[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth,
              },
            },
            pushPayloadString,
            {
              TTL: payload.isCall ? 60 : 86400, // 60s for calls, 24 hours for messages
              urgency: payload.isCall ? 'high' : 'normal',
            }
          );
        } catch (err: any) {
          // If subscription has expired or is unsubscribed (404/410)
          if (err.statusCode === 404 || err.statusCode === 410) {
            deadEndpoints.push(sub.endpoint);
          }
        }
      })
    );

    // Clean up expired or revoked subscriptions
    if (deadEndpoints.length > 0) {
      const activeSubs = subscriptions.filter((s) => !deadEndpoints.includes(s.endpoint));
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...userData.user.user_metadata,
          push_subscriptions: activeSubs,
        },
      });
    }
  } catch (err) {
    console.warn(`Error sending push notification to user ${userId}:`, err);
  }
}

/**
 * Concurrently dispatches Web Push notifications to multiple users.
 */
export async function sendPushToUsers(userIds: string[], payload: PushNotificationPayload): Promise<void> {
  if (!vapidConfigured || userIds.length === 0) return;

  await Promise.all(userIds.map((uid) => sendPushToUser(uid, payload)));
}
