'use client';

import React, { useState, useEffect } from 'react';
import { Conversation, Profile, isFounder } from '@/types/database';
import { formatMessageTime } from '@/lib/utils';
import FounderBadge from '@/components/chat/FounderBadge';
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
}: MobileChatListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [startingChatId, setStartingChatId] = useState<string | null>(null);

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

  // Filter conversations locally if searchQuery isn't @
  const filteredConversations = conversations.filter((c) => {
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
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#07080b]" />
                        )}
                      </div>

                      <div className="overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">{user.full_name}</span>
                          {userFounder && <FounderBadge size="sm" />}
                        </div>
                        <p className="text-[11px] text-brand-400 font-mono truncate">@{user.username}</p>
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
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#07080b]" />
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
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
