'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Conversation, Profile, Message, OnyxTheme, isFounder } from '@/types/database';
import MobileHeader from './MobileHeader';
import MobileBottomNav, { MobileTab } from './MobileBottomNav';
import MobileChatList from './MobileChatList';
import MobileActiveChat from './MobileActiveChat';
import MobileVaultView from './MobileVaultView';
import MobileSettingsSheet from './MobileSettingsSheet';
import StarredDrawer from '@/components/chat/StarredDrawer';
import EditProfileModal from '@/components/chat/EditProfileModal';
import ChangePasswordModal from '@/components/chat/ChangePasswordModal';
import NewGroupModal from '@/components/chat/NewGroupModal';
import { saveCachedMessage, clearConversationCache } from '@/lib/chat-cache';
import { playReceiveSound } from '@/lib/sound';
import {
  sendSystemNotification,
  sendCallNotification,
  dismissCallNotification,
  updateAppBadge,
  requestNotificationPermission,
  syncPushSubscription,
} from '@/lib/notifications';
import { handleIncomingMediaAutoDownload } from '@/lib/storage-manager';
import {
  X,
  MessageSquare,
  Video,
  Bookmark,
  Settings,
  ShieldAlert,
  Shield,
} from 'lucide-react';
import CallOverlay, { ActiveCallState } from '@/components/calls/CallOverlay';
import OnyxMeetView from '@/components/calls/OnyxMeetView';
import DevicePermissionsModal from '@/components/permissions/DevicePermissionsModal';

interface FloatingBannerData {
  conversationId: string;
  senderName: string;
  senderAvatar?: string | null;
  snippet: string;
}

interface MobileShellProps {
  currentUser: Profile;
  onUpdateCurrentUser: (user: Profile) => void;
  onlineUserIds: Set<string>;
}

