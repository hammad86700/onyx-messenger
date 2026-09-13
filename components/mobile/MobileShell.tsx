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

  // Modals
  const [starredDrawerOpen, setStarredDrawerOpen] = useState(false);
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);

  // Theme
  const [currentTheme, setCurrentTheme] = useState<OnyxTheme>('onyx-pure');

  // Real-time channel ref
  const userChannelRef = useRef<any>(null);

  // Active conversation ref for event listeners
  const activeConversationRef = useRef<Conversation | null>(null);
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

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

      // If this conversation is currently open, forward immediately to MobileActiveChat
      if (isCurrentChat) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('onyx-incoming-message', { detail: newMsg }));
        }
      } else if (newMsg.sender_id !== currentUser.id) {
        playReceiveSound();
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

    channel.subscribe();

    return () => {
      userChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [currentUser.id, supabase]);

  // Total unread count
  const totalUnreadCount = conversations.reduce(
    (acc, c) => acc + (c.unread_count || 0),
    0
  );

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
    </div>
  );
}

export { MobileShell as MobileChatLayout };
