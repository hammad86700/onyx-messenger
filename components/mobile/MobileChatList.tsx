'use client';

import React, { useState, useEffect } from 'react';
import { Conversation, Profile, isFounder } from '@/types/database';
import { formatMessageTime, formatLastSeen } from '@/lib/utils';
import FounderBadge from '@/components/chat/FounderBadge';
import { clearConversationCache } from '@/lib/chat-cache';
import { createClient } from '@/lib/supabase/client';
import {
  Search,
  Pin,
  Bookmark,
  Users,
  Image as ImageIcon,
  Mic,
  FileText,
  Flame,
  Check,
  CheckCheck,
  X,
  UserPlus,
  MessageSquare,
  ChevronRight,
  ArrowLeft,
  ShieldAlert,
  MoreVertical,
  Trash2,
  Eraser,
  AlertTriangle,
} from 'lucide-react';

interface MobileChatListProps {
  currentUser: Profile;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (conv: Conversation) => void;
  onlineUserIds: Set<string>;
  onStartDirectChat?: (userId: string) => void;
  isSearchOpen?: boolean;
  onCloseSearch?: () => void;
  onDeleteConversation?: (conversationId: string) => void;
  onClearConversation?: (conversationId: string) => void;
}

export default function MobileChatList({
  currentUser,
  conversations,
  activeConversationId,
  onSelectConversation,
  onlineUserIds,
  onStartDirectChat,
  isSearchOpen = false,
  onCloseSearch,
  onDeleteConversation,
  onClearConversation,
}: MobileChatListProps) {
  const supabase = createClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [startingChatId, setStartingChatId] = useState<string | null>(null);
  const [viewingRequests, setViewingRequests] = useState(false);

  // Chat options & deletion state
  const [selectedConvForOptions, setSelectedConvForOptions] = useState<Conversation | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ conv: Conversation; mode: 'clear' | 'delete' } | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  const handleExecuteAction = async (conv: Conversation, mode: 'clear' | 'delete') => {
    setActionInProgress(true);
    try {
      const res = await fetch(
        `/api/chat/conversations?conversation_id=${encodeURIComponent(conv.id)}&mode=${mode}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${mode} chat`);

      await clearConversationCache(conv.id);

      // Broadcast over chat room channel
      const roomChannel = supabase.channel(`chat-room:${conv.id}`);
      roomChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          roomChannel.send({
            type: 'broadcast',
            event: mode === 'delete' ? 'chat_deleted' : 'chat_cleared',
            payload: { conversationId: conv.id },
          });
        }
      });

      // Broadcast to partner user channels
      const otherParticipantIds = (conv.participants || [])
        .map((p) => p.user_id)
        .filter((uid) => uid !== currentUser.id);

      otherParticipantIds.forEach((uid) => {
        const pChannel = supabase.channel(`user:${uid}`);
        pChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            pChannel.send({
              type: 'broadcast',
              event: mode === 'delete' ? 'chat_deleted' : 'chat_cleared',
              payload: { conversation_id: conv.id },
            });
          }
        });
      });

      if (mode === 'clear') {
        onClearConversation?.(conv.id);
      } else {
        onDeleteConversation?.(conv.id);
      }
      setConfirmAction(null);
      setSelectedConvForOptions(null);
    } catch (err: any) {
      alert(err.message || `Error attempting to ${mode} chat`);
    } finally {
      setActionInProgress(false);
    }
  };

  // Live user search by username / query
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const delay = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.users) {
          setSearchResults(data.users.filter((u: Profile) => u.id !== currentUser.id));
        }
      } catch (err) {
        console.error('Failed to search users:', err);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(delay);
  }, [searchQuery, currentUser.id]);

  // Separate incoming requests that have messages
  const incomingRequests = conversations.filter(
    (c) => c.is_incoming_request && c.last_message
  );

  // Normal conversations (accepted chats, group chats, saved messages, or outgoing requests)
  const normalConversations = conversations.filter(
    (c) => !c.is_incoming_request
  );

  // Filter conversations locally if searchQuery isn't @
  const filteredConversations = normalConversations.filter((c) => {
    if (!searchQuery.trim() || searchQuery.startsWith('@')) return true;
    const q = searchQuery.toLowerCase();
    if (c.name && c.name.toLowerCase().includes(q)) return true;
    const partner = c.participants?.find((p) => p.user_id !== currentUser.id)?.profile;
    if (partner?.full_name?.toLowerCase().includes(q)) return true;
    if (partner?.username?.toLowerCase().includes(q)) return true;
    if (c.last_message?.content?.toLowerCase().includes(q)) return true;
    return false;
  });

  const handleUserClick = async (user: Profile) => {
    setStartingChatId(user.id);
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'direct',
          target_user_id: user.id,
          recipient_id: user.id,
        }),
      });
      const data = await res.json();
      if (data.conversation) {
        onSelectConversation(data.conversation);
        setSearchQuery('');
        if (onCloseSearch) onCloseSearch();
      }
    } catch (err) {
      console.error('Failed to start chat:', err);
    } finally {
      setStartingChatId(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden bg-[#07080b]">
      {/* Search Input Bar (Shown when isSearchOpen or search query present) */}
      {(isSearchOpen || searchQuery) && (
        <div className="p-3 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl shrink-0 animate-fadeIn">
          <div className="flex items-center gap-2 bg-slate-900/90 border border-white/10 rounded-2xl px-3 py-2 focus-within:border-brand-500/80 transition-colors">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats or @username..."
              className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
              autoFocus
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-white p-0.5 touch-manipulation"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : onCloseSearch ? (
              <button
                onClick={onCloseSearch}
                className="text-slate-400 hover:text-white text-xs touch-manipulation"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Main List Area */}
      <div className="flex-1 min-h-0 overflow-y-auto chat-scroll-viewport divide-y divide-white/[0.04] pb-24">
        {/* VIEW 1: Dedicated Message Requests View */}
        {viewingRequests ? (
          <div className="p-3 space-y-3 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <button
                onClick={() => setViewingRequests(false)}
                className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-semibold touch-manipulation"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>All Chats</span>
              </button>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white">Message Requests</span>
                <span className="px-1.5 py-0.5 rounded-full bg-brand-500 text-white font-mono text-[10px] font-bold">
                  {incomingRequests.length}
                </span>
              </div>
            </div>

            {/* Subtitle Explainer Banner */}
            <div className="p-3 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-slate-300 text-[11px] leading-relaxed flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
              <span>
                These are messages from people you haven&apos;t connected with yet. Open a request to accept or decline. Senders won&apos;t know you&apos;ve seen their message until you accept.
              </span>
            </div>

            {/* Requests List */}
            {incomingRequests.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No pending message requests.
              </div>
            ) : (
              incomingRequests.map((conv) => {
                const partner = conv.participants?.find((p) => p.user_id !== currentUser.id)?.profile;
                const partnerFounder = isFounder(partner);
                const lastMsg = conv.last_message;

                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      onSelectConversation(conv);
                    }}
                    className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-all text-left touch-manipulation group"
                  >
                    <div className="w-12 h-12 rounded-full bg-slate-800 border border-brand-500/30 flex items-center justify-center font-bold text-sm text-brand-300 overflow-hidden shrink-0 shadow-md">
                      {partner?.avatar_url ? (
                        <img src={partner.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        partner?.full_name?.slice(0, 2).toUpperCase() || 'U'
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5 truncate pr-2">
                          <span className="text-xs font-bold text-white truncate">
                            {partner?.full_name || 'User'}
                          </span>
                          {partnerFounder && <FounderBadge size="sm" />}
                        </div>
                        <span className="text-[10px] text-brand-400 font-mono">
                          {lastMsg?.created_at ? formatMessageTime(lastMsg.created_at) : ''}
                        </span>
                      </div>

                      <p className="text-[10px] text-slate-400 font-mono truncate mb-1">
                        @{partner?.username}
                      </p>

                      <p className="text-[11px] text-slate-300 truncate">
                        {lastMsg?.content || (lastMsg?.media_type === 'image' ? '📷 Sent a photo' : 'Sent a message request')}
                      </p>
                    </div>

                    <div className="shrink-0 pl-1">
                      <span className="text-[10px] font-bold px-2 py-1 rounded-xl bg-brand-500/20 text-brand-300 border border-brand-500/30 group-hover:bg-brand-500 group-hover:text-white transition-colors">
                        Review
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <>
            {/* Instagram-style Message Requests Banner (Shown when user has incoming requests) */}
            {incomingRequests.length > 0 && !searchQuery.trim() && (
              <div className="p-3 pb-1">
                <button
                  onClick={() => setViewingRequests(true)}
                  className="w-full flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-brand-950/70 via-slate-900/90 to-indigo-950/70 border border-brand-500/30 hover:border-brand-500/60 active:scale-[0.99] transition-all group shadow-lg shadow-brand-500/10 touch-manipulation"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-brand-600 via-indigo-600 to-pink-600 flex items-center justify-center text-white shadow-md shadow-brand-500/30 shrink-0">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div className="text-left overflow-hidden">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white">Message Requests</span>
                        <span className="px-1.5 py-0.2 rounded-full bg-brand-500 text-white font-mono font-bold text-[10px] shadow-sm animate-pulse">
                          {incomingRequests.length}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {incomingRequests.length === 1
                          ? `${incomingRequests[0].participants?.find((p) => p.user_id !== currentUser.id)?.profile.full_name || 'Someone'} wants to message you`
                          : `${incomingRequests.length} new requests awaiting review`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] font-semibold text-brand-400">View</span>
                    <ChevronRight className="w-4 h-4 text-brand-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              </div>
            )}
        {/* Search Results Display */}
        {searchQuery.trim() && (
          <div className="p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 mb-2">
              {searching ? 'Searching Onyx users...' : `User Search (${searchResults.length})`}
            </p>

            {searchResults.length === 0 && !searching ? (
              <p className="text-xs text-slate-500 px-2 py-3 text-center">
                No users found for &ldquo;{searchQuery}&rdquo;
              </p>
            ) : (
              searchResults.map((user) => {
                const userFounder = isFounder(user);
                const isOnline = onlineUserIds.has(user.id);

                return (
                  <button
                    key={user.id}
                    onClick={() => handleUserClick(user)}
                    disabled={startingChatId === user.id}
                    className="w-full flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-900/80 active:bg-slate-800 transition-colors text-left touch-manipulation group"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-xs text-brand-300 overflow-hidden">
                          {user.avatar_url ? (
                            <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                          ) : (
                            user.full_name?.slice(0, 2).toUpperCase() || 'U'
                          )}
                        </div>
                        {isOnline && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#07080b] shadow-sm shadow-emerald-500/50 animate-pulse" />
                        )}
                      </div>

                      <div className="overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">{user.full_name}</span>
                          {userFounder && <FounderBadge size="sm" />}
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono truncate flex items-center gap-1">
                          <span>@{user.username}</span>
                          <span className="text-slate-600">•</span>
                          {isOnline ? (
                            <span className="text-emerald-400 font-sans font-medium">Online</span>
                          ) : (
                            <span className="text-slate-500 font-sans">{formatLastSeen(user.created_at)}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 pl-2">
                      <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20 group-hover:bg-brand-500 group-hover:text-white transition-all">
                        <UserPlus className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Conversations Feed */}
        {filteredConversations.length === 0 && !searchQuery.trim() ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-3xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">No Conversations Yet</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Tap the search button above to find users by <span className="text-brand-400 font-mono">@username</span> and start messaging.
              </p>
            </div>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isGroup = conv.type === 'group';
            const isSaved = conv.type === 'saved';

            const partner = conv.participants?.find((p) => p.user_id !== currentUser.id)?.profile;
            const partnerFounder = isFounder(partner);
            const isOnline = partner ? onlineUserIds.has(partner.id) : false;

            const title = isSaved
              ? 'Saved Messages'
              : isGroup
              ? conv.name || 'Group Chat'
              : partner?.full_name || 'Chat';

            const subtitle = isSaved
              ? 'Cloud storage for notes & files'
              : isGroup
              ? `${conv.participants?.length || 0} members`
              : partner?.username ? `@${partner.username}` : '';

            const lastMsg = conv.last_message;
            const hasUnread = (conv.unread_count || 0) > 0;
            const isPinned = conv.is_pinned;

            return (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv)}
                className={`w-full flex items-center gap-3.5 p-3.5 transition-colors text-left touch-manipulation active:bg-white/5 ${
                  activeConversationId === conv.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.02]'
                }`}
              >
                {/* Avatar with Online indicator */}
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-sm text-brand-300 overflow-hidden shadow-sm">
                    {isSaved ? (
                      <div className="w-full h-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white">
                        <Bookmark className="w-6 h-6" />
                      </div>
                    ) : isGroup ? (
                      <div className="w-full h-full bg-gradient-to-tr from-indigo-600 to-brand-600 flex items-center justify-center text-white">
                        <Users className="w-6 h-6" />
                      </div>
                    ) : partner?.avatar_url ? (
                      <img src={partner.avatar_url} alt={title} className="w-full h-full object-cover" />
                    ) : (
                      title.slice(0, 2).toUpperCase()
                    )}
                  </div>

                  {!isGroup && !isSaved && isOnline && (
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#07080b] shadow-sm shadow-emerald-500/50 animate-pulse" />
                  )}
                </div>

                {/* Conversation Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 overflow-hidden pr-2">
                      <span className={`text-xs truncate ${hasUnread ? 'font-bold text-white' : 'font-semibold text-slate-200'}`}>
                        {title}
                      </span>
                      {partnerFounder && <FounderBadge size="sm" />}
                      {conv.is_outgoing_request && (
                        <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                          Requested
                        </span>
                      )}
                    </div>

                    <span className={`text-[10px] whitespace-nowrap ${hasUnread ? 'font-bold text-brand-400 font-mono' : 'text-slate-500'}`}>
                      {lastMsg?.created_at ? formatMessageTime(lastMsg.created_at) : ''}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    {/* Last Message Snippet */}
                    <p className={`text-[11px] truncate pr-2 ${hasUnread ? 'text-white font-medium' : 'text-slate-400'}`}>
                      {lastMsg ? (
                        lastMsg.is_deleted ? (
                          <span className="italic opacity-60">This message was deleted</span>
                        ) : lastMsg.media_type === 'image' ? (
                          <span className="flex items-center gap-1">
                            <ImageIcon className="w-3 h-3 text-brand-400" /> Photo
                          </span>
                        ) : lastMsg.media_type === 'voice' ? (
                          <span className="flex items-center gap-1">
                            <Mic className="w-3 h-3 text-emerald-400" /> Voice Note
                          </span>
                        ) : lastMsg.media_type === 'pdf' || lastMsg.media_type === 'file' ? (
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3 text-indigo-400" /> Document
                          </span>
                        ) : (
                          lastMsg.content || ''
                        )
                      ) : (
                        <span className="opacity-60">{subtitle}</span>
                      )}
                    </p>

                    {/* Pin & Unread Badges */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isPinned && <Pin className="w-3 h-3 text-amber-400 fill-amber-400 rotate-45" />}

                      {hasUnread && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white font-bold font-mono text-[10px] flex items-center justify-center shadow-md shadow-brand-500/40">
                          {conv.unread_count}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedConvForOptions(conv);
                        }}
                        className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors opacity-70 hover:opacity-100"
                        title="Chat Options"
                        aria-label="Chat Options"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
          </>
        )}
      </div>

      {/* Chat Options Bottom Sheet */}
      {selectedConvForOptions && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end justify-center animate-fadeIn"
          onClick={() => setSelectedConvForOptions(null)}
        >
          <div
            className="w-full max-w-md bg-[#0e1017] border-t border-white/10 rounded-t-3xl p-5 shadow-2xl animate-fadeIn gpu-accelerated space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-2" />

            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-xs text-brand-300 overflow-hidden">
                  {selectedConvForOptions.participants?.find((p) => p.user_id !== currentUser.id)?.profile?.avatar_url ? (
                    <img
                      src={selectedConvForOptions.participants.find((p) => p.user_id !== currentUser.id)!.profile.avatar_url!}
                      alt="Chat"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    (selectedConvForOptions.name || 'Chat').slice(0, 2).toUpperCase()
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white truncate max-w-[200px]">
                    {selectedConvForOptions.type === 'saved'
                      ? 'Saved Messages'
                      : selectedConvForOptions.type === 'group'
                      ? selectedConvForOptions.name || 'Group Chat'
                      : selectedConvForOptions.participants?.find((p) => p.user_id !== currentUser.id)?.profile?.full_name || 'Chat'}
                  </h4>
                  <p className="text-[10px] text-slate-400">Manage Conversation</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedConvForOptions(null)}
                className="p-1.5 rounded-full text-slate-400 hover:text-white bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <button
                onClick={() => {
                  const conv = selectedConvForOptions;
                  setSelectedConvForOptions(null);
                  setConfirmAction({ conv, mode: 'clear' });
                }}
                className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 active:bg-white/10 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Eraser className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-white block">Clear Chat History</span>
                  <span className="text-[10px] text-slate-400 block">Delete all messages. Chat stays in your list.</span>
                </div>
              </button>

              <button
                onClick={() => {
                  const conv = selectedConvForOptions;
                  setSelectedConvForOptions(null);
                  setConfirmAction({ conv, mode: 'delete' });
                }}
                className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-rose-500/10 active:bg-rose-500/20 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-rose-400 block">Delete Entire Chat</span>
                  <span className="text-[10px] text-slate-400 block">Permanently remove chat, participants, and all messages.</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear / Delete Whole Chat Confirmation Modal */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => !actionInProgress && setConfirmAction(null)}
        >
          <div
            className="w-full max-w-sm bg-[#0e1017] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4 animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  confirmAction.mode === 'delete'
                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                }`}
              >
                {confirmAction.mode === 'delete' ? (
                  <Trash2 className="w-6 h-6" />
                ) : (
                  <Eraser className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {confirmAction.mode === 'delete' ? 'Delete Whole Chat?' : 'Clear Chat Messages?'}
                </h3>
                <p className="text-xs text-slate-400">
                  {confirmAction.mode === 'delete'
                    ? 'Permanently delete this chat'
                    : 'Clear all messages'}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-400 bg-white/[0.03] p-3 rounded-xl border border-white/5 leading-relaxed">
              {confirmAction.mode === 'delete'
                ? 'Are you sure you want to delete this entire chat? This action cannot be reversed and will wipe history for all members.'
                : 'Are you sure you want to clear all messages? The empty conversation will remain in your chat list.'}
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={actionInProgress}
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionInProgress}
                onClick={() => handleExecuteAction(confirmAction.conv, confirmAction.mode)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-all shadow-lg ${
                  confirmAction.mode === 'delete'
                    ? 'bg-gradient-to-r from-rose-600 to-red-600 shadow-rose-600/30 hover:brightness-110 active:scale-98'
                    : 'bg-gradient-to-r from-amber-600 to-orange-600 shadow-amber-600/30 hover:brightness-110 active:scale-98'
                }`}
              >
                {actionInProgress ? (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : confirmAction.mode === 'delete' ? (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Chat</span>
                  </>
                ) : (
                  <>
                    <Eraser className="w-4 h-4" />
                    <span>Clear Messages</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
