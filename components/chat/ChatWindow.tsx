'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Conversation, Message, Profile, OnyxTheme, isFounder } from '@/types/database';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import FounderBadge from './FounderBadge';
import StarredDrawer from './StarredDrawer';
import { playSendSound, playReceiveSound } from '@/lib/sound';
import {
  getCachedMessages,
  getCachedMessagesBefore,
  saveCachedMessages,
  saveCachedMessage,
  updateCachedMessage,
} from '@/lib/chat-cache';
import { compressImage, isCompressibleImage } from '@/lib/image-compression';
import {
  Users,
  Menu,
  Info,
  Pin,
  Bookmark,
  Search,
  ChevronUp,
  ChevronDown,
  X,
  Star,
  Palette,
  Check,
  ArrowLeft,
} from 'lucide-react';

const THEME_STYLES: Record<OnyxTheme, { name: string; bgClass: string; accentColor: string }> = {
  'onyx-pure': {
    name: 'Onyx Pure',
    bgClass: 'bg-[#090a0f]',
    accentColor: '#6366f1',
  },
  'midnight-violet': {
    name: 'Midnight Violet',
    bgClass: 'bg-[#0b0714] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,50,230,0.15),rgba(255,255,255,0))]',
    accentColor: '#a855f7',
  },
  'emerald-stealth': {
    name: 'Emerald Stealth',
    bgClass: 'bg-[#050e0a] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))]',
    accentColor: '#10b981',
  },
  'sunset-horizon': {
    name: 'Sunset Horizon',
    bgClass: 'bg-[#120709] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(244,63,94,0.15),rgba(255,255,255,0))]',
    accentColor: '#f43f5e',
  },
};

interface ChatWindowProps {
  conversation: Conversation;
  currentUser: Profile;
  onlineUserIds: Set<string>;
  onToggleSidebar?: () => void;
  onTogglePin?: (conversationId: string) => void;
  onBack?: () => void;
}

