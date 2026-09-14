'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Conversation, Message, Profile, OnyxTheme, isFounder } from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import FounderBadge from '@/components/chat/FounderBadge';
import MessageBubble from '@/components/chat/MessageBubble';
import MobileAttachmentSheet from './MobileAttachmentSheet';
import MobileMessageActionSheet from './MobileMessageActionSheet';
import {
  getCachedMessages,
  getCachedMessagesBefore,
  saveCachedMessages,
  saveCachedMessage,
  updateCachedMessage,
  deleteCachedMessage,
  clearConversationCache,
} from '@/lib/chat-cache';
import { resolveLocalMediaUrl } from '@/lib/media-cache';
import { compressImage, isCompressibleImage } from '@/lib/image-compression';
import { playSendSound, playReceiveSound } from '@/lib/sound';
import { formatLastSeen } from '@/lib/utils';
import {
  ArrowLeft,
  Search,
  Plus,
  Send,
  Mic,
  Square,
  Bookmark,
  Users,
  CornerDownRight,
  X,
  Check,
  ShieldAlert,
  Phone,
  Video,
  Download,
  MoreVertical,
  Trash2,
  Eraser,
  AlertTriangle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  saveMediaToDevice,
  handleIncomingMediaAutoDownload,
} from '@/lib/storage-manager';

interface MobileActiveChatProps {
  conversation: Conversation;
  currentUser: Profile;
  onlineUserIds: Set<string>;
  onBack: () => void;
  typingUsernames?: string[];
  onTyping?: () => void;
  onBroadcastMessage?: (msg: Message) => void;
  currentTheme?: OnyxTheme;
  onStartCall?: (conversation: Conversation, type: 'voice' | 'video') => void;
  onDeleteConversation?: (conversationId: string) => void;
  onClearConversation?: (conversationId: string) => void;
  isDesktop?: boolean;
}

