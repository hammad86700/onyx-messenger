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
import { saveCachedMessage } from '@/lib/chat-cache';
import { playReceiveSound } from '@/lib/sound';
import {
  sendSystemNotification,
  sendCallNotification,
  dismissCallNotification,
  updateAppBadge,
  requestNotificationPermission,
} from '@/lib/notifications';
import { handleIncomingMediaAutoDownload } from '@/lib/storage-manager';
import { X } from 'lucide-react';
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

  // 6. Request notification permission on initial mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        requestNotificationPermission().catch(() => {});
      }
    }
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
    <div className="flex-1 min-h-0 flex flex-col h-full w-full relative overflow-hidden">
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

      {/* View 1: Main Feed Screen */}
      <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
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

        {/* Native Bottom Navigation Bar */}
        <MobileBottomNav
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setIsSearchOpen(false);
          }}
          totalUnreadCount={totalUnreadCount}
        />
      </div>

      {/* View 2: Active Chat View (Slides in from the right) */}
      <div
        className={`absolute inset-0 z-30 bg-[#07080b] flex flex-col w-full h-full overflow-hidden transition-all duration-300 ease-out ${
          activeConversation
            ? 'translate-x-0 opacity-100 pointer-events-auto visible'
            : 'translate-x-full opacity-0 pointer-events-none invisible'
        }`}
      >
        {activeConversation && (
          <MobileActiveChat
            key={activeConversation.id}
            conversation={activeConversation}
            currentUser={currentUser}
            onlineUserIds={onlineUserIds}
            onBack={handleBackToFeed}
            currentTheme={currentTheme}
            onStartCall={(conv, type) => {
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

              // Send ring notification to recipient channel
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
            }}
            onBroadcastMessage={(sentMsg) => {
              // Update feed conversation list snippet immediately
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

              // Forward notification to partner's user channel
              if (userChannelRef.current) {
                const partner = activeConversation.participants?.find(
                  (p) => p.user_id !== currentUser.id
                )?.profile;
                if (partner?.id) {
                  userChannelRef.current.send({
                    type: 'broadcast',
                    event: 'user_notification',
                    payload: {
                      recipient_id: partner.id,
                      message: sentMsg,
                    },
                  });
                }
              }
            }}
          />
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