export default function MobileShell({
  currentUser,
  onUpdateCurrentUser,
  onlineUserIds,
}: MobileShellProps) {
  const router = useRouter();
  const supabase = createClient();

  // Navigation state
  const [activeTab, setActiveTab] = useState<MobileTab>('chats');
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [floatingBanner, setFloatingBanner] = useState<FloatingBannerData | null>(null);

  // Modals
  const [starredDrawerOpen, setStarredDrawerOpen] = useState(false);
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);

  // 1-on-1 Call State
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [incomingSignal, setIncomingSignal] = useState<{ type: string; payload: any } | null>(null);
  const callChannelRef = useRef<any>(null);

  // Theme
  const [currentTheme, setCurrentTheme] = useState<OnyxTheme>('onyx-pure');

  // First-time install permissions onboarding prompt
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const prompted = localStorage.getItem('onyx_permissions_prompted');
      if (!prompted) {
        localStorage.setItem('onyx_permissions_prompted', 'true');
        setTimeout(() => setPermissionsModalOpen(true), 1500);
      }
    }
  }, []);

  // Real-time channel ref
  const userChannelRef = useRef<any>(null);

  // Active conversation and conversations ref for real-time handlers
  const activeConversationRef = useRef<Conversation | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Load saved theme
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('onyx_mobile_theme');
      if (saved && ['onyx-pure', 'midnight-violet', 'emerald-stealth', 'sunset-horizon'].includes(saved)) {
        setCurrentTheme(saved as OnyxTheme);
      }
    }
  }, []);

  const handleSelectTheme = (theme: OnyxTheme) => {
    setCurrentTheme(theme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('onyx_mobile_theme', theme);
    }
  };

  // 1. Fetch Conversations
  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/chat/conversations');
      const data = await res.json();
      if (data.conversations) {
        setConversations(data.conversations);
        if (activeConversationRef.current) {
          const updatedActive = data.conversations.find(
            (c: Conversation) => c.id === activeConversationRef.current?.id
          );
          if (updatedActive) {
            setActiveConversation(updatedActive);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [currentUser.id]);

  // 2. Scalable Real-Time Socket Architecture: Single Pooled User Channel
  useEffect(() => {
    const handleIncoming = (newMsg: Message) => {
      if (!newMsg || !newMsg.conversation_id) return;

      const isCurrentChat = activeConversationRef.current?.id === newMsg.conversation_id;
      const isWindowFocused = typeof document !== 'undefined' && !document.hidden && document.hasFocus();

      // If this conversation is currently open, forward immediately to MobileActiveChat
      if (isCurrentChat) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('onyx-incoming-message', { detail: newMsg }));
        }
      }

      // If message is from someone else:
      if (newMsg.sender_id !== currentUser.id) {
        playReceiveSound();

        // If tab is in background, minimized, or looking at another chat:
        if (!isCurrentChat || !isWindowFocused) {
          const targetConv = conversationsRef.current.find((c) => c.id === newMsg.conversation_id);
          const senderProfile =
            newMsg.sender ||
            targetConv?.participants?.find((p) => p.user_id === newMsg.sender_id)?.profile;
          const senderName =
            senderProfile?.full_name ||
            senderProfile?.username ||
            (targetConv?.type === 'group' ? targetConv.name : 'New message') ||
            'New message';
          const senderAvatar =
            senderProfile?.avatar_url ||
            (targetConv?.type === 'group' ? targetConv.avatar_url : null);

          let snippet = newMsg.content || '';
          if (newMsg.media_type === 'image') snippet = '📷 Sent a photo';
          else if (newMsg.media_type === 'voice') snippet = '🎤 Sent a voice message';
          else if (newMsg.media_type === 'pdf' || newMsg.media_type === 'file') snippet = '📎 Sent an attachment';

          // Trigger native OS / browser notification (Action Center / Notification Tray)
          sendSystemNotification({
            title: senderName,
            body: snippet,
            icon: senderAvatar || '/icon-192.png',
            tag: `onyx-chat-${newMsg.conversation_id}`,
            conversationId: newMsg.conversation_id,
          });

          // Also show Instagram-style In-App Dropdown Floating Banner if on feed or another chat
          if (!isCurrentChat) {
            setFloatingBanner({
              conversationId: newMsg.conversation_id,
              senderName,
              senderAvatar,
              snippet,
            });
          }
        }
      }

      // Check if message belongs to one of user's conversations
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === newMsg.conversation_id);
        if (idx === -1) {
          fetchConversations();
          return prev;
        }

        const targetConv = prev[idx];
        const updatedConv: Conversation = {
          ...targetConv,
          last_message: newMsg,
          updated_at: newMsg.created_at,
          unread_count: isCurrentChat
            ? 0
            : newMsg.sender_id === currentUser.id
            ? targetConv.unread_count || 0
            : (targetConv.unread_count || 0) + 1,
        };

        const next = [...prev];
        next.splice(idx, 1);
        return [updatedConv, ...next];
      });

      // Cache in IndexedDB
      saveCachedMessage(newMsg);

      // Auto-save media to user's device storage in background (Zero Server Load)
      if (newMsg.media_url) {
        handleIncomingMediaAutoDownload({
          id: newMsg.id,
          url: newMsg.media_url,
          type: newMsg.media_type,
          filename: newMsg.file_name,
        });
      }
    };

    const channelName = `user:${currentUser.id}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: false },
      },
    });

    userChannelRef.current = channel;

    // Listen to changes on messages table where user is a participant
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      },
      (payload) => {
        const newMsg = payload.new as Message;
        handleIncoming(newMsg);
      }
    );

    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
      },
      () => {
        fetchConversations();
      }
    );

    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
      },
      () => {
        fetchConversations();
      }
    );

    // Also listen for broadcast user notifications and new messages
    channel.on('broadcast', { event: 'user_notification' }, (payload) => {
      const data = payload.payload;
      if (data?.recipient_id === currentUser.id && data?.message) {
        handleIncoming(data.message);
      }
    });

    channel.on('broadcast', { event: 'new_message' }, (payload) => {
      const newMsg = payload.payload as Message;
      if (newMsg) {
        handleIncoming(newMsg);
      }
    });

    channel.on('broadcast', { event: 'request_accepted' }, () => {
      fetchConversations();
    });

    channel.on('broadcast', { event: 'request_declined' }, () => {
      fetchConversations();
    });

    // Real-Time Chat Deleted / Cleared Listeners
    channel.on('broadcast', { event: 'chat_deleted' }, async (payload) => {
      const { conversation_id, conversationId } = payload.payload || {};
      const targetId = conversation_id || conversationId;
      if (targetId) {
        await clearConversationCache(targetId);
        setConversations((prev) => prev.filter((c) => c.id !== targetId));
        if (activeConversationRef.current?.id === targetId) {
          setActiveConversation(null);
        }
      }
    });

    channel.on('broadcast', { event: 'chat_cleared' }, async (payload) => {
      const { conversation_id, conversationId } = payload.payload || {};
      const targetId = conversation_id || conversationId;
      if (targetId) {
        await clearConversationCache(targetId);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === targetId ? { ...c, last_message: null, unread_count: 0 } : c
          )
        );
      }
    });

    // Real-Time 1-on-1 Call Signaling Listeners (Ring Alert)
    channel.on('broadcast', { event: 'call_ring' }, (payload) => {
      const data = payload.payload;
      if (data?.recipientId === currentUser.id && data?.call) {
        setActiveCall({
          ...data.call,
          direction: 'incoming',
          status: 'ringing',
        });

        // Trigger immediate high-priority OS Action Center / Notification Tray alert with ringtone & vibration
        sendCallNotification({
          callerName: data.call.partner?.full_name || 'Onyx User',
          callerAvatar: data.call.partner?.avatar_url,
          callId: data.call.callId,
          type: data.call.type,
          conversationId: data.call.conversationId,
        });
      }
    });

    // Real-Time Admin Kick Listener (Immediately kick user if account deleted)
    channel.on('broadcast', { event: 'account_deleted' }, () => {
      if (typeof window !== 'undefined') {
        alert('Your Onyx account has been removed by an administrator.');
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/login';
      }
    });

    channel.subscribe();

    return () => {
      userChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [currentUser.id, supabase]);

  // 2b. Dedicated Call Room Signaling Channel (Zero-drop peer-to-peer channel)
  useEffect(() => {
    if (!activeCall?.callId) {
      if (callChannelRef.current) {
        supabase.removeChannel(callChannelRef.current);
        callChannelRef.current = null;
      }
      return;
    }

    const roomName = `call-signaling:${activeCall.callId}`;
    const callChannel = supabase.channel(roomName, {
      config: { broadcast: { ack: false } },
    });

    callChannel
      .on('broadcast', { event: 'callee_ready' }, (payload) => {
        setIncomingSignal({ type: 'callee_ready', payload: payload.payload });
      })
      .on('broadcast', { event: 'call_offer' }, (payload) => {
        setIncomingSignal({ type: 'call_offer', payload: payload.payload });
      })
      .on('broadcast', { event: 'call_answer' }, (payload) => {
        setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : null));
        setIncomingSignal({ type: 'call_answer', payload: payload.payload });
      })
      .on('broadcast', { event: 'ice_candidate' }, (payload) => {
        setIncomingSignal({ type: 'ice_candidate', payload: payload.payload });
      })
      .on('broadcast', { event: 'call_reject' }, () => {
        dismissCallNotification();
        setActiveCall(null);
        setIncomingSignal(null);
      })
      .on('broadcast', { event: 'call_end' }, () => {
        dismissCallNotification();
        setActiveCall(null);
        setIncomingSignal(null);
      });

    callChannel.subscribe();
    callChannelRef.current = callChannel;

    return () => {
      if (callChannelRef.current) {
        supabase.removeChannel(callChannelRef.current);
        callChannelRef.current = null;
      }
    };
  }, [activeCall?.callId, supabase]);

  // 3. Auto-dismiss in-app floating banner after 5s
  useEffect(() => {
    if (!floatingBanner) return;
    const timer = setTimeout(() => {
      setFloatingBanner(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [floatingBanner]);

  // 4. Background Service Worker & Custom Window Notification Clicks
  useEffect(() => {
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CALL_NOTIFICATION_ACTION') {
        if (event.data.action === 'answer') {
          dismissCallNotification();
          setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : null));
        } else if (event.data.action === 'decline') {
          dismissCallNotification();
          if (callChannelRef.current && activeCall) {
            callChannelRef.current.send({
              type: 'broadcast',
              event: 'call_reject',
              payload: { callId: activeCall.callId },
            });
          }
          setActiveCall(null);
          setIncomingSignal(null);
        }
      } else if (event.data?.type === 'NAVIGATE_CONVERSATION' && event.data?.conversationId) {
        const target = conversationsRef.current.find((c) => c.id === event.data.conversationId);
        if (target) {
          handleSelectConversation(target);
        } else {
          fetchConversations();
        }
      }
    };

    const handleOpenConvEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.conversationId) {
        const target = conversationsRef.current.find((c) => c.id === detail.conversationId);
        if (target) {
          handleSelectConversation(target);
        } else {
          fetchConversations();
        }
      }
    };

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }
    window.addEventListener('onyx-open-conversation', handleOpenConvEvent);

    const handleRequestAccepted = () => {
      fetchConversations();
    };
    window.addEventListener('onyx-request-accepted', handleRequestAccepted);

    return () => {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
      window.removeEventListener('onyx-open-conversation', handleOpenConvEvent);
      window.removeEventListener('onyx-request-accepted', handleRequestAccepted);
    };
  }, []);

  // 5. Activity Heartbeat every 45s to update presence & last_read_at in PostgreSQL
  useEffect(() => {
    const heartbeat = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        await fetch('/api/users/heartbeat', { method: 'POST' });
      } catch {}
    };

    heartbeat();
    const interval = setInterval(heartbeat, 45000);
    return () => clearInterval(interval);
  }, []);

  // 6. Proactively request browser notification permission on user gesture & sync push subscription
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        syncPushSubscription().catch(() => {});
      } else if (Notification.permission === 'default') {
        const handleUserGesture = () => {
          requestNotificationPermission()
            .then((granted) => {
              if (granted) syncPushSubscription().catch(() => {});
            })
            .catch(() => {});
        };
        window.addEventListener('click', handleUserGesture, { once: true });
        window.addEventListener('touchend', handleUserGesture, { once: true });
        return () => {
          window.removeEventListener('click', handleUserGesture);
          window.removeEventListener('touchend', handleUserGesture);
        };
      }
    }
  }, [currentUser.id]);

  // 7. Auto-dismiss floating notification banner after 6 seconds
  useEffect(() => {
    if (floatingBanner) {
      const timer = setTimeout(() => {
        setFloatingBanner(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [floatingBanner]);

  // 8. Immediate background re-sync on visibility change or window focus
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchConversations();
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, []);

  // Total unread count and app badge synchronization
  const totalUnreadCount = conversations.reduce(
    (acc, c) => acc + (c.unread_count || 0),
    0
  );

  useEffect(() => {
    updateAppBadge(totalUnreadCount);
  }, [totalUnreadCount]);

  // Handle open conversation
  const handleSelectConversation = (conv: Conversation) => {
    // Clear unread count on open
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, unread_count: 0 } : c))
    );
    setActiveConversation(conv);
    setIsSearchOpen(false);
  };

  const handleBackToFeed = () => {
    setActiveConversation(null);
    fetchConversations();
  };

  // Open Personal Vault / Saved Chat
  const handleOpenSavedMessages = async () => {
    try {
      const res = await fetch('/api/chat/conversations/saved', { method: 'POST' });
      const data = await res.json();
      if (data.conversation) {
        handleSelectConversation(data.conversation);
      }
    } catch (err) {
      console.error('Failed to open saved messages:', err);
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    await clearConversationCache(conversationId);
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    if (activeConversationRef.current?.id === conversationId) {
      setActiveConversation(null);
    }
  };

  const handleClearConversation = async (conversationId: string) => {
    await clearConversationCache(conversationId);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, last_message: null, unread_count: 0 } : c
      )
    );
  };

  const handleStartCall = (conv: Conversation, type: 'voice' | 'video') => {
    const partner = conv.participants?.find((p) => p.user_id !== currentUser.id)?.profile;
    if (!partner) return;
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setActiveCall({
      callId,
      type,
      direction: 'outgoing',
      status: 'ringing',
      partner,
      conversationId: conv.id,
    });

    // 1. Send ring notification to recipient Supabase real-time channel
    const targetChannel = supabase.channel(`user:${partner.id}`);
    targetChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        targetChannel.send({
          type: 'broadcast',
          event: 'call_ring',
          payload: {
            recipientId: partner.id,
            call: {
              callId,
              type,
              partner: currentUser,
              conversationId: conv.id,
            },
          },
        });
      }
    });

    // 2. Also dispatch OS-level Web Push so phone rings even if app is completely closed
    fetch('/api/notifications/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientId: partner.id,
        callId,
        type,
        conversationId: conv.id,
      }),
    }).catch(() => {});
  };

  const handleBroadcastMessage = (sentMsg: Message) => {
    // 1. Update feed conversation list snippet immediately
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === sentMsg.conversation_id);
      if (idx === -1) return prev;
      const target = prev[idx];
      const updated = {
        ...target,
        last_message: sentMsg,
        updated_at: sentMsg.created_at,
      };
      const next = [...prev];
      next.splice(idx, 1);
      return [updated, ...next];
    });

    // 2. Resolve target conversation to find all other participants
    const targetConv =
      (activeConversationRef.current?.id === sentMsg.conversation_id
        ? activeConversationRef.current
        : null) ||
      conversationsRef.current.find((c) => c.id === sentMsg.conversation_id);

    const recipientUserIds: string[] = [];
    if (targetConv?.participants && targetConv.participants.length > 0) {
      for (const p of targetConv.participants) {
        if (p.user_id && p.user_id !== currentUser.id) {
          recipientUserIds.push(p.user_id);
        }
      }
    }

    const enrichedMsg: Message = {
      ...sentMsg,
      sender: sentMsg.sender || currentUser,
    };

    // 3. Dispatch real-time notification to EACH recipient's user channel
    for (const recipientId of recipientUserIds) {
      const recipientChannel = supabase.channel(`user:${recipientId}`);
      recipientChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          recipientChannel
            .send({
              type: 'broadcast',
              event: 'user_notification',
              payload: {
                recipient_id: recipientId,
                message: enrichedMsg,
              },
            })
            .finally(() => {
              setTimeout(() => {
                supabase.removeChannel(recipientChannel);
              }, 3000);
            });
        }
      });
    }

    // 4. Also broadcast to chat room channel for active viewers
    const roomChannel = supabase.channel(`chat-room:${sentMsg.conversation_id}`);
    roomChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        roomChannel
          .send({
            type: 'broadcast',
            event: 'new_message',
            payload: enrichedMsg,
          })
          .finally(() => {
            setTimeout(() => {
              supabase.removeChannel(roomChannel);
            }, 3000);
          });
      }
    });
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch {
      router.push('/login');
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row h-full w-full relative overflow-hidden bg-[#07080b]">
      {/* Floating Instagram/WhatsApp-style In-App Notification Banner */}
      {floatingBanner && (
        <div
          onClick={() => {
            const target = conversations.find((c) => c.id === floatingBanner.conversationId);
            if (target) {
              handleSelectConversation(target);
            }
            setFloatingBanner(null);
          }}
          className="absolute top-3 left-3 right-3 z-50 p-3 rounded-2xl bg-[#0f111a]/95 border border-white/20 shadow-2xl backdrop-blur-2xl flex items-center justify-between gap-3 animate-slideDown cursor-pointer touch-manipulation hover:bg-[#151824] transition-all ring-1 ring-white/10"
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-brand-500/40 flex items-center justify-center font-bold text-xs text-brand-300 overflow-hidden shrink-0 shadow-md">
              {floatingBanner.senderAvatar ? (
                <img src={floatingBanner.senderAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                floatingBanner.senderName.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="overflow-hidden">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white truncate">{floatingBanner.senderName}</span>
                <span className="text-[10px] text-brand-400 font-medium">just now</span>
              </div>
              <p className="text-[11px] text-slate-300 truncate">{floatingBanner.snippet}</p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFloatingBanner(null);
            }}
            className="p-1 rounded-full text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Desktop Left Navigation Rail (Visible ONLY on Desktop >= md) */}
      <nav className="hidden md:flex flex-col w-[68px] shrink-0 bg-[#06070a] border-r border-white/10 items-center justify-between py-4 select-none z-20">
        {/* Top Section: Logo & Main Navigation Tabs */}
        <div className="flex flex-col items-center gap-5">
          {/* Brand Emblem */}
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-pink-600 p-[1px] shadow-lg shadow-brand-500/30">
            <div className="w-full h-full bg-[#07080b] rounded-[15px] flex items-center justify-center font-black text-xs text-brand-300">
              OX
            </div>
          </div>

          {/* Nav Tabs */}
          <div className="flex flex-col items-center gap-2">
            {/* Chats */}
            <button
              onClick={() => {
                setActiveTab('chats');
                setIsSearchOpen(false);
              }}
              className={`relative p-3 rounded-2xl transition-all duration-200 group ${
                activeTab === 'chats'
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40 shadow-md shadow-brand-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Chats"
              aria-label="Chats"
            >
              <MessageSquare className="w-5 h-5" />
              {totalUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold font-mono flex items-center justify-center shadow-md animate-pulse">
                  {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                </span>
              )}
            </button>

            {/* Meet */}
            <button
              onClick={() => {
                setActiveTab('meet');
                setIsSearchOpen(false);
              }}
              className={`p-3 rounded-2xl transition-all duration-200 ${
                activeTab === 'meet'
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40 shadow-md shadow-brand-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Onyx Meet (Video & Audio Rooms)"
              aria-label="Meet"
            >
              <Video className="w-5 h-5" />
            </button>

            {/* Vault */}
            <button
              onClick={() => {
                setActiveTab('vault');
                setIsSearchOpen(false);
              }}
              className={`p-3 rounded-2xl transition-all duration-200 ${
                activeTab === 'vault'
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40 shadow-md shadow-brand-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Personal Vault & Saved Notes"
              aria-label="Vault"
            >
              <Bookmark className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Bottom Section: Admin, Settings, Profile */}
        <div className="flex flex-col items-center gap-3">
          {currentUser.is_admin && (
            <button
              onClick={() => router.push('/admin')}
              className="p-3 rounded-2xl text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 transition-colors"
              title="Admin Portal"
              aria-label="Admin Portal"
            >
              <ShieldAlert className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={() => {
              setActiveTab('settings');
              setIsSearchOpen(false);
            }}
            className={`p-3 rounded-2xl transition-all duration-200 ${
              activeTab === 'settings'
                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* User Profile Avatar */}
          <button
            onClick={() => setEditProfileModalOpen(true)}
            className="relative w-10 h-10 rounded-full bg-slate-800 border border-white/20 overflow-hidden hover:scale-105 transition-transform"
            title="Profile"
            aria-label="Profile"
          >
            {currentUser.avatar_url ? (
              <img src={currentUser.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="font-bold text-xs text-brand-300 flex items-center justify-center w-full h-full">
                {currentUser.full_name?.slice(0, 2).toUpperCase() || 'OX'}
              </span>
            )}
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#06070a]" />
          </button>
        </div>
      </nav>

      {/* Pane 1: Feed Pane (Full-screen on Mobile when no active chat, Sidebar on Desktop) */}
      <div
        className={`flex-col h-full overflow-hidden shrink-0 relative bg-[#07080b] ${
          activeConversation ? 'hidden md:flex' : 'flex flex-1'
        } md:flex-initial md:w-[340px] lg:w-[380px] xl:w-[420px] md:border-r md:border-white/10`}
      >
        {/* Header */}
        <MobileHeader
          currentUser={currentUser}
          onOpenSearch={() => setIsSearchOpen((prev) => !prev)}
          onNewChat={() => setNewGroupModalOpen(true)}
          isSearchOpen={isSearchOpen}
        />

        {/* Body Content based on Active Tab */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          {activeTab === 'chats' && (
            <MobileChatList
              currentUser={currentUser}
              conversations={conversations}
              activeConversationId={activeConversation?.id || null}
              onSelectConversation={handleSelectConversation}
              onlineUserIds={onlineUserIds}
              isSearchOpen={isSearchOpen}
              onCloseSearch={() => setIsSearchOpen(false)}
              onDeleteConversation={handleDeleteConversation}
              onClearConversation={handleClearConversation}
            />
          )}

          {activeTab === 'meet' && (
            <OnyxMeetView currentUser={currentUser} />
          )}

          {activeTab === 'vault' && (
            <MobileVaultView
              onOpenSavedChat={handleOpenSavedMessages}
              onOpenStarredDrawer={() => setStarredDrawerOpen(true)}
            />
          )}

          {activeTab === 'settings' && (
            <MobileSettingsSheet
              currentUser={currentUser}
              currentTheme={currentTheme}
              onSelectTheme={handleSelectTheme}
              onLogout={handleLogout}
              onOpenAdmin={currentUser.is_admin ? () => router.push('/admin') : undefined}
              onEditProfile={() => setEditProfileModalOpen(true)}
              onChangePassword={() => setChangePasswordModalOpen(true)}
              onOpenPermissions={() => setPermissionsModalOpen(true)}
            />
          )}
        </div>

        {/* Mobile Bottom Navigation Bar (Hidden on Desktop >= md) */}
        <div className="md:hidden shrink-0">
          <MobileBottomNav
            activeTab={activeTab}
            onSelectTab={(tab) => {
              setActiveTab(tab);
              setIsSearchOpen(false);
            }}
            totalUnreadCount={totalUnreadCount}
          />
        </div>
      </div>

      {/* Pane 2: Detail / Active Chat Pane (Full-screen on Mobile when active, Right Pane on Desktop) */}
      <div
        className={`flex-1 min-w-0 h-full flex-col relative bg-[#050608] overflow-hidden ${
          activeConversation ? 'flex' : 'hidden md:flex'
        }`}
      >
        {activeConversation ? (
          <MobileActiveChat
            key={activeConversation.id}
            conversation={activeConversation}
            currentUser={currentUser}
            onlineUserIds={onlineUserIds}
            onBack={handleBackToFeed}
            currentTheme={currentTheme}
            onDeleteConversation={handleDeleteConversation}
            onClearConversation={handleClearConversation}
            onStartCall={handleStartCall}
            onBroadcastMessage={handleBroadcastMessage}
            isDesktop={true}
          />
        ) : (
          /* Desktop Welcome / Empty State (WhatsApp Web / Telegram Desktop Style) */
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 text-center relative overflow-hidden select-none">
            {/* Ambient Background Glow */}
            <div className="absolute w-[500px] h-[500px] bg-brand-600/10 blur-[130px] rounded-full pointer-events-none -z-10 animate-pulse" />
            <div className="absolute w-[300px] h-[300px] bg-indigo-600/10 blur-[90px] rounded-full pointer-events-none -z-10 translate-x-24 translate-y-24" />

            {/* Glowing Brand Emblem */}
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-pink-600 p-[1px] shadow-2xl shadow-brand-500/25 ring-1 ring-white/20">
                <div className="w-full h-full bg-[#08090e] rounded-[23px] flex items-center justify-center">
                  <span className="font-black text-3xl tracking-tighter bg-gradient-to-tr from-brand-400 via-white to-pink-400 bg-clip-text text-transparent">
                    OX
                  </span>
                </div>
              </div>
              <div className="absolute -inset-2 rounded-3xl bg-brand-500/20 blur-xl -z-10" />
            </div>

            {/* Header Text */}
            <h2 className="text-2xl font-extrabold text-white tracking-tight mb-2">
              Onyx Web & Desktop
            </h2>
            <p className="text-sm text-slate-400 max-w-md leading-relaxed mb-8">
              Send and receive messages with zero server bandwidth load, instant background synchronization, and persistent local storage.
            </p>

            {/* Feature Badges */}
            <div className="flex flex-wrap items-center justify-center gap-3 max-w-lg mb-10">
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-white/10 text-xs text-slate-300 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Zero Server Media Load</span>
              </div>
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-white/10 text-xs text-slate-300 shadow-sm">
                <span className="text-brand-400">⚡</span>
                <span>Sub-50ms WebSockets</span>
              </div>
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-white/10 text-xs text-slate-300 shadow-sm">
                <span className="text-pink-400">📞</span>
                <span>HD Voice & Video Calls</span>
              </div>
            </div>

            {/* End-to-End Encryption Note */}
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <Shield className="w-3.5 h-3.5 text-slate-500" />
              <span>End-to-end encrypted & private</span>
            </div>
          </div>
        )}
      </div>

      {/* Starred Messages Slide Drawer */}
      <StarredDrawer
        isOpen={starredDrawerOpen}
        onClose={() => setStarredDrawerOpen(false)}
        onJumpToMessage={(msgId, convId) => {
          setStarredDrawerOpen(false);
          if (convId) {
            const target = conversations.find((c) => c.id === convId);
            if (target) handleSelectConversation(target);
          }
        }}
      />

      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={editProfileModalOpen}
        onClose={() => setEditProfileModalOpen(false)}
        currentUser={currentUser}
        onProfileUpdated={(updated) => {
          onUpdateCurrentUser(updated);
        }}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={changePasswordModalOpen}
        onClose={() => setChangePasswordModalOpen(false)}
      />

      {/* New Group Modal */}
      <NewGroupModal
        isOpen={newGroupModalOpen}
        onClose={() => setNewGroupModalOpen(false)}
        currentUserId={currentUser.id}
        onGroupCreated={(groupConv) => {
          setConversations((prev) => [groupConv, ...prev]);
          handleSelectConversation(groupConv);
        }}
      />

      {/* 1-on-1 Call Overlay */}
      {activeCall && (
        <CallOverlay
          call={activeCall}
          currentUser={currentUser}
          onAcceptCall={() => {
            if (!activeCall) return;
            dismissCallNotification();
            setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : null));
            if (callChannelRef.current) {
              callChannelRef.current.send({
                type: 'broadcast',
                event: 'call_answer',
                payload: { callId: activeCall.callId },
              });
            }
          }}
          onRejectCall={() => {
            dismissCallNotification();
            if (callChannelRef.current && activeCall) {
              callChannelRef.current.send({
                type: 'broadcast',
                event: 'call_reject',
                payload: { callId: activeCall.callId },
              });
            }
            setActiveCall(null);
            setIncomingSignal(null);
          }}
          onEndCall={() => {
            dismissCallNotification();
            if (callChannelRef.current && activeCall) {
              callChannelRef.current.send({
                type: 'broadcast',
                event: 'call_end',
                payload: { callId: activeCall.callId },
              });
            }
            setActiveCall(null);
            setIncomingSignal(null);
          }}
          onSendSignal={(type, payload) => {
            if (callChannelRef.current) {
              callChannelRef.current.send({
                type: 'broadcast',
                event: type,
                payload,
              });
            }
          }}
          incomingSignal={incomingSignal}
        />
      )}

      {/* WhatsApp-Style Device Permissions & Storage Modal */}
      <DevicePermissionsModal
        isOpen={permissionsModalOpen}
        onClose={() => setPermissionsModalOpen(false)}
      />
    </div>
  );
}

export { MobileShell as MobileChatLayout };