export default function MobileActiveChat({
  conversation,
  currentUser,
  onlineUserIds,
  onBack,
  typingUsernames = [],
  onTyping,
  onBroadcastMessage,
  currentTheme = 'onyx-pure',
  onStartCall,
  onDeleteConversation,
  onClearConversation,
  isDesktop = false,
}: MobileActiveChatProps) {
  const supabase = createClient();
  const activeChannelRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingOlderRef = useRef(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const [loading, setLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);

  // Chat Options & Deletion State
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ mode: 'clear' | 'delete' } | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Local typing indicators from Realtime Broadcast
  const [localTypingMap, setLocalTypingMap] = useState<{ [userId: string]: string }>({});

  // Input & Reply State
  const [text, setText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);
  const [actionSheetMessage, setActionSheetMessage] = useState<Message | null>(null);

  // Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Local Request State
  const [isIncomingRequest, setIsIncomingRequest] = useState(Boolean(conversation.is_incoming_request));
  const [isOutgoingRequest, setIsOutgoingRequest] = useState(Boolean(conversation.is_outgoing_request));
  const [requestActionLoading, setRequestActionLoading] = useState(false);

  useEffect(() => {
    setIsIncomingRequest(Boolean(conversation.is_incoming_request));
    setIsOutgoingRequest(Boolean(conversation.is_outgoing_request));
  }, [conversation.id, conversation.is_incoming_request, conversation.is_outgoing_request]);

  const isGroup = conversation.type === 'group';
  const isSaved = conversation.type === 'saved';

  const partnerParticipant = conversation.participants?.find((p) => p.user_id !== currentUser.id);
  const partner = partnerParticipant?.profile;
  const partnerFounder = isFounder(partner);
  const isOnline = partner ? onlineUserIds.has(partner.id) : false;

  const chatTitle = isSaved
    ? 'Saved Messages'
    : isGroup
    ? conversation.name || 'Group Chat'
    : partner?.full_name || 'Chat';

  const lastActiveTimestamp =
    partnerParticipant?.last_read_at ||
    partner?.last_seen ||
    (conversation.last_message?.sender_id === partner?.id ? conversation.last_message?.created_at : null) ||
    partner?.created_at;

  const chatSubtitle = isSaved
    ? 'Personal Cloud'
    : isGroup
    ? `${conversation.participants?.length || 0} members`
    : isOnline
    ? 'Online'
    : lastActiveTimestamp
    ? formatLastSeen(lastActiveTimestamp)
    : partner?.username ? `@${partner.username}` : 'Offline';

  const lastTapRef = useRef<{ [msgId: string]: number }>({});
  const handleMessageTap = (msg: Message) => {
    const now = Date.now();
    const last = lastTapRef.current[msg.id] || 0;
    if (now - last < 320) {
      handleToggleReaction(msg.id, '❤️');
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(25);
        }
      } catch {}
      lastTapRef.current[msg.id] = 0;
    } else {
      lastTapRef.current[msg.id] = now;
    }
  };

  const combinedTypingUsers = Array.from(
    new Set([
      ...Object.values(localTypingMap).filter(Boolean),
      ...(typingUsernames || []).filter(Boolean),
    ])
  );

  const lastTypingPingRef = useRef<number>(0);
  const handleTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingPingRef.current > 1500) {
      lastTypingPingRef.current = now;
      if (activeChannelRef.current) {
        activeChannelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: {
            userId: currentUser.id,
            username: currentUser.username || currentUser.full_name || 'User',
          },
        });
      }
    }
    if (onTyping) onTyping();
  }, [currentUser, onTyping]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // 1. WhatsApp Model Local-First Cache: 0ms render
  useEffect(() => {
    let isMounted = true;

    const loadMessages = async () => {
      const cached = await getCachedMessages(conversation.id, 30);
      let latestTs: string | null = null;

      if (cached.length > 0) {
        latestTs = cached[cached.length - 1].created_at;
      }

      if (isMounted) {
        if (cached.length > 0) {
          // Resolve media URLs from local IndexedDB cache with 0 network calls
          const resolved = await Promise.all(
            cached.map(async (m) => {
              if (m.media_url) {
                const localUrl = await resolveLocalMediaUrl(m.id, m.media_url);
                return { ...m, media_url: localUrl || m.media_url };
              }
              return m;
            })
          );
          setMessages(resolved);
          setLoading(false);
          setTimeout(() => scrollToBottom('auto'), 20);
        } else {
          setLoading(true);
        }
      }

      // Background query for newer messages only
      try {
        const queryUrl = latestTs
          ? `/api/chat/messages?conversation_id=${conversation.id}&after=${encodeURIComponent(latestTs)}`
          : `/api/chat/messages?conversation_id=${conversation.id}&limit=30`;

        const res = await fetch(queryUrl);
        const data = await res.json();

        if (isMounted && data.messages) {
          // Resolve local media URLs
          const serverResolved: Message[] = await Promise.all(
            data.messages.map(async (m: Message) => {
              if (m.media_url) {
                const localUrl = await resolveLocalMediaUrl(m.id, m.media_url);
                return { ...m, media_url: localUrl || m.media_url };
              }
              return m;
            })
          );

          if (latestTs) {
            if (serverResolved.length > 0) {
              setMessages((prev) => {
                const existing = new Set(prev.map((m) => m.id));
                const fresh = serverResolved.filter((m) => !existing.has(m.id));
                if (fresh.length === 0) return prev;
                return [...prev, ...fresh];
              });
              saveCachedMessages(conversation.id, serverResolved);
              setTimeout(() => scrollToBottom('smooth'), 50);
            }
          } else {
            setMessages(serverResolved);
            saveCachedMessages(conversation.id, serverResolved);
            setHasMoreOlder(data.has_more ?? serverResolved.length >= 30);
            setTimeout(() => scrollToBottom('auto'), 50);
          }
        }
      } catch (err) {
        console.error('Mobile background sync error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadMessages();

    return () => {
      isMounted = false;
    };
  }, [conversation.id]);

  // 2. Real-Time Channel: Broadcast & Postgres Changes (Sub-second instant delivery)
  useEffect(() => {
    const channelName = `chat-room:${conversation.id}`;

    // Clean up any stale or lingering channel instance with this topic before creating
    try {
      const existing = supabase.getChannels().find(
        (c: any) => c.topic === `realtime:${channelName}` || c.topic === channelName
      );
      if (existing) {
        supabase.removeChannel(existing);
      }
    } catch {}

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: false },
      },
    });

    activeChannelRef.current = channel;

    // 1. WebSocket Broadcast: Instant peer-to-peer delivery (<50ms)
    channel.on('broadcast', { event: 'new_message' }, async (payload) => {
      const incoming = payload.payload as Message;
      if (!incoming || incoming.conversation_id !== conversation.id) return;
      if (incoming.sender_id === currentUser.id) return;

      let displayMsg = incoming;
      if (incoming.media_url) {
        try {
          const localUrl = await resolveLocalMediaUrl(incoming.id, incoming.media_url);
          if (localUrl) displayMsg = { ...incoming, media_url: localUrl };
        } catch {}
      }

      playReceiveSound();

      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        return [...prev, { ...displayMsg, status: 'sent' }];
      });

      saveCachedMessage(displayMsg);
      setTimeout(() => scrollToBottom('smooth'), 50);

      // WhatsApp-Style Media Auto-Download to Mobile Storage
      if (incoming.media_url) {
        handleIncomingMediaAutoDownload({
          url: incoming.media_url,
          type: incoming.media_type,
          filename: incoming.file_name,
        });
      }
    });

    // 2. WebSocket Broadcast: Message Edited
    channel.on('broadcast', { event: 'message_edited' }, (payload) => {
      const { messageId, content } = payload.payload || {};
      if (!messageId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content, is_edited: true } : m))
      );
      updateCachedMessage(messageId, { content, is_edited: true });
    });

    // 3. WebSocket Broadcast: Message Deleted
    channel.on('broadcast', { event: 'message_deleted' }, (payload) => {
      const { messageId } = payload.payload || {};
      if (!messageId) return;
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

    // 4. WebSocket Broadcast: Reaction Update
    channel.on('broadcast', { event: 'reaction_update' }, (payload) => {
      const { messageId, reactions } = payload.payload || {};
      if (!messageId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );
      updateCachedMessage(messageId, { reactions });
    });

    // 5. WebSocket Broadcast: Typing Indicator
    channel.on('broadcast', { event: 'typing' }, (payload) => {
      const { userId, username } = payload.payload || {};
      if (!userId || userId === currentUser.id) return;
      setLocalTypingMap((prev) => ({ ...prev, [userId]: username || 'Someone' }));
      setTimeout(() => {
        setLocalTypingMap((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }, 2500);
    });

    // 5b. WebSocket Broadcast: Request Accepted
    channel.on('broadcast', { event: 'request_accepted' }, (payload) => {
      const { conversationId } = payload.payload || {};
      if (conversationId === conversation.id) {
        setIsIncomingRequest(false);
        setIsOutgoingRequest(false);
      }
    });

    // 5c. WebSocket Broadcast: Whole Chat Cleared
    channel.on('broadcast', { event: 'chat_cleared' }, async (payload) => {
      const { conversationId } = payload.payload || {};
      if (conversationId === conversation.id) {
        await clearConversationCache(conversation.id);
        setMessages([]);
        onClearConversation?.(conversation.id);
      }
    });

    // 5d. WebSocket Broadcast: Whole Chat Deleted
    channel.on('broadcast', { event: 'chat_deleted' }, async (payload) => {
      const { conversationId } = payload.payload || {};
      if (conversationId === conversation.id) {
        await clearConversationCache(conversation.id);
        onDeleteConversation?.(conversation.id);
      }
    });

    // 6. Postgres Changes on messages table
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
          if (!incoming) return;

          // Fetch sender profile if missing
          if (!incoming.sender) {
            try {
              const { data: senderProf } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', incoming.sender_id)
                .maybeSingle();
              if (senderProf) incoming.sender = senderProf;
            } catch {}
          }

          let displayMsg = incoming;
          if (incoming.media_url) {
            try {
              const localUrl = await resolveLocalMediaUrl(incoming.id, incoming.media_url);
              if (localUrl) displayMsg = { ...incoming, media_url: localUrl };
            } catch {}
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
              updated[tempIdx] = { ...displayMsg, status: 'sent' };
              return updated;
            }

            if (incoming.sender_id !== currentUser.id) {
              playReceiveSound();
            }

            return [...prev, { ...displayMsg, status: 'sent' }];
          });

          saveCachedMessage(displayMsg);
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

    try {
      channel.subscribe();
    } catch (err) {
      console.warn('Realtime channel subscription notice:', err);
    }

    return () => {
      activeChannelRef.current = null;
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [conversation.id, currentUser.id, supabase]);

  // 3. Cross-component Event Bridge (Incoming messages routed via MobileShell)
  useEffect(() => {
    const handleOnyxIncoming = async (e: Event) => {
      const customEvent = e as CustomEvent<Message>;
      const incoming = customEvent.detail;
      if (!incoming || incoming.conversation_id !== conversation.id) return;

      let displayMsg = incoming;
      if (incoming.media_url) {
        try {
          const localUrl = await resolveLocalMediaUrl(incoming.id, incoming.media_url);
          if (localUrl) displayMsg = { ...incoming, media_url: localUrl };
        } catch {}
      }

      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;

        const tempIdx = prev.findIndex(
          (m) =>
            (m.status === 'sending' || m.id.startsWith('temp-')) &&
            m.sender_id === incoming.sender_id &&
            m.content === incoming.content
        );

        if (tempIdx !== -1) {
          const updated = [...prev];
          updated[tempIdx] = { ...displayMsg, status: 'sent' };
          return updated;
        }

        if (incoming.sender_id !== currentUser.id) {
          playReceiveSound();
        }

        return [...prev, { ...displayMsg, status: 'sent' }];
      });

      saveCachedMessage(displayMsg);

      if (incoming.media_url) {
        handleIncomingMediaAutoDownload({
          id: incoming.id,
          url: incoming.media_url,
          type: incoming.media_type,
          filename: incoming.file_name,
        });
      }

      setTimeout(() => scrollToBottom('smooth'), 50);
    };

    window.addEventListener('onyx-incoming-message', handleOnyxIncoming);
    return () => {
      window.removeEventListener('onyx-incoming-message', handleOnyxIncoming);
    };
  }, [conversation.id, currentUser.id]);

  // 4. Adaptive Active-Chat Delta Sync Loop (High-frequency background fail-safe)
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

          const resolvedFresh = await Promise.all(
            freshMessages.map(async (m) => {
              if (m.media_url) {
                const localUrl = await resolveLocalMediaUrl(m.id, m.media_url);
                return { ...m, media_url: localUrl || m.media_url };
              }
              return m;
            })
          );

          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newArrivals = resolvedFresh.filter((m) => !existingIds.has(m.id));
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

  // Cursor-Based Pagination on Scroll Top (scrollTop < 80px)
  const handleScroll = async () => {
    const container = scrollContainerRef.current;
    if (!container || isLoadingOlderRef.current || !hasMoreOlder || messages.length === 0) return;

    if (container.scrollTop < 80) {
      const oldest = messages[0];
      if (!oldest || !oldest.created_at) return;

      isLoadingOlderRef.current = true;
      setIsLoadingOlder(true);

      const prevHeight = container.scrollHeight;
      const prevTop = container.scrollTop;

      try {
        const cachedOlder = await getCachedMessagesBefore(conversation.id, oldest.created_at, 30);
        let batch: Message[] = [];
        let serverHasMore = false;

        if (cachedOlder.length >= 30) {
          batch = cachedOlder;
          serverHasMore = true;
        } else {
          const res = await fetch(
            `/api/chat/messages?conversation_id=${conversation.id}&before=${encodeURIComponent(
              oldest.created_at
            )}&limit=30`
          );
          const data = await res.json();
          if (data.messages && data.messages.length > 0) {
            batch = data.messages;
            serverHasMore = Boolean(data.has_more);
            saveCachedMessages(conversation.id, batch);
          }
        }

        if (batch.length > 0) {
          // Resolve media URLs
          const resolvedBatch = await Promise.all(
            batch.map(async (m) => {
              if (m.media_url) {
                const localUrl = await resolveLocalMediaUrl(m.id, m.media_url);
                return { ...m, media_url: localUrl || m.media_url };
              }
              return m;
            })
          );

          setMessages((prev) => {
            const existing = new Set(prev.map((m) => m.id));
            const fresh = resolvedBatch.filter((m) => !existing.has(m.id));
            return [...fresh, ...prev];
          });

          setHasMoreOlder(serverHasMore);

          // Anchor scroll height delta seamlessly
          requestAnimationFrame(() => {
            if (scrollContainerRef.current) {
              const delta = scrollContainerRef.current.scrollHeight - prevHeight;
              scrollContainerRef.current.scrollTop = prevTop + delta;
            }
          });
        } else {
          setHasMoreOlder(false);
        }
      } catch (err) {
        console.error('Error loading older messages:', err);
      } finally {
        setIsLoadingOlder(false);
        isLoadingOlderRef.current = false;
      }
    }
  };

  // Long-press detection with haptic feedback
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = (msg: Message) => {
    if (msg.is_deleted) return;
    longPressTimerRef.current = setTimeout(() => {
      // Trigger subtle 15ms haptic vibration on mobile
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(15);
        }
      } catch {}
      setActionSheetMessage(msg);
    }, 450);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Accept Message Request Handler
  const handleAcceptRequest = async () => {
    setRequestActionLoading(true);
    try {
      const res = await fetch('/api/chat/requests/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversation.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to accept request');

      setIsIncomingRequest(false);
      setIsOutgoingRequest(false);
      playReceiveSound();
      try {
        confetti({
          particleCount: 65,
          spread: 60,
          origin: { y: 0.7 },
        });
      } catch {}

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('onyx-request-accepted', {
            detail: { conversationId: conversation.id },
          })
        );
      }
    } catch (err: any) {
      alert(err.message || 'Error accepting request');
    } finally {
      setRequestActionLoading(false);
    }
  };

  // Decline Message Request Handler
  const handleDeclineRequest = async () => {
    if (!confirm(`Decline message request from ${partner?.full_name || `@${partner?.username}`}?`)) {
      return;
    }
    setRequestActionLoading(true);
    try {
      const res = await fetch('/api/chat/requests/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversation.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to decline request');

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('onyx-request-accepted', {
            detail: { conversationId: conversation.id },
          })
        );
      }
      onBack();
    } catch (err: any) {
      alert(err.message || 'Error declining request');
    } finally {
      setRequestActionLoading(false);
    }
  };

  // Execute Clear Chat or Delete Whole Chat
  const handleExecuteChatAction = async (mode: 'clear' | 'delete') => {
    setActionInProgress(true);
    try {
      const res = await fetch(
        `/api/chat/conversations?conversation_id=${encodeURIComponent(conversation.id)}&mode=${mode}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${mode} chat`);

      // Clear local IndexedDB cache immediately
      await clearConversationCache(conversation.id);

      // Broadcast over room channel
      if (activeChannelRef.current) {
        activeChannelRef.current.send({
          type: 'broadcast',
          event: mode === 'delete' ? 'chat_deleted' : 'chat_cleared',
          payload: { conversationId: conversation.id },
        });
      }

      // Broadcast to partner user channels
      const otherParticipantIds = (conversation.participants || [])
        .map((p) => p.user_id)
        .filter((uid) => uid !== currentUser.id);

      otherParticipantIds.forEach((uid) => {
        const pChannel = supabase.channel(`user:${uid}`);
        pChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            pChannel.send({
              type: 'broadcast',
              event: mode === 'delete' ? 'chat_deleted' : 'chat_cleared',
              payload: { conversation_id: conversation.id },
            });
          }
        });
      });

      if (mode === 'clear') {
        setMessages([]);
        setConfirmModal(null);
        setChatMenuOpen(false);
        onClearConversation?.(conversation.id);
      } else {
        setConfirmModal(null);
        setChatMenuOpen(false);
        onDeleteConversation?.(conversation.id);
      }
    } catch (err: any) {
      alert(err.message || `Error attempting to ${mode} chat`);
    } finally {
      setActionInProgress(false);
    }
  };

  // Send Message Handler with Client-Side Canvas WebP Compression (<150KB) & 0ms Optimistic Preview
  const handleSendMessage = async (
    msgContent: string,
    file?: File | null,
    isViewOnce = false
  ) => {
    playSendSound();

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    let optMediaType: 'text' | 'image' | 'pdf' | 'file' | 'voice' = 'text';
    let optUrl: string | null = null;
    let fileToUpload = file;

    if (file) {
      const mime = file.type.toLowerCase();
      if (mime.startsWith('audio/') || file.name.includes('voice')) {
        optMediaType = 'voice';
      } else if (mime.startsWith('image/')) {
        optMediaType = 'image';
      } else if (mime === 'application/pdf') {
        optMediaType = 'pdf';
      } else {
        optMediaType = 'file';
      }

      // 0ms instant local preview
      optUrl = URL.createObjectURL(file);

      // Client-side canvas compression (<150KB WebP)
      if (isCompressibleImage(file)) {
        try {
          const comp = await compressImage(file, { maxWidth: 1280, maxHeight: 1280, quality: 0.82 });
          fileToUpload = comp.file;
        } catch {
          // Fallback to original
        }
      }
    }

    const optimistic: Message = {
      id: tempId,
      conversation_id: conversation.id,
      sender_id: currentUser.id,
      content: msgContent || null,
      media_url: optUrl,
      media_type: file ? optMediaType : 'text',
      is_read: false,
      created_at: new Date().toISOString(),
      reply_to_id: replyingTo ? replyingTo.id : null,
      reply_to: replyingTo,
      file_name: file ? file.name : null,
      file_size: fileToUpload ? fileToUpload.size : null,
      view_once_viewed: isViewOnce ? false : null,
      sender: currentUser,
      status: 'sending',
      temp_id: tempId,
    };

    setMessages((prev) => [...prev, optimistic]);
    setReplyingTo(null);
    setText('');
    setTimeout(() => scrollToBottom('smooth'), 10);

    try {
      let finalMediaUrl: string | undefined;
      let finalMediaType: 'text' | 'image' | 'pdf' | 'file' | 'voice' = 'text';
      let finalFileName: string | undefined;
      let finalFileSize: number | undefined;

      if (fileToUpload) {
        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('conversation_id', conversation.id);

        const uploadRes = await fetch('/api/chat/upload', {
          method: 'POST',
          body: formData,
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');

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
          content: msgContent || null,
          media_url: finalMediaUrl,
          media_type: finalMediaType,
          reply_to_id: optimistic.reply_to_id,
          file_name: finalFileName,
          file_size: finalFileSize,
          view_once_viewed: isViewOnce ? false : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send message');

      const confirmed: Message = { ...data.message, status: 'sent' };
      setMessages((prev) => prev.map((m) => (m.id === tempId ? confirmed : m)));
      saveCachedMessage(confirmed);

      // Instant peer-to-peer WebSocket broadcast to active room (<50ms delivery)
      if (activeChannelRef.current) {
        activeChannelRef.current.send({
          type: 'broadcast',
          event: 'new_message',
          payload: confirmed,
        });
      }

      if (onBroadcastMessage) onBroadcastMessage(confirmed);
    } catch (err) {
      console.error('Send error:', err);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'error' } : m)));
    }
  };

  // Voice recording controls
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const rec = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      rec.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone access is required for voice notes.');
    }
  };

  const stopVoiceRecording = () => {
    if (!mediaRecorderRef.current) return;
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    mediaRecorderRef.current.onstop = () => {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
      }
      const mime = mediaRecorderRef.current?.mimeType || 'audio/webm';
      const blob = new Blob(audioChunksRef.current, { type: mime });
      const voiceFile = new File([blob], `voice_${Date.now()}.webm`, { type: mime });

      setIsRecording(false);
      setRecordingSeconds(0);
      audioChunksRef.current = [];

      handleSendMessage('', voiceFile, false);
    };

    mediaRecorderRef.current.stop();
  };

  const cancelVoiceRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
  };

  // Toggle reaction with optimistic update and real-time broadcast
  const handleToggleReaction = async (messageId: string, emoji: string) => {
    let nextReactions: any[] = [];
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const current = m.reactions ? [...m.reactions] : [];
        const idx = current.findIndex((r) => r.emoji === emoji);
        if (idx !== -1) {
          if (current[idx].has_reacted) {
            if (current[idx].count <= 1) current.splice(idx, 1);
            else {
              current[idx] = {
                ...current[idx],
                count: current[idx].count - 1,
                has_reacted: false,
                user_ids: current[idx].user_ids.filter((id) => id !== currentUser.id),
              };
            }
          } else {
            current[idx] = {
              ...current[idx],
              count: current[idx].count + 1,
              has_reacted: true,
              user_ids: [...current[idx].user_ids, currentUser.id],
            };
          }
        } else {
          current.push({ emoji, count: 1, has_reacted: true, user_ids: [currentUser.id] });
        }
        nextReactions = current;
        return { ...m, reactions: current };
      })
    );
    updateCachedMessage(messageId, { reactions: nextReactions });

    // Broadcast reaction update immediately to active room
    if (activeChannelRef.current) {
      activeChannelRef.current.send({
        type: 'broadcast',
        event: 'reaction_update',
        payload: { messageId, reactions: nextReactions },
      });
    }

    try {
      await fetch('/api/chat/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId, emoji }),
      });
    } catch {}
  };

  // Toggle Star
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
      await fetch('/api/chat/starred', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId }),
      });
    } catch {}
  };

  // Edit Message with optimistic update and real-time broadcast
  const handleEditMessage = async (messageId: string, newContent: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: newContent, is_edited: true } : m))
    );
    updateCachedMessage(messageId, { content: newContent, is_edited: true });

    // Broadcast edit immediately to active room
    if (activeChannelRef.current) {
      activeChannelRef.current.send({
        type: 'broadcast',
        event: 'message_edited',
        payload: { messageId, content: newContent },
      });
    }

    try {
      await fetch('/api/chat/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId, content: newContent }),
      });
    } catch {}
  };

  // Delete Message Handler: supports both "Delete for me" and "Delete for everyone"
  const handleDeleteMessage = async (messageId: string, mode: 'me' | 'everyone' = 'everyone') => {
    if (mode === 'me') {
      // 1. Delete for Me: Instantly remove only from this user's view and cache
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      deleteCachedMessage(messageId);

      try {
        await fetch(`/api/chat/messages?message_id=${messageId}&type=me`, { method: 'DELETE' });
      } catch (err) {
        console.warn('Failed to delete for me:', err);
      }
    } else {
      // 2. Delete for Everyone: Soft delete for everyone & broadcast to room
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, is_deleted: true, content: 'This message was deleted', media_url: null, file_name: null }
            : m
        )
      );
      updateCachedMessage(messageId, {
        is_deleted: true,
        content: 'This message was deleted',
        media_url: null,
        file_name: null,
      });

      // Broadcast deletion immediately to active room
      if (activeChannelRef.current) {
        activeChannelRef.current.send({
          type: 'broadcast',
          event: 'message_deleted',
          payload: { messageId },
        });
      }

      try {
        await fetch(`/api/chat/messages?message_id=${messageId}&type=everyone`, { method: 'DELETE' });
      } catch {}
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full relative overflow-hidden bg-[#07080b]">
      {/* Sticky Native Header */}
      <header className="h-[calc(4rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] px-3 bg-[#07080b]/95 backdrop-blur-xl border-b border-white/10 flex items-center justify-between z-20 shrink-0 sticky top-0">
        <div className="flex items-center gap-2.5 overflow-hidden">
          {/* Back Button (Hidden on Desktop if isDesktop is active) */}
          <button
            onClick={onBack}
            className={`p-2 -ml-1 rounded-full text-slate-300 hover:text-white active:bg-white/10 transition-colors touch-manipulation flex items-center justify-center shrink-0 ${
              isDesktop ? 'md:hidden' : ''
            }`}
            aria-label="Back to conversations"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Recipient Avatar */}
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-sm text-brand-300 overflow-hidden shadow-sm">
              {isSaved ? (
                <div className="w-full h-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white">
                  <Bookmark className="w-5 h-5" />
                </div>
              ) : isGroup ? (
                <div className="w-full h-full bg-gradient-to-tr from-indigo-600 to-brand-600 flex items-center justify-center text-white">
                  <Users className="w-5 h-5" />
                </div>
              ) : partner?.avatar_url ? (
                <img src={partner.avatar_url} alt={chatTitle} className="w-full h-full object-cover" />
              ) : (
                chatTitle.slice(0, 2).toUpperCase()
              )}
            </div>

            {!isGroup && !isSaved && isOnline && (
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#07080b]" />
            )}
          </div>

          {/* Title and Typing / Online Status */}
          <div className="overflow-hidden">
            <h2 className="text-xs font-bold text-white truncate flex items-center gap-1.5">
              <span>{chatTitle}</span>
              {partnerFounder && <FounderBadge size="sm" />}
            </h2>

            <p className="text-[10px] truncate flex items-center gap-1">
              {combinedTypingUsers.length > 0 ? (
                <span className="text-brand-400 font-medium animate-pulse">
                  {combinedTypingUsers.join(', ')} typing...
                </span>
              ) : isOnline ? (
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  Online
                </span>
              ) : (
                <span className="text-slate-400">
                  {chatSubtitle}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Call & Chat Options Action Header Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {!isSaved && (
            <>
              <button
                onClick={() => onStartCall?.(conversation, 'voice')}
                className="p-2 rounded-full text-slate-300 hover:text-white active:bg-white/10 transition-colors"
                title="Voice Call"
                aria-label="Voice Call"
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                onClick={() => onStartCall?.(conversation, 'video')}
                className="p-2 rounded-full text-slate-300 hover:text-white active:bg-white/10 transition-colors"
                title="Video Call"
                aria-label="Video Call"
              >
                <Video className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            onClick={() => setChatMenuOpen(true)}
            className="p-2 rounded-full text-slate-300 hover:text-white active:bg-white/10 transition-colors"
            title="Chat Options"
            aria-label="Chat Options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {isDesktop && (
            <button
              onClick={onBack}
              className="p-2 rounded-full text-slate-400 hover:text-white active:bg-white/10 transition-colors"
              title="Close chat"
              aria-label="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Messages Feed Viewport */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3.5 md:px-8 py-4 space-y-1 chat-scroll-viewport overscroll-contain max-w-5xl mx-auto w-full"
      >
        {isLoadingOlder && (
          <div className="py-2 flex justify-center items-center gap-2 text-xs text-brand-400 animate-fadeIn">
            <div className="w-3.5 h-3.5 border-2 border-brand-500/40 border-t-brand-400 rounded-full animate-spin" />
            <span className="text-[11px] text-slate-400">Loading earlier messages...</span>
          </div>
        )}

        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
            <div className="w-7 h-7 border-3 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
            <p className="text-xs">Loading local history...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-brand-500/10 text-brand-400 flex items-center justify-center border border-brand-500/20">
              <Bookmark className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white">
              {isSaved ? 'Your Personal Vault' : 'No messages yet'}
            </h3>
            <p className="text-xs text-slate-400 max-w-xs">
              {isSaved
                ? 'Save voice notes, photos, or document links for quick access.'
                : 'Say hello to start the conversation!'}
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              onClick={() => handleMessageTap(msg)}
              onTouchStart={() => handleTouchStart(msg)}
              onTouchEnd={handleTouchEnd}
              onContextMenu={(e) => {
                e.preventDefault();
                setActionSheetMessage(msg);
              }}
            >
              <MessageBubble
                message={msg}
                currentUserId={currentUser.id}
                isGroup={isGroup}
                theme={currentTheme}
                onReply={(m) => setReplyingTo(m)}
                onToggleReaction={handleToggleReaction}
                onToggleStar={handleToggleStar}
                onEditMessage={handleEditMessage}
                onDeleteMessage={handleDeleteMessage}
              />
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quoted Reply Banner */}
      {replyingTo && (
        <div className="px-4 py-2 bg-slate-900/95 border-t border-white/10 flex items-center justify-between text-xs animate-fadeIn shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <CornerDownRight className="w-3.5 h-3.5 text-brand-400 shrink-0" />
            <div className="overflow-hidden">
              <p className="text-[10px] font-bold text-brand-300">
                Replying to {replyingTo.sender?.full_name || 'User'}
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                {replyingTo.content || (replyingTo.media_type === 'image' ? '📷 Photo' : '📎 Attachment')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="p-1 text-slate-400 hover:text-white touch-manipulation"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Bottom Message Input Bar OR Instagram-style Accept/Decline Banner */}
      <div className="w-full max-w-5xl mx-auto shrink-0">
        {isIncomingRequest ? (
          <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] bg-[#090b12] border-t border-white/10 shrink-0 space-y-3 animate-slideUp">
          <div className="text-center space-y-1">
            <p className="text-xs font-bold text-white flex items-center justify-center gap-1.5">
              <span>Accept message request from {partner?.full_name || 'User'}?</span>
              {partnerFounder && <FounderBadge size="sm" />}
            </p>
            <p className="text-[11px] text-slate-400 max-w-xs mx-auto leading-relaxed">
              If you accept, they will be able to message and call you and see info like your activity status and read receipts.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={handleDeclineRequest}
              disabled={requestActionLoading}
              className="py-2.5 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 touch-manipulation disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              <span>Decline</span>
            </button>

            <button
              onClick={handleAcceptRequest}
              disabled={requestActionLoading}
              className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-brand-600 via-indigo-600 to-pink-600 hover:from-brand-500 hover:to-pink-500 active:scale-95 text-white text-xs font-bold transition-all shadow-lg shadow-brand-500/30 flex items-center justify-center gap-1.5 touch-manipulation disabled:opacity-50"
            >
              {requestActionLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Accept</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom,0px))] bg-[#07080b]/95 backdrop-blur-2xl border-t border-white/10 shrink-0">
          {/* Outgoing Request Banner */}
          {isOutgoingRequest && (
            <div className="mb-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
              <p className="text-[11px] text-amber-300 font-medium">
                ⏳ Message request sent to @{partner?.username || 'user'}. They can reply once they accept.
              </p>
            </div>
          )}

          {isRecording ? (
            <div className="flex items-center justify-between bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-2.5">
              <div className="flex items-center gap-2 text-rose-400 text-xs font-mono font-bold animate-pulse">
                <Mic className="w-4 h-4" />
                <span>Recording: {recordingSeconds}s</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelVoiceRecording}
                  className="px-3 py-1 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold touch-manipulation"
                >
                  Cancel
                </button>
                <button
                  onClick={stopVoiceRecording}
                  className="px-3 py-1 rounded-xl bg-rose-600 text-white text-xs font-semibold shadow-lg shadow-rose-600/30 touch-manipulation"
                >
                  Send
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {/* Attachment Button (+) */}
              <button
                onClick={() => setAttachmentSheetOpen(true)}
                className="p-2 rounded-2xl bg-white/5 border border-white/10 text-slate-300 hover:text-white active:scale-95 transition-all touch-manipulation shrink-0"
                title="Add attachment"
                aria-label="Add attachment"
              >
                <Plus className="w-5 h-5" />
              </button>

              {/* Input Field */}
              <div className="flex-1 bg-slate-900/90 border border-white/10 rounded-2xl px-3.5 py-2 focus-within:border-brand-500/80 transition-colors flex items-center">
                <input
                  type="text"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    handleTyping();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && text.trim()) {
                      e.preventDefault();
                      handleSendMessage(text.trim());
                    }
                  }}
                  placeholder="Message..."
                  className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                />
              </div>

              {/* Send or Voice Record Button */}
              {text.trim() ? (
                <button
                  onClick={() => handleSendMessage(text.trim())}
                  className="p-2.5 rounded-2xl bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-lg shadow-brand-500/25 active:scale-95 transition-transform touch-manipulation shrink-0"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={startVoiceRecording}
                  className="p-2.5 rounded-2xl bg-white/5 border border-white/10 text-slate-300 hover:text-white active:scale-95 transition-all touch-manipulation shrink-0"
                  aria-label="Record voice note"
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
      </div>

      {/* Attachment Bottom Sheet */}
      <MobileAttachmentSheet
        isOpen={attachmentSheetOpen}
        onClose={() => setAttachmentSheetOpen(false)}
        onSelectFile={(file, isViewOnce) => {
          handleSendMessage('', file, isViewOnce);
        }}
        onStartVoiceRecord={startVoiceRecording}
      />

      {/* Message Long-Press Action Bottom Sheet with Haptics */}
      <MobileMessageActionSheet
        isOpen={Boolean(actionSheetMessage)}
        message={actionSheetMessage}
        currentUserId={currentUser.id}
        onClose={() => setActionSheetMessage(null)}
        onReply={(m) => setReplyingTo(m)}
        onToggleReaction={handleToggleReaction}
        onToggleStar={handleToggleStar}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
      />

      {/* Chat Options Bottom Sheet */}
      {chatMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end justify-center animate-fadeIn"
          onClick={() => setChatMenuOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#0e1017] border-t border-white/10 rounded-t-3xl p-5 shadow-2xl animate-fadeIn gpu-accelerated space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-2" />

            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-xs text-brand-300 overflow-hidden">
                  {partner?.avatar_url ? (
                    <img src={partner.avatar_url} alt={chatTitle} className="w-full h-full object-cover" />
                  ) : (
                    chatTitle.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white truncate max-w-[200px]">{chatTitle}</h4>
                  <p className="text-[10px] text-slate-400">Manage Conversation</p>
                </div>
              </div>
              <button
                onClick={() => setChatMenuOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-white bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <button
                onClick={() => {
                  setChatMenuOpen(false);
                  setConfirmModal({ mode: 'clear' });
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
                  setChatMenuOpen(false);
                  setConfirmModal({ mode: 'delete' });
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
      {confirmModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => !actionInProgress && setConfirmModal(null)}
        >
          <div
            className="w-full max-w-sm bg-[#0e1017] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4 animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  confirmModal.mode === 'delete'
                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                }`}
              >
                {confirmModal.mode === 'delete' ? (
                  <Trash2 className="w-6 h-6" />
                ) : (
                  <Eraser className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {confirmModal.mode === 'delete' ? 'Delete Whole Chat?' : 'Clear Chat Messages?'}
                </h3>
                <p className="text-xs text-slate-400">
                  {confirmModal.mode === 'delete'
                    ? 'Permanently delete this chat'
                    : 'Clear all messages'}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-400 bg-white/[0.03] p-3 rounded-xl border border-white/5 leading-relaxed">
              {confirmModal.mode === 'delete'
                ? 'Are you sure you want to delete this entire chat? This action cannot be reversed and will wipe history for all members.'
                : 'Are you sure you want to clear all messages? The empty conversation will remain in your chat list.'}
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={actionInProgress}
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionInProgress}
                onClick={() => handleExecuteChatAction(confirmModal.mode)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-all shadow-lg ${
                  confirmModal.mode === 'delete'
                    ? 'bg-gradient-to-r from-rose-600 to-red-600 shadow-rose-600/30 hover:brightness-110 active:scale-98'
                    : 'bg-gradient-to-r from-amber-600 to-orange-600 shadow-amber-600/30 hover:brightness-110 active:scale-98'
                }`}
              >
                {actionInProgress ? (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : confirmModal.mode === 'delete' ? (
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
