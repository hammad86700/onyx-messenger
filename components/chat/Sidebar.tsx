'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Conversation, Profile, isFounder } from '@/types/database';
import { formatMessageTime } from '@/lib/utils';
import NewGroupModal from './NewGroupModal';
import ProfileStatusModal from './ProfileStatusModal';
import SupportBadges from './SupportBadges';
import FounderBadge from './FounderBadge';
import EditProfileModal from './EditProfileModal';
import {
  Search,
  Plus,
  Users,
  Shield,
  LogOut,
  MessageSquare,
  X,
  Sparkles,
  Bookmark,
  Pin,
  PinOff,
  Smile,
  Check,
  CheckCheck,
  Filter,
  Settings,
} from 'lucide-react';

interface SidebarProps {
  currentUser: Profile;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (conversation: Conversation) => void;
  onConversationCreated: (conversation: Conversation) => void;
  onConversationsUpdated?: (conversations: Conversation[]) => void;
  onCurrentUserUpdated?: (user: Profile) => void;
  onlineUserIds: Set<string>;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

type FilterTab = 'all' | 'unread' | 'groups';

export default function Sidebar({
  currentUser,
  conversations,
  activeConversationId,
  onSelectConversation,
  onConversationCreated,
  onConversationsUpdated,
  onCurrentUserUpdated,
  onlineUserIds,
  isOpenMobile = false,
  onCloseMobile,
}: SidebarProps) {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [startingChatUserId, setStartingChatUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [loadingSavedChat, setLoadingSavedChat] = useState(false);

  // Live user search by @username
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        setSearchResults(data.users || []);
      } catch (err) {
        console.error('Error searching users:', err);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  // Start direct conversation with selected user
  const handleStartDirectChat = async (targetUser: Profile) => {
    setStartingChatUserId(targetUser.id);
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'direct',
          target_user_id: targetUser.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start chat');

      setSearchQuery('');
      setSearchResults([]);

      onConversationCreated(data.conversation);
      if (onCloseMobile) onCloseMobile();
    } catch (err: any) {
      alert(err.message || 'Could not start conversation');
    } finally {
      setStartingChatUserId(null);
    }
  };

  // Identify the canonical Saved Messages self-chat
  const savedConversation = useMemo(() => {
    return conversations.find((c) => {
      if (c.name === 'Saved Messages') return true;
      if (c.type === 'direct' && c.created_by === currentUser.id) {
        const otherParticipants = c.participants?.filter((p) => p.user_id !== currentUser.id) || [];
        if (otherParticipants.length === 0) return true;
      }
      return false;
    });
  }, [conversations, currentUser.id]);

  const isSavedActive = Boolean(
    activeConversationId && savedConversation && activeConversationId === savedConversation.id
  );

  // Open or create Saved Messages self-chat
  const handleOpenSavedMessages = async () => {
    if (savedConversation) {
      onSelectConversation(savedConversation);
      if (onCloseMobile) onCloseMobile();
      return;
    }

    setLoadingSavedChat(true);
    try {
      const res = await fetch('/api/chat/conversations/saved', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to open Saved Messages');

      onSelectConversation(data.conversation);
      if (!conversations.some((c) => c.id === data.conversation.id)) {
        onConversationCreated(data.conversation);
      }
      if (onCloseMobile) onCloseMobile();
    } catch (err: any) {
      console.error('Error loading saved messages:', err);
      alert('Could not open Saved Messages.');
    } finally {
      setLoadingSavedChat(false);
    }
  };

  // Toggle Pin/Unpin
  const handleTogglePin = async (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    const newPinned = !conv.is_pinned;
    setPinningId(conv.id);

    try {
      const res = await fetch('/api/chat/conversations/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conv.id,
          is_pinned: newPinned,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to pin conversation');

      // Optimistically update conversation pin state
      const updated = conversations.map((c) =>
        c.id === conv.id ? { ...c, is_pinned: newPinned } : c
      );
      if (onConversationsUpdated) {
        onConversationsUpdated(updated);
      }
    } catch (err: any) {
      console.error('Failed to update pin state:', err);
    } finally {
      setPinningId(null);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  // Filter conversations (strictly excluding Saved Messages / redundant self-chats)
  const filteredConversations = useMemo(() => {
    let list = conversations.filter((conv) => {
      if (conv.name === 'Saved Messages') return false;
      const otherParticipants = conv.participants?.filter((p) => p.user_id !== currentUser.id) || [];
      if (conv.type === 'direct' && otherParticipants.length === 0 && conv.created_by === currentUser.id) {
        return false;
      }
      return true;
    });

    // Separate pinned vs non-pinned, sort pinned to top
    list.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      const dateA = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : 0;
      const dateB = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : 0;
      return dateB - dateA;
    });

    if (activeTab === 'unread') {
      return list.filter((conv) => {
        if (!conv.last_message) return false;
        if (conv.last_message.sender_id === currentUser.id) return false;
        const myPart = conv.participants?.find((p) => p.user_id === currentUser.id);
        if (!myPart?.last_read_at) return true;
        return new Date(conv.last_message.created_at) > new Date(myPart.last_read_at);
      });
    }

    if (activeTab === 'groups') {
      return list.filter((conv) => conv.type === 'group');
    }

    return list;
  }, [conversations, activeTab, currentUser.id]);

  // Unread count tally for tab badge
  const totalUnreadCount = useMemo(() => {
    return conversations.filter((conv) => {
      if (!conv.last_message) return false;
      if (conv.last_message.sender_id === currentUser.id) return false;
      const myPart = conv.participants?.find((p) => p.user_id === currentUser.id);
      if (!myPart?.last_read_at) return true;
      return new Date(conv.last_message.created_at) > new Date(myPart.last_read_at);
    }).length;
  }, [conversations, currentUser.id]);

  return (
    <>
      <aside className="w-full h-full flex flex-col border-r border-slate-800/80 bg-[#090a0f] backdrop-blur-xl z-30 transition-all duration-300">
        {/* Current User Profile Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-slate-800 border border-brand-500/40 flex items-center justify-center font-bold text-sm text-brand-300 overflow-hidden shadow-inner">
                {currentUser.avatar_url ? (
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  currentUser.full_name?.slice(0, 2).toUpperCase() || 'U'
                )}
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#090a0f]" />
            </div>

            <div className="overflow-hidden">
              <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                <span>{currentUser.full_name}</span>
                {isFounder(currentUser) && <FounderBadge size="sm" />}
                {currentUser.is_admin && !isFounder(currentUser) && (
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    Admin
                  </span>
                )}
              </p>
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-brand-400 font-mono truncate">
                  @{currentUser.username}
                </p>
                {currentUser.status_emoji && (
                  <span
                    className="text-xs shrink-0 cursor-pointer hover:scale-125 transition-transform"
                    onClick={() => setIsStatusModalOpen(true)}
                    title={currentUser.status_text || 'Status'}
                  >
                    {currentUser.status_emoji}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Edit Profile Modal Button */}
            <button
              onClick={() => setIsEditProfileModalOpen(true)}
              title="Edit Profile Settings"
              className="p-2 rounded-xl text-slate-400 hover:text-brand-300 hover:bg-slate-800/80 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Status Edit Modal Button */}
            <button
              onClick={() => setIsStatusModalOpen(true)}
              title="Set Custom Status"
              className="p-2 rounded-xl text-slate-400 hover:text-brand-300 hover:bg-slate-800/80 transition-colors"
            >
              <Smile className="w-4 h-4" />
            </button>

            {/* Super Admin Link if is_admin = true */}
            {currentUser.is_admin && (
              <Link
                href="/admin"
                title="Super-Admin Portal"
                className="p-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
              >
                <Shield className="w-4 h-4" />
              </Link>
            )}

            {/* Logout button */}
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Mobile close button */}
            {onCloseMobile && (
              <button
                onClick={onCloseMobile}
                className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Action Header & Search */}
        <div className="p-3.5 space-y-3 border-b border-slate-800/60 bg-slate-950/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Chats
            </span>

            {/* New Group Chat Button */}
            <button
              onClick={() => setIsGroupModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600/20 hover:bg-brand-600/30 text-brand-300 border border-brand-500/30 hover:border-brand-500/50 text-xs font-semibold transition-all group"
            >
              <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-200" />
              <span>New Group</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by @username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input w-full pl-9 pr-8 py-2 rounded-xl text-xs placeholder:text-slate-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Tabs: All, Unread, Groups */}
          {!searchQuery.trim() && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/80 border border-white/5">
              <button
                onClick={() => setActiveTab('all')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  activeTab === 'all'
                    ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                All
              </button>

              <button
                onClick={() => setActiveTab('unread')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'unread'
                    ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <span>Unread</span>
                {totalUnreadCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-brand-400 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                    {totalUnreadCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('groups')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  activeTab === 'groups'
                    ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Groups
              </button>
            </div>
          )}
        </div>

        {/* Live Search Results (Overlays when typing) */}
        {searchQuery.trim() ? (
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1 flex items-center justify-between">
              <span>Directory Search Results</span>
              {searching && <span className="text-brand-400 lowercase">searching...</span>}
            </div>

            {searchResults.length === 0 && !searching ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No users found for &quot;@{searchQuery}&quot;.
              </div>
            ) : (
              searchResults.map((user) => {
                const isStarting = startingChatUserId === user.id;
                return (
                  <div
                    key={user.id}
                    onClick={() => handleStartDirectChat(user)}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-800/70 cursor-pointer transition-colors border border-transparent hover:border-white/5 group"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-brand-300 shrink-0 overflow-hidden">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                        ) : (
                          user.full_name?.slice(0, 2).toUpperCase() || 'U'
                        )}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-semibold text-white truncate group-hover:text-brand-300 transition-colors flex items-center gap-1.5">
                          <span>{user.full_name}</span>
                          {isFounder(user) && <FounderBadge size="sm" />}
                          {user.status_emoji && <span>{user.status_emoji}</span>}
                        </p>
                        <p className="text-[11px] text-brand-400 font-mono">@{user.username}</p>
                      </div>
                    </div>

                    <button
                      disabled={isStarting}
                      className="p-1.5 rounded-lg bg-brand-600/20 text-brand-400 group-hover:bg-brand-600 group-hover:text-white transition-colors"
                      title="Direct Chat"
                    >
                      {isStarting ? (
                        <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <MessageSquare className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Normal Conversations List */
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* Permanent Saved Messages Self-Chat Header Entry */}
            <div
              onClick={handleOpenSavedMessages}
              className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all mb-2 group ${
                isSavedActive
                  ? 'bg-brand-600/25 border border-brand-500/50 shadow-md shadow-brand-500/15 text-white'
                  : 'bg-gradient-to-r from-brand-900/30 to-indigo-900/20 hover:from-brand-900/50 hover:to-indigo-900/40 border border-brand-500/20 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 shadow-md transition-transform ${
                    isSavedActive
                      ? 'bg-gradient-to-tr from-brand-500 to-indigo-500 shadow-brand-500/30 ring-2 ring-brand-400/40 scale-105'
                      : 'bg-gradient-to-tr from-brand-600 to-indigo-600 shadow-brand-500/20'
                  }`}
                >
                  <Bookmark className="w-5 h-5 fill-white/20" />
                </div>
                <div className="overflow-hidden">
                  <p
                    className={`text-xs font-bold transition-colors flex items-center gap-1.5 ${
                      isSavedActive ? 'text-white' : 'text-slate-100 group-hover:text-brand-300'
                    }`}
                  >
                    <span>Saved Messages (Personal Cloud)</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-mono">
                      Cloud
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {savedConversation?.last_message
                      ? savedConversation.last_message.is_deleted
                        ? 'Message deleted'
                        : savedConversation.last_message.media_url
                        ? savedConversation.last_message.media_type === 'voice'
                          ? '🎤 Voice Message'
                          : '📎 Attachment'
                        : savedConversation.last_message.content
                      : 'Your personal notes, voice clips, & media'}
                  </p>
                </div>
              </div>

              {loadingSavedChat && (
                <div className="w-4 h-4 border-2 border-brand-400/40 border-t-brand-400 rounded-full animate-spin mr-2" />
              )}
            </div>

            {filteredConversations.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center p-6 space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center text-slate-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">
                    {activeTab === 'unread'
                      ? 'No unread messages'
                      : activeTab === 'groups'
                      ? 'No group chats yet'
                      : 'No active chats'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {activeTab === 'all' && 'Search by @username above to connect with friends!'}
                  </p>
                </div>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isActive = conv.id === activeConversationId;
                const isGroup = conv.type === 'group';
                const isSaved = conv.name === 'Saved Messages';

                const partner = conv.participants?.find((p) => p.user_id !== currentUser.id)?.profile;
                const isPartnerOnline = partner ? onlineUserIds.has(partner.id) : false;

                const name = isSaved
                  ? 'Saved Messages'
                  : isGroup
                  ? conv.name || 'Group Chat'
                  : partner?.full_name || 'Direct Chat';

                const avatar = isGroup || isSaved ? null : partner?.avatar_url;

                // Check unread status
                const isUnread =
                  conv.last_message &&
                  conv.last_message.sender_id !== currentUser.id &&
                  (() => {
                    const myPart = conv.participants?.find((p) => p.user_id === currentUser.id);
                    if (!myPart?.last_read_at) return true;
                    return new Date(conv.last_message.created_at) > new Date(myPart.last_read_at);
                  })();

                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      onSelectConversation(conv);
                      if (onCloseMobile) onCloseMobile();
                    }}
                    className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all group relative ${
                      isActive
                        ? 'bg-brand-600/20 border border-brand-500/40 text-white shadow-sm shadow-brand-500/10'
                        : 'hover:bg-slate-800/50 text-slate-300 border border-transparent'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-brand-300 overflow-hidden">
                        {isSaved ? (
                          <div className="w-full h-full bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center text-white">
                            <Bookmark className="w-5 h-5 fill-white/20" />
                          </div>
                        ) : isGroup ? (
                          <div className="w-full h-full bg-gradient-to-tr from-indigo-600 to-brand-600 flex items-center justify-center text-white">
                            <Users className="w-5 h-5" />
                          </div>
                        ) : avatar ? (
                          <img src={avatar} alt={name} className="w-full h-full object-cover" />
                        ) : (
                          name.slice(0, 2).toUpperCase()
                        )}
                      </div>

                      {!isGroup && !isSaved && (
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#090a0f] ${
                            isPartnerOnline ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <p
                          className={`text-xs font-semibold truncate flex items-center gap-1.5 ${
                            isActive ? 'text-white' : 'text-slate-200'
                          }`}
                        >
                          <span>{name}</span>
                          {!isGroup && !isSaved && isFounder(partner) && (
                            <FounderBadge size="sm" />
                          )}
                          {!isGroup && !isSaved && partner?.status_emoji && (
                            <span className="text-[11px]">{partner.status_emoji}</span>
                          )}
                        </p>
                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          {conv.is_pinned && (
                            <Pin className="w-3 h-3 text-brand-400 rotate-45 fill-brand-400" />
                          )}
                          {conv.last_message && (
                            <span className="text-[10px] text-slate-500">
                              {formatMessageTime(conv.last_message.created_at)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-slate-400 truncate flex-1 mr-2">
                          {conv.last_message ? (
                            conv.last_message.is_deleted ? (
                              <span className="italic text-slate-500">Message deleted</span>
                            ) : conv.last_message.media_url ? (
                              conv.last_message.media_type === 'voice' ? (
                                '🎤 Voice Message'
                              ) : conv.last_message.media_type === 'image' ? (
                                conv.last_message.is_view_once ? '🔒 View-Once Photo' : '📷 Photo'
                              ) : conv.last_message.media_type === 'pdf' ? (
                                '📄 PDF Document'
                              ) : (
                                '📎 Attachment'
                              )
                            ) : (
                              conv.last_message.content
                            )
                          ) : (
                            <span className="italic text-slate-500">No messages yet</span>
                          )}
                        </p>

                        <div className="flex items-center gap-1 shrink-0">
                          {/* Pin Toggle button on hover */}
                          <button
                            onClick={(e) => handleTogglePin(e, conv)}
                            title={conv.is_pinned ? 'Unpin chat' : 'Pin chat to top'}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-opacity"
                          >
                            {conv.is_pinned ? (
                              <PinOff className="w-3 h-3" />
                            ) : (
                              <Pin className="w-3 h-3" />
                            )}
                          </button>

                          {/* Unread indicator badge */}
                          {isUnread && (
                            <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* User Profile Bar & Settings Gear at Bottom of Sidebar */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between">
          <div
            onClick={() => setIsEditProfileModalOpen(true)}
            className="flex items-center gap-2.5 overflow-hidden cursor-pointer group flex-1"
            title="Click to edit profile"
          >
            <div className="relative shrink-0">
              <div className="w-9 h-9 rounded-full bg-slate-800 border border-brand-500/40 flex items-center justify-center font-bold text-xs text-brand-300 overflow-hidden shadow-inner group-hover:border-brand-400 transition-colors">
                {currentUser.avatar_url ? (
                  <img src={currentUser.avatar_url} alt={currentUser.username} className="w-full h-full object-cover" />
                ) : (
                  currentUser.full_name?.slice(0, 2).toUpperCase() || 'U'
                )}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#090a0f]" />
            </div>

            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate flex items-center gap-1.5 group-hover:text-brand-300 transition-colors">
                <span>{currentUser.full_name}</span>
                {isFounder(currentUser) && <FounderBadge size="sm" />}
              </p>
              <p className="text-[10px] text-slate-400 font-mono truncate">
                @{currentUser.username}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsEditProfileModalOpen(true)}
            title="Edit Profile Settings"
            className="p-2 rounded-xl text-slate-400 hover:text-brand-300 hover:bg-slate-800 transition-colors shrink-0 ml-1"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Support Badges & Founder Attribution */}
        <div className="p-3 border-t border-slate-800/80 bg-[#090a0f] space-y-2">
          <SupportBadges className="justify-center" />
          <div className="flex justify-center">
            <a
              href="https://instagram.com/not_urs_hammi"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-[10px] font-semibold text-amber-300 transition-all hover:scale-105 shadow-sm shadow-amber-500/10"
            >
              <span>👑</span>
              <span>System Architect: Hammad</span>
            </a>
          </div>
        </div>
      </aside>

      {/* New Group Modal */}
      <NewGroupModal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        onGroupCreated={(conv) => {
          onConversationCreated(conv);
        }}
        currentUserId={currentUser.id}
      />

      {/* Complete Profile Customization Modal */}
      <EditProfileModal
        isOpen={isEditProfileModalOpen}
        onClose={() => setIsEditProfileModalOpen(false)}
        currentUser={currentUser}
        onProfileUpdated={(updated) => {
          if (onCurrentUserUpdated) {
            onCurrentUserUpdated(updated);
          }
        }}
      />

      {/* Profile Status & Bio Modal */}
      <ProfileStatusModal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        currentUser={currentUser}
        onProfileUpdated={(updated) => {
          if (onCurrentUserUpdated) {
            onCurrentUserUpdated(updated);
          }
        }}
      />
    </>
  );
}