export default function ChatWindow({
  conversation,
  currentUser,
  onlineUserIds,
  onToggleSidebar,
  onTogglePin,
  onBack,
}: ChatWindowProps) {
  const supabase = createClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeChannelRef = useRef<any>(null);
  const isLoadingOlderRef = useRef(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const [loading, setLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [typingUsers, setTypingUsers] = useState<{ [userId: string]: string }>({});
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Onyx Theme Gradient State
  const [currentTheme, setCurrentTheme] = useState<OnyxTheme>('onyx-pure');
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  // In-Chat Search State
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

  // Starred Drawer State
  const [starredDrawerOpen, setStarredDrawerOpen] = useState(false);

  // Load saved theme from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`onyx_theme_${conversation.id}`);
      if (saved && (saved in THEME_STYLES)) {
        setCurrentTheme(saved as OnyxTheme);
      }
    }
  }, [conversation.id]);

  const handleSelectTheme = (thm: OnyxTheme) => {
    setCurrentTheme(thm);
    setShowThemeMenu(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`onyx_theme_${conversation.id}`, thm);
    }
  };

  const isGroup = conversation.type === 'group';
  const isSaved = conversation.type === 'saved';

  // Find partner for direct chats
  const partnerParticipant = conversation.participants?.find(
    (p) => p.user_id !== currentUser.id
  );
  const partnerProfile = partnerParticipant?.profile;

  const chatTitle = isSaved
    ? 'Saved Messages (Personal Cloud)'
    : isGroup
    ? conversation.name || 'Group Chat'
    : partnerProfile?.full_name || 'Chat';

  const chatSubtitle = isSaved
    ? 'Cloud storage for notes & links'
    : isGroup
    ? `${conversation.participants?.length || 0} members`
    : partnerProfile?.username ? `@${partnerProfile.username}` : '';

  const isPartnerOnline = partnerProfile ? onlineUserIds.has(partnerProfile.id) : false;

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const scrollToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-brand-500', 'rounded-2xl');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-brand-500', 'rounded-2xl');
      }, 1800);
    }
  };

  // Matched messages for In-Chat Search
  const matchedMessageIds = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return messages
      .filter((m) => !m.is_deleted && m.content && m.content.toLowerCase().includes(q))
      .map((m) => m.id);
  }, [messages, searchQuery]);

  useEffect(() => {
    if (matchedMessageIds.length > 0) {
      setCurrentMatchIdx(0);
      scrollToMessage(matchedMessageIds[0]);
    } else {
      setCurrentMatchIdx(0);
    }
  }, [matchedMessageIds]);

  const handleNextMatch = () => {
    if (matchedMessageIds.length === 0) return;
    const nextIdx = (currentMatchIdx + 1) % matchedMessageIds.length;
    setCurrentMatchIdx(nextIdx);
    scrollToMessage(matchedMessageIds[nextIdx]);
  };

  const handlePrevMatch = () => {
    if (matchedMessageIds.length === 0) return;
    const prevIdx = (currentMatchIdx - 1 + matchedMessageIds.length) % matchedMessageIds.length;
    setCurrentMatchIdx(prevIdx);
    scrollToMessage(matchedMessageIds[prevIdx]);
  };

  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setCurrentMatchIdx(0);
  };

  // Toggle Star Handler (Optimistic UI)
  const handleToggleStar = async (messageId: string) => {
    let nextStarred = false;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === messageId) {
          nextStarred = !m.is_starred;
          return { ...m, is_starred: nextStarred };
        }
        return m;
      })
    );
    updateCachedMessage(messageId, { is_starred: nextStarred });

    try {
      const res = await fetch('/api/chat/starred', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
    } catch (err) {
      console.error('Failed to toggle star:', err);
    }
  };

  // 1. Local-First Caching via IndexedDB (Zero-Spinner Experience)
  useEffect(() => {
    let isMounted = true;

    const loadConversationMessages = async () => {
      // Step 1: Instantly read and render the last 30 cached messages from IndexedDB within 0ms
      const cached = await getCachedMessages(conversation.id, 30);

      let latestTimestamp: string | null = null;
      if (cached.length > 0) {
        latestTimestamp = cached[cached.length - 1].created_at;
      }

      if (isMounted) {
        if (cached.length > 0) {
          setMessages(cached);
          setLoading(false); // Zero spinner! Render immediately
          setHasMoreOlder(true);
          setTimeout(() => scrollToBottom('auto'), 20);
        } else {
          setLoading(true);
        }
      }

      // Step 2: Concurrently query in background only for messages newer than latest cached timestamp
      try {
        const queryUrl = latestTimestamp
          ? `/api/chat/messages?conversation_id=${conversation.id}&after=${encodeURIComponent(latestTimestamp)}`
          : `/api/chat/messages?conversation_id=${conversation.id}&limit=30`;

        const res = await fetch(queryUrl);
        const data = await res.json();

        if (isMounted && data.messages) {
          if (latestTimestamp) {
            // Merge newer messages into state without resetting view
            if (data.messages.length > 0) {
              setMessages((prev) => {
                const existingIds = new Set(prev.map((m) => m.id));
                const newArrivals = data.messages.filter((m: Message) => !existingIds.has(m.id));
                if (newArrivals.length === 0) return prev;
                return [...prev, ...newArrivals];
              });
              saveCachedMessages(conversation.id, data.messages);
              setTimeout(() => scrollToBottom('smooth'), 50);
            }
          } else {
            // First time loading conversation from network
            setMessages(data.messages);
            saveCachedMessages(conversation.id, data.messages);
            setHasMoreOlder(data.has_more ?? data.messages.length >= 30);
            setTimeout(() => scrollToBottom('auto'), 50);
          }
        }
      } catch (err) {
        console.error('Error fetching/syncing messages:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadConversationMessages();

    return () => {
      isMounted = false;
    };
  }, [conversation.id]);

  // Cursor-Based Pagination: Fetch older messages when scrolling near top (scrollTop < 80px)
  const handleScroll = async () => {
    const container = scrollContainerRef.current;
    if (!container || isLoadingOlderRef.current || !hasMoreOlder || messages.length === 0) return;

    if (container.scrollTop < 80) {
      const oldestMessage = messages[0];
      if (!oldestMessage || !oldestMessage.created_at) return;

      isLoadingOlderRef.current = true;
      setIsLoadingOlder(true);

      const previousScrollHeight = container.scrollHeight;
      const previousScrollTop = container.scrollTop;

      try {
        // Check IndexedDB first for older messages
        const cachedOlder = await getCachedMessagesBefore(
          conversation.id,
          oldestMessage.created_at,
          30
        );

        let olderBatch: Message[] = [];
        let serverHasMore = false;

        if (cachedOlder.length >= 30) {
          olderBatch = cachedOlder;
          serverHasMore = true;
        } else {
          // Fetch older messages from server
          const res = await fetch(
            `/api/chat/messages?conversation_id=${conversation.id}&before=${encodeURIComponent(
              oldestMessage.created_at
            )}&limit=30`
          );
          const data = await res.json();
          if (data.messages && data.messages.length > 0) {
            olderBatch = data.messages;
            serverHasMore = Boolean(data.has_more);
            saveCachedMessages(conversation.id, olderBatch);
          }
        }

        if (olderBatch.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const uniqueOlder = olderBatch.filter((m) => !existingIds.has(m.id));
            return [...uniqueOlder, ...prev];
          });

          setHasMoreOlder(serverHasMore);

          // Anchor scroll position seamlessly (prevents reset or viewport jumping)
          requestAnimationFrame(() => {
            if (scrollContainerRef.current) {
              const newScrollHeight = scrollContainerRef.current.scrollHeight;
              const heightDelta = newScrollHeight - previousScrollHeight;
              scrollContainerRef.current.scrollTop = previousScrollTop + heightDelta;
            }
          });
        } else {
          setHasMoreOlder(false);
        }
      } catch (err) {
        console.error('Error fetching older messages:', err);
      } finally {
        setIsLoadingOlder(false);
        isLoadingOlderRef.current = false;
      }
    }
  };

  // Real-Time Supabase Channel
  useEffect(() => {
    const channelName = `chat-room:${conversation.id}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: false },
      },
    });

    activeChannelRef.current = channel;

    // 1. Postgres changes on messages table
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversation.id}`,
      },
      async (payload) => {
        if (payload.eventType === 'INSERT') {
          const incoming = payload.new as Message;

          // Fetch sender profile if missing
          if (!incoming.sender) {
            const { data: senderProf } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', incoming.sender_id)
              .single();

            if (senderProf) incoming.sender = senderProf;
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;

            // Replace matching optimistic message
            const tempIdx = prev.findIndex(
              (m) =>
                (m.status === 'sending' || m.id.startsWith('temp-')) &&
                m.sender_id === incoming.sender_id &&
                m.content === incoming.content
            );

            if (tempIdx !== -1) {
              const updated = [...prev];
              updated[tempIdx] = { ...incoming, status: 'sent' };
              return updated;
            }

            if (incoming.sender_id !== currentUser.id) {
              playReceiveSound();
            }

            return [...prev, { ...incoming, status: 'sent' }];
          });

          // Automatically persist incoming realtime message to IndexedDB
          saveCachedMessage(incoming);

          setTimeout(() => scrollToBottom('smooth'), 50);
        } else if (payload.eventType === 'UPDATE') {
          const updatedMsg = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) => (m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m))
          );
          updateCachedMessage(updatedMsg.id, updatedMsg);
        }
      }
    );

    // 2. Broadcast incoming messages (0ms WebSocket)
    channel.on('broadcast', { event: 'new_message' }, (payload) => {
      const incoming = payload.payload as Message;
      if (incoming.conversation_id !== conversation.id) return;
      if (incoming.sender_id === currentUser.id) return;

      playReceiveSound();

      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        return [...prev, { ...incoming, status: 'sent' }];
      });

      // Automatically persist incoming broadcast message to IndexedDB
      saveCachedMessage(incoming);

      setTimeout(() => scrollToBottom('smooth'), 50);
    });

    // 3. Broadcast message edits
    channel.on('broadcast', { event: 'message_edited' }, (payload) => {
      const { messageId, content } = payload.payload;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, content, is_edited: true } : m
        )
      );
      updateCachedMessage(messageId, { content, is_edited: true });
    });

    // 4. Broadcast message deletions
    channel.on('broadcast', { event: 'message_deleted' }, (payload) => {
      const { messageId } = payload.payload;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                is_deleted: true,
                content: 'This message was deleted',
                media_url: null,
                file_name: null,
              }
            : m
        )
      );
      updateCachedMessage(messageId, {
        is_deleted: true,
        content: 'This message was deleted',
        media_url: null,
        file_name: null,
      });
    });

    // 5. Broadcast emoji reactions
    channel.on('broadcast', { event: 'reaction_update' }, (payload) => {
      const { messageId, reactions } = payload.payload;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );
      updateCachedMessage(messageId, { reactions });
    });

    // 6. Broadcast typing indicator
    channel.on('broadcast', { event: 'typing' }, (payload) => {
      const { userId, username } = payload.payload;
      if (userId === currentUser.id) return;

      setTypingUsers((prev) => ({ ...prev, [userId]: username }));

      setTimeout(() => {
        setTypingUsers((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }, 2500);
    });

    channel.subscribe();

    return () => {
      activeChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [conversation.id, currentUser.id, supabase]);

  // Adaptive Active-Chat Delta Sync Loop (High-frequency background fail-safe)
  useEffect(() => {
    let isMounted = true;

    const deltaSyncInterval = setInterval(async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!messagesRef.current || messagesRef.current.length === 0) return;

      const confirmed = messagesRef.current.filter(
        (m) => !m.id.startsWith('temp-') && m.created_at
      );
      if (confirmed.length === 0) return;
      const latestTs = confirmed[confirmed.length - 1].created_at;

      try {
        const res = await fetch(
          `/api/chat/messages?conversation_id=${conversation.id}&after=${encodeURIComponent(latestTs)}`
        );
        if (!res.ok) return;
        const data = await res.json();

        if (isMounted && data.messages && data.messages.length > 0) {
          const freshMessages: Message[] = data.messages;

          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newArrivals = freshMessages.filter((m) => !existingIds.has(m.id));
            if (newArrivals.length === 0) return prev;

            const hasOther = newArrivals.some((m) => m.sender_id !== currentUser.id);
            if (hasOther) {
              playReceiveSound();
            }

            saveCachedMessages(conversation.id, newArrivals);
            setTimeout(() => scrollToBottom('smooth'), 50);
            return [...prev, ...newArrivals];
          });
        }
      } catch {
        // Silently recover on next cycle
      }
    }, 1500);

    return () => {
      isMounted = false;
      clearInterval(deltaSyncInterval);
    };
  }, [conversation.id, currentUser.id]);

  const broadcastToRoom = (event: string, payload: any) => {
    if (activeChannelRef.current) {
      activeChannelRef.current.send({
        type: 'broadcast',
        event,
        payload,
      });
    }
  };

  const handleTyping = () => {
    broadcastToRoom('typing', {
      userId: currentUser.id,
      username: currentUser.username || currentUser.full_name,
    });
  };

  // Optimistic Send Handler
  const handleSendMessage = async (
    content: string,
    file?: File | null,
    previewUrl?: string | null,
    options?: {
      reply_to_id?: string;
      view_once?: boolean;
    }
  ) => {
    playSendSound();

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    let optimisticMediaType: 'text' | 'image' | 'pdf' | 'file' | 'voice' = 'text';
    if (file) {
      const mime = file.type.toLowerCase();
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (mime.startsWith('audio/') || file.name.includes('voice_note')) {
        optimisticMediaType = 'voice';
      } else if (mime === 'application/pdf' || ext === 'pdf') {
        optimisticMediaType = 'pdf';
      } else if (mime.startsWith('image/')) {
        optimisticMediaType = 'image';
      } else {
        optimisticMediaType = 'file';
      }
    }

    const optimisticUrl = previewUrl || (file ? URL.createObjectURL(file) : null);

    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: conversation.id,
      sender_id: currentUser.id,
      content: content || null,
      media_url: optimisticUrl,
      media_type: file ? optimisticMediaType : 'text',
      is_read: false,
      created_at: new Date().toISOString(),
      reply_to_id: options?.reply_to_id || null,
      reply_to: replyingTo,
      file_name: file ? file.name : null,
      file_size: file ? file.size : null,
      view_once_viewed: options?.view_once ? false : null,
      sender: currentUser,
      status: 'sending',
      temp_id: tempId,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setReplyingTo(null);
    setTimeout(() => scrollToBottom('smooth'), 10);

    try {
      let finalMediaUrl: string | undefined = undefined;
      let finalMediaType: 'text' | 'image' | 'pdf' | 'file' | 'voice' = 'text';
      let finalFileName: string | undefined = undefined;
      let finalFileSize: number | undefined = undefined;

      if (file) {
        let fileToUpload = file;
        if (isCompressibleImage(file)) {
          try {
            const comp = await compressImage(file);
            fileToUpload = comp.file;
          } catch (e) {
            console.warn('Canvas image compression fallback:', e);
          }
        }

        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('conversation_id', conversation.id);

        const uploadRes = await fetch('/api/chat/upload', {
          method: 'POST',
          body: formData,
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || 'Failed to upload attachment');

        finalMediaUrl = uploadData.public_url;
        finalMediaType = uploadData.media_type;
        finalFileName = uploadData.file_name;
        finalFileSize = uploadData.file_size;
      }

      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversation.id,
          content: content || null,
          media_url: finalMediaUrl,
          media_type: finalMediaType,
          reply_to_id: options?.reply_to_id,
          file_name: finalFileName,
          file_size: finalFileSize,
          view_once_viewed: options?.view_once ? false : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send message');

      const confirmedMessage: Message = {
        ...data.message,
        status: 'sent',
      };

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? confirmedMessage : m))
      );

      // Persist sent message to IndexedDB cache
      saveCachedMessage(confirmedMessage);

      // Instant WebSocket broadcast to active room
      broadcastToRoom('new_message', confirmedMessage);
    } catch (err: any) {
      console.error('Send message failed:', err);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'error' } : m))
      );
      throw err;
    }
  };

  // Reaction Toggle Handler with Optimistic UI
  const handleToggleReaction = async (messageId: string, emoji: string) => {
    let nextReactions: any[] = [];
    // Optimistic UI update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;

        const currentReactions = m.reactions ? [...m.reactions] : [];
        const existingIdx = currentReactions.findIndex((r) => r.emoji === emoji);

        if (existingIdx !== -1) {
          const ex = currentReactions[existingIdx];
          if (ex.has_reacted) {
            // Remove my reaction
            if (ex.count <= 1) {
              currentReactions.splice(existingIdx, 1);
            } else {
              currentReactions[existingIdx] = {
                ...ex,
                count: ex.count - 1,
                has_reacted: false,
                user_ids: ex.user_ids.filter((uid) => uid !== currentUser.id),
              };
            }
          } else {
            // Add my reaction
            currentReactions[existingIdx] = {
              ...ex,
              count: ex.count + 1,
              has_reacted: true,
              user_ids: [...ex.user_ids, currentUser.id],
            };
          }
        } else {
          // New emoji reaction
          currentReactions.push({
            emoji,
            count: 1,
            has_reacted: true,
            user_ids: [currentUser.id],
          });
        }

        nextReactions = currentReactions;
        return { ...m, reactions: currentReactions };
      })
    );

    updateCachedMessage(messageId, { reactions: nextReactions });

    try {
      const res = await fetch('/api/chat/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId, emoji }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Instant WebSocket broadcast reaction update
      broadcastToRoom('reaction_update', {
        messageId,
        reactions: data.reactions,
      });
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
    }
  };

  // Edit Message Handler
  const handleEditMessage = async (messageId: string, newContent: string) => {
    // Optimistic UI
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, content: newContent, is_edited: true } : m
      )
    );
    updateCachedMessage(messageId, { content: newContent, is_edited: true });

    const res = await fetch('/api/chat/messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: messageId, content: newContent }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Instant WebSocket broadcast edit
    broadcastToRoom('message_edited', { messageId, content: newContent });
  };

  // Delete for Everyone Handler
  const handleDeleteMessage = async (messageId: string) => {
    // Optimistic UI
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              is_deleted: true,
              content: 'This message was deleted',
              media_url: null,
              file_name: null,
            }
          : m
      )
    );
    updateCachedMessage(messageId, {
      is_deleted: true,
      content: 'This message was deleted',
      media_url: null,
      file_name: null,
    });

    const res = await fetch(`/api/chat/messages?message_id=${messageId}`, {
      method: 'DELETE',
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Instant WebSocket broadcast deletion
    broadcastToRoom('message_deleted', { messageId });
  };

  // View-Once Media Opened Handler
  const handleViewOnceOpened = async (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, view_once_viewed: true } : m))
    );
    updateCachedMessage(messageId, { view_once_viewed: true });

    await fetch('/api/chat/messages/view-once', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: messageId }),
    });
  };

  const typingNames = Object.values(typingUsers);

  return (
    <div className={`flex-1 flex flex-col h-full relative overflow-hidden transition-colors duration-500 ${THEME_STYLES[currentTheme].bgClass}`}>
      {/* Chat Window Header */}
      <header className="h-16 px-4 sm:px-6 border-b border-white/10 bg-black/40 backdrop-blur-xl flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          {onBack ? (
            <button
              onClick={onBack}
              className="lg:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors mr-1 shrink-0 flex items-center justify-center"
              title="Back to Chats"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
          ) : onToggleSidebar ? (
            <button
              onClick={onToggleSidebar}
              className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors mr-1"
            >
              <Menu className="w-5 h-5" />
            </button>
          ) : null}

          {/* Conversation Avatar */}
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-brand-300 overflow-hidden shadow-sm">
              {isSaved ? (
                <div className="w-full h-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white">
                  <Bookmark className="w-5 h-5" />
                </div>
              ) : isGroup ? (
                <div className="w-full h-full bg-gradient-to-tr from-indigo-600 to-brand-600 flex items-center justify-center text-white">
                  <Users className="w-5 h-5" />
                </div>
              ) : partnerProfile?.avatar_url ? (
                <img
                  src={partnerProfile.avatar_url}
                  alt={chatTitle}
                  className="w-full h-full object-cover"
                />
              ) : (
                chatTitle.slice(0, 2).toUpperCase()
              )}
            </div>

            {!isGroup && !isSaved && (
              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${
                  isPartnerOnline ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
                title={isPartnerOnline ? 'Online now' : 'Offline'}
              />
            )}
          </div>

          {/* Title & Typing status */}
          <div className="overflow-hidden">
            <h2 className="text-sm font-bold text-white truncate flex items-center gap-1.5">
              <span>{chatTitle}</span>
              {isFounder(partnerProfile) && <FounderBadge size="sm" />}
              {partnerProfile?.status_emoji && <span>{partnerProfile.status_emoji}</span>}
              {partnerProfile?.is_admin && !isFounder(partnerProfile) && (
                <span className="text-[10px] bg-rose-500/10 border border-rose-500/20 text-rose-400 px-1.5 py-0.2 rounded font-normal shrink-0">
                  Admin
                </span>
              )}
            </h2>

            <div className="text-[11px] truncate flex items-center gap-1.5">
              {typingNames.length > 0 ? (
                <span className="text-brand-400 font-medium animate-pulse">
                  {typingNames.join(', ')} {typingNames.length > 1 ? 'are' : 'is'} typing...
                </span>
              ) : (
                <>
                  <span className="text-slate-400">{chatSubtitle}</span>
                  {!isGroup && !isSaved && (
                    <>
                      <span className="text-slate-600">•</span>
                      <span className={isPartnerOnline ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                        {isPartnerOnline ? 'Online' : 'Offline'}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 relative">
          {/* Search Toggle Button */}
          <button
            onClick={() => {
              if (searchOpen) {
                handleCloseSearch();
              } else {
                setSearchOpen(true);
              }
            }}
            className={`p-2 rounded-xl border transition-colors ${
              searchOpen
                ? 'bg-brand-500/20 border-brand-500/40 text-brand-300'
                : 'bg-slate-900/60 border-white/5 text-slate-400 hover:text-white'
            }`}
            title="Search in conversation"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Starred Messages Drawer Button */}
          <button
            onClick={() => setStarredDrawerOpen(true)}
            className="p-2 rounded-xl border bg-slate-900/60 border-white/5 text-slate-400 hover:text-amber-400 transition-colors"
            title="Starred Messages"
          >
            <Star className="w-4 h-4" />
          </button>

          {/* Onyx Theme Picker Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="p-2 rounded-xl border bg-slate-900/60 border-white/5 text-slate-400 hover:text-purple-400 transition-colors"
              title="Chat Theme"
            >
              <Palette className="w-4 h-4" />
            </button>

            {showThemeMenu && (
              <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-slate-900/95 border border-white/10 shadow-2xl backdrop-blur-xl p-2 z-50 animate-fadeIn">
                <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Onyx Themes
                </div>
                <div className="space-y-1">
                  {[
                    { id: 'onyx-pure', name: 'Onyx Pure', dot: 'bg-slate-900 border-slate-700' },
                    { id: 'midnight-violet', name: 'Midnight Violet', dot: 'bg-purple-950 border-purple-600' },
                    { id: 'emerald-stealth', name: 'Emerald Stealth', dot: 'bg-emerald-950 border-emerald-600' },
                    { id: 'sunset-horizon', name: 'Sunset Horizon', dot: 'bg-rose-950 border-rose-600' },
                  ].map((thm) => (
                    <button
                      key={thm.id}
                      onClick={() => handleSelectTheme(thm.id as OnyxTheme)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors ${
                        currentTheme === thm.id
                          ? 'bg-white/10 text-white font-medium'
                          : 'text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full border ${thm.dot}`} />
                        {thm.name}
                      </span>
                      {currentTheme === thm.id && <Check className="w-3.5 h-3.5 text-brand-400" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Pin Chat */}
          {onTogglePin && (
            <button
              onClick={() => onTogglePin(conversation.id)}
              className={`p-2 rounded-xl border transition-colors ${
                conversation.is_pinned
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-slate-900/60 border-white/5 text-slate-400 hover:text-white'
              }`}
              title={conversation.is_pinned ? 'Unpin chat' : 'Pin chat to top'}
            >
              <Pin className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Slide-down In-Chat Search Bar */}
      {searchOpen && (
        <div className="bg-slate-900/95 border-b border-white/10 px-4 py-2 backdrop-blur-xl flex items-center justify-between gap-3 animate-fadeIn z-10 shrink-0">
          <div className="flex-1 flex items-center gap-2 bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 focus-within:border-brand-500 transition-colors">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find in conversation..."
              className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-slate-500 hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-400 whitespace-nowrap min-w-[65px] text-center font-mono">
              {matchedMessageIds.length > 0
                ? `${currentMatchIdx + 1} of ${matchedMessageIds.length}`
                : searchQuery
                ? 'No matches'
                : '0 matches'}
            </span>
            <div className="flex items-center gap-0.5 border-l border-white/10 pl-2">
              <button
                onClick={handlePrevMatch}
                disabled={matchedMessageIds.length === 0}
                className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 transition-colors"
                title="Previous match (Up)"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={handleNextMatch}
                disabled={matchedMessageIds.length === 0}
                className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 transition-colors"
                title="Next match (Down)"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                onClick={handleCloseSearch}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors ml-1"
                title="Close search"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages Feed Area with 60fps mobile hardware acceleration & overscroll containment */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-1 chat-scroll-viewport overscroll-contain"
      >
        {isLoadingOlder && (
          <div className="py-2.5 flex justify-center items-center gap-2 text-xs text-brand-400 animate-fadeIn">
            <div className="w-3.5 h-3.5 border-2 border-brand-500/40 border-t-brand-400 rounded-full animate-spin" />
            <span className="text-[11px] text-slate-400 font-medium">Loading earlier messages...</span>
          </div>
        )}
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
            <div className="w-8 h-8 border-3 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
            <p className="text-xs">Loading secure message history...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center">
              {isSaved ? <Bookmark className="w-7 h-7" /> : <Info className="w-7 h-7" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isSaved ? 'Your Personal Saved Messages (Personal Cloud)' : 'No messages yet'}
              </h3>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                {isSaved
                  ? 'Forward messages here, save voice notes, photos, or document links for quick access across devices.'
                  : 'Say hello to start the conversation! You can also send voice notes, photos, or code snippets.'}
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              currentUserId={currentUser.id}
              isGroup={isGroup}
              highlightQuery={searchQuery}
              theme={currentTheme}
              onReply={(m) => setReplyingTo(m)}
              onToggleReaction={handleToggleReaction}
              onToggleStar={handleToggleStar}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onViewOnceOpened={handleViewOnceOpened}
              scrollToMessage={scrollToMessage}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input Bar */}
      <ChatInput
        conversationId={conversation.id}
        onSendMessage={handleSendMessage}
        onTyping={handleTyping}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />

      {/* Starred Messages Slide-Over Drawer */}
      <StarredDrawer
        isOpen={starredDrawerOpen}
        onClose={() => setStarredDrawerOpen(false)}
        conversationId={conversation.id}
        onJumpToMessage={(id: string) => {
          setStarredDrawerOpen(false);
          scrollToMessage(id);
        }}
        onUnstar={(id: string) => handleToggleStar(id)}
      />
    </div>
  );
}
