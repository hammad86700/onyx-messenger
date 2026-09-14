'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  ScreenShare,
  Hand,
  MessageSquare,
  Smile,
  Copy,
  Check,
  Users,
  LogOut,
  Sparkles,
  PhoneOff,
  Maximize,
  Minimize,
  Share2,
  Lock,
  Radio,
  Send,
  X,
} from 'lucide-react';
import { Profile, isFounder } from '@/types/database';
import { callSound } from '@/lib/call-sound';
import {
  getVideoStream,
  getAudioStream,
  getScreenShareStream,
  stopMediaStream,
} from '@/lib/webrtc';
import { createClient } from '@/lib/supabase/client';
import FounderBadge from '@/components/chat/FounderBadge';

interface MeetingParticipant {
  id: string;
  username: string;
  full_name: string;
  avatar_url?: string | null;
  is_muted: boolean;
  is_video_off: boolean;
  is_hand_raised: boolean;
  is_screen_sharing: boolean;
  stream?: MediaStream | null;
}

interface InMeetingMessage {
  id: string;
  sender_name: string;
  sender_avatar?: string | null;
  content: string;
  timestamp: string;
}

interface FloatingReaction {
  id: string;
  emoji: string;
  leftPercent: number;
}

interface OnyxMeetViewProps {
  currentUser: Profile;
  onClose?: () => void;
}

export default function OnyxMeetView({ currentUser, onClose }: OnyxMeetViewProps) {
  const supabase = createClient();

  // Mode: 'lobby' | 'meeting'
  const [inMeeting, setInMeeting] = useState(false);
  const [meetingCode, setMeetingCode] = useState('');
  const [joinInputCode, setJoinInputCode] = useState('');

  // Local media controls
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);

  // Participants & Room State
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<InMeetingMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [copied, setCopied] = useState(false);
  const [meetingDuration, setMeetingDuration] = useState(0);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const lobbyVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const roomChannelRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  // 1. Initialize Lobby Preview Media
  useEffect(() => {
    let mounted = true;
    async function initLobby() {
      try {
        const stream = await getVideoStream('user');
        if (!mounted) {
          stopMediaStream(stream);
          return;
        }
        localStreamRef.current = stream;
        if (lobbyVideoRef.current) {
          lobbyVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn('Lobby camera preview note:', err);
        setIsVideoOff(true);
      }
    }

    if (!inMeeting) {
      initLobby();
    }

    return () => {
      mounted = false;
    };
  }, [inMeeting]);

  // 2. Meeting Duration Counter
  useEffect(() => {
    if (inMeeting) {
      setMeetingDuration(0);
      timerRef.current = setInterval(() => {
        setMeetingDuration((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [inMeeting]);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // 3. Join / Start Room via Supabase Realtime Channel
  const handleJoinMeeting = async (codeToJoin: string) => {
    const cleanCode = codeToJoin.trim().toUpperCase() || `OXM-${Math.floor(100 + Math.random() * 900)}-${Math.floor(100 + Math.random() * 900)}`;
    setMeetingCode(cleanCode);
    setInMeeting(true);
    callSound.playMeetingJoinSound();

    // Attach local stream to in-meeting video
    if (localStreamRef.current && localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }

    // Set self as initial participant
    const selfParticipant: MeetingParticipant = {
      id: currentUser.id,
      username: currentUser.username,
      full_name: currentUser.full_name,
      avatar_url: currentUser.avatar_url,
      is_muted: isMuted,
      is_video_off: isVideoOff,
      is_hand_raised: isHandRaised,
      is_screen_sharing: false,
      stream: localStreamRef.current,
    };
    setParticipants([selfParticipant]);

    // Subscribe to meeting broadcast channel
    const channel = supabase.channel(`meet:${cleanCode}`, {
      config: { presence: { key: currentUser.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const activeUsers: MeetingParticipant[] = [];
        Object.entries(state).forEach(([userId, presences]: [string, any]) => {
          const userMeta = presences[0];
          if (userMeta) {
            activeUsers.push({
              id: userId,
              username: userMeta.username || 'User',
              full_name: userMeta.full_name || 'Participant',
              avatar_url: userMeta.avatar_url,
              is_muted: userMeta.is_muted ?? false,
              is_video_off: userMeta.is_video_off ?? false,
              is_hand_raised: userMeta.is_hand_raised ?? false,
              is_screen_sharing: userMeta.is_screen_sharing ?? false,
            });
          }
        });
        setParticipants(activeUsers);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        callSound.playMeetingJoinSound();
      })
      .on('broadcast', { event: 'chat_msg' }, ({ payload }) => {
        setChatMessages((prev) => [...prev, payload]);
      })
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        triggerFloatingReaction(payload.emoji);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            username: currentUser.username,
            full_name: currentUser.full_name,
            avatar_url: currentUser.avatar_url,
            is_muted: isMuted,
            is_video_off: isVideoOff,
            is_hand_raised: isHandRaised,
            is_screen_sharing: false,
          });
        }
      });

    roomChannelRef.current = channel;
  };

  // Leave Meeting
  const handleLeaveMeeting = () => {
    if (roomChannelRef.current) {
      supabase.removeChannel(roomChannelRef.current);
      roomChannelRef.current = null;
    }
    stopMediaStream(screenStreamRef.current);
    screenStreamRef.current = null;
    setIsScreenSharing(false);
    setIsHandRaised(false);
    setInMeeting(false);
    callSound.playCallEnded();
  };

  // Toggle Mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const nextMuted = !audioTrack.enabled;
        setIsMuted(nextMuted);
        roomChannelRef.current?.track({
          username: currentUser.username,
          full_name: currentUser.full_name,
          avatar_url: currentUser.avatar_url,
          is_muted: nextMuted,
          is_video_off: isVideoOff,
          is_hand_raised: isHandRaised,
          is_screen_sharing: isScreenSharing,
        });
      }
    }
  };

  // Toggle Video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const nextOff = !videoTrack.enabled;
        setIsVideoOff(nextOff);
        roomChannelRef.current?.track({
          username: currentUser.username,
          full_name: currentUser.full_name,
          avatar_url: currentUser.avatar_url,
          is_muted: isMuted,
          is_video_off: nextOff,
          is_hand_raised: isHandRaised,
          is_screen_sharing: isScreenSharing,
        });
      }
    }
  };

  // Toggle Screen Share
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      stopMediaStream(screenStreamRef.current);
      screenStreamRef.current = null;
      setIsScreenSharing(false);
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      roomChannelRef.current?.track({
        username: currentUser.username,
        full_name: currentUser.full_name,
        avatar_url: currentUser.avatar_url,
        is_muted: isMuted,
        is_video_off: isVideoOff,
        is_hand_raised: isHandRaised,
        is_screen_sharing: false,
      });
    } else {
      try {
        const stream = await getScreenShareStream();
        screenStreamRef.current = stream;
        setIsScreenSharing(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        stream.getVideoTracks()[0].onended = () => {
          toggleScreenShare();
        };

        roomChannelRef.current?.track({
          username: currentUser.username,
          full_name: currentUser.full_name,
          avatar_url: currentUser.avatar_url,
          is_muted: isMuted,
          is_video_off: isVideoOff,
          is_hand_raised: isHandRaised,
          is_screen_sharing: true,
        });
      } catch (err) {
        console.warn('Screen share canceled or not supported:', err);
      }
    }
  };

  // Toggle Raise Hand
  const toggleHand = () => {
    const nextHand = !isHandRaised;
    setIsHandRaised(nextHand);
    roomChannelRef.current?.track({
      username: currentUser.username,
      full_name: currentUser.full_name,
      avatar_url: currentUser.avatar_url,
      is_muted: isMuted,
      is_video_off: isVideoOff,
      is_hand_raised: nextHand,
      is_screen_sharing: isScreenSharing,
    });
  };

  // Send Live Reaction (👏, ❤️, 🔥, 🎉, 👍)
  const sendReaction = (emoji: string) => {
    triggerFloatingReaction(emoji);
    roomChannelRef.current?.send({
      type: 'broadcast',
      event: 'reaction',
      payload: { emoji, sender: currentUser.username },
    });
  };

  const triggerFloatingReaction = (emoji: string) => {
    const id = `${Date.now()}_${Math.random()}`;
    const leftPercent = 20 + Math.random() * 60;
    setReactions((prev) => [...prev, { id, emoji, leftPercent }]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2500);
  };

  // Send In-Meeting Chat Message
  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const msg: InMeetingMessage = {
      id: `msg_${Date.now()}`,
      sender_name: currentUser.full_name || currentUser.username,
      sender_avatar: currentUser.avatar_url,
      content: chatInput.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, msg]);
    roomChannelRef.current?.send({
      type: 'broadcast',
      event: 'chat_msg',
      payload: msg,
    });
    setChatInput('');
  };

  const copyMeetingInfo = () => {
    const text = `Join my Onyx Meet Room!\nMeeting Code: ${meetingCode}\nDirect Link: ${window.location.origin}?meet=${meetingCode}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // -------------------------------------------------------------
  // RENDER: Pre-Join Lobby View
  // -------------------------------------------------------------
  if (!inMeeting) {
    return (
      <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center p-4 bg-[#07080b] text-white overflow-y-auto chat-scroll-viewport animate-fadeIn">
        <div className="w-full max-w-md bg-slate-900/80 border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-xl relative">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-pink-600 text-white shadow-xl shadow-brand-500/25 mb-3">
              <Video className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-white">Onyx Meet</h1>
            <p className="text-xs text-brand-400 font-mono mt-0.5 font-semibold">
              Live Video Conferencing • Like Zoom & Google Meet
            </p>
          </div>

          {/* Camera Preview Box */}
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-white/10 mb-5 flex items-center justify-center shadow-inner">
            <video
              ref={lobbyVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {isVideoOff && (
              <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-2">
                <VideoOff className="w-8 h-8 text-slate-500" />
                <span className="text-xs font-medium">Camera is Off</span>
              </div>
            )}

            {/* Quick Preview Toggle Overlay */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-center gap-3">
              <button
                onClick={toggleMute}
                className={`p-2.5 rounded-xl backdrop-blur-md transition-colors ${
                  isMuted ? 'bg-amber-500 text-white' : 'bg-black/60 text-white hover:bg-black/80'
                }`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                onClick={toggleVideo}
                className={`p-2.5 rounded-xl backdrop-blur-md transition-colors ${
                  isVideoOff ? 'bg-amber-500 text-white' : 'bg-black/60 text-white hover:bg-black/80'
                }`}
                title={isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
              >
                {isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Start Instant Meeting Button */}
          <button
            onClick={() => handleJoinMeeting('')}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-brand-600 via-indigo-600 to-pink-600 hover:from-brand-500 hover:to-pink-500 text-white text-xs font-bold shadow-lg shadow-brand-500/25 active:scale-98 transition-all flex items-center justify-center gap-2 mb-4"
          >
            <Sparkles className="w-4 h-4" />
            <span>Start Instant Meeting</span>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[11px] text-slate-500 uppercase font-mono">or join with code</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Join with Code Input */}
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              placeholder="e.g. OXM-784-219"
              value={joinInputCode}
              onChange={(e) => setJoinInputCode(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 uppercase font-mono"
            />
            <button
              onClick={() => handleJoinMeeting(joinInputCode)}
              disabled={!joinInputCode.trim()}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white text-xs font-bold transition-colors"
            >
              Join
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: In-Meeting Live Room (Zoom/Google Meet Experience)
  // -------------------------------------------------------------
  return (
    <div className="flex-1 min-h-0 w-full h-full flex flex-col bg-[#050608] text-white relative overflow-hidden animate-fadeIn">
      {/* Floating Emoji Reactions Bursts */}
      <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
        {reactions.map((r) => (
          <div
            key={r.id}
            style={{ left: `${r.leftPercent}%` }}
            className="absolute bottom-16 text-3xl animate-floatUp select-none drop-shadow-lg"
          >
            {r.emoji}
          </div>
        ))}
      </div>

      {/* Top Meeting Header Bar */}
      <header className="h-14 px-4 bg-black/60 backdrop-blur-md border-b border-white/10 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-[11px] font-mono font-bold text-brand-300">
            <Radio className="w-3 h-3 text-brand-400 animate-pulse" />
            <span>{meetingCode}</span>
          </div>
          <button
            onClick={copyMeetingInfo}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="Copy Meeting Invite"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
            {formatDuration(meetingDuration)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-slate-400 px-2.5 py-1 rounded-xl bg-white/5">
            <Users className="w-3.5 h-3.5 text-brand-400" />
            <span>{participants.length}</span>
          </div>
          <button
            onClick={handleLeaveMeeting}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-rose-600/30"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>Leave</span>
          </button>
        </div>
      </header>

      {/* Center Stage: Multi-Tile Video Grid & Spotlight */}
      <div className="flex-1 min-h-0 relative flex p-3 gap-3 overflow-hidden">
        {/* Video Grid */}
        <div
          className={`flex-1 min-h-0 grid gap-3 ${
            participants.length <= 1
              ? 'grid-cols-1'
              : participants.length === 2
              ? 'grid-cols-1 sm:grid-cols-2'
              : 'grid-cols-2'
          } auto-rows-fr`}
        >
          {/* Tile 1: Local User */}
          <div className="relative rounded-3xl overflow-hidden bg-slate-950 border-2 border-white/10 shadow-xl flex items-center justify-center group">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {isVideoOff && (
              <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-center p-4">
                <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-brand-500/40 flex items-center justify-center text-2xl font-bold text-white shadow-xl mb-2">
                  {currentUser.avatar_url ? (
                    <img src={currentUser.avatar_url} alt="Me" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    currentUser.full_name?.slice(0, 2).toUpperCase()
                  )}
                </div>
              </div>
            )}

            {/* Speaking / Name Tag Overlay */}
            <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-[11px] font-semibold text-white flex items-center gap-1.5">
              <span>{currentUser.full_name} (You)</span>
              {isMuted && <MicOff className="w-3 h-3 text-rose-400" />}
            </div>

            {/* Hand Raised Badge */}
            {isHandRaised && (
              <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-amber-500 text-white text-xs font-bold shadow-lg flex items-center gap-1 animate-bounce">
                <span>✋ Hand Raised</span>
              </div>
            )}
          </div>

          {/* Other Participants Tiles */}
          {participants
            .filter((p) => p.id !== currentUser.id)
            .map((p) => (
              <div
                key={p.id}
                className="relative rounded-3xl overflow-hidden bg-slate-950 border-2 border-white/10 shadow-xl flex items-center justify-center"
              >
                <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-brand-500/40 flex items-center justify-center text-2xl font-bold text-white shadow-xl">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt={p.full_name} className="w-full h-full object-cover rounded-full" />
                  ) : (
                    p.full_name?.slice(0, 2).toUpperCase() || 'P'
                  )}
                </div>

                <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-[11px] font-semibold text-white flex items-center gap-1.5">
                  <span>{p.full_name}</span>
                  {p.is_muted && <MicOff className="w-3 h-3 text-rose-400" />}
                </div>

                {p.is_hand_raised && (
                  <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-amber-500 text-white text-xs font-bold shadow-lg flex items-center gap-1 animate-bounce">
                    <span>✋ Hand Raised</span>
                  </div>
                )}
              </div>
            ))}
        </div>

        {/* Collapsible In-Meeting Chat Drawer */}
        {isChatOpen && (
          <div className="w-80 h-full rounded-3xl bg-slate-900/95 border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-fadeIn shrink-0">
            {/* Chat Drawer Header */}
            <div className="p-3.5 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-brand-400" />
                <span>In-Meeting Chat</span>
              </h3>
              <button
                onClick={() => setIsChatOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chat Messages Feed */}
            <div className="flex-1 p-3 overflow-y-auto space-y-2.5 text-xs chat-scroll-viewport">
              {chatMessages.length === 0 ? (
                <div className="text-center text-slate-500 text-[11px] py-10">
                  No messages yet. Send a message to everyone in the room.
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="space-y-0.5">
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <span className="font-bold text-brand-300">{msg.sender_name}</span>
                      <span>•</span>
                      <span>{msg.timestamp}</span>
                    </div>
                    <div className="p-2 rounded-xl bg-white/[0.04] border border-white/5 text-slate-200">
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendChatMessage} className="p-2.5 border-t border-white/10 flex gap-2">
              <input
                type="text"
                placeholder="Message everyone..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="p-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Floating Bottom Toolbar (Zoom Style) */}
      <footer className="h-20 px-4 pb-2 bg-gradient-to-t from-black via-black/90 to-transparent flex items-center justify-center gap-2 sm:gap-3 z-30 shrink-0">
        {/* Mute Mic */}
        <button
          onClick={toggleMute}
          className={`flex flex-col items-center gap-1 p-2 sm:px-3 rounded-2xl transition-all ${
            isMuted ? 'bg-rose-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          <span className="text-[10px]">{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        {/* Video Toggle */}
        <button
          onClick={toggleVideo}
          className={`flex flex-col items-center gap-1 p-2 sm:px-3 rounded-2xl transition-all ${
            isVideoOff ? 'bg-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title={isVideoOff ? 'Start Video' : 'Stop Video'}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          <span className="text-[10px]">{isVideoOff ? 'Start' : 'Stop'}</span>
        </button>

        {/* Screen Share */}
        <button
          onClick={toggleScreenShare}
          className={`flex flex-col items-center gap-1 p-2 sm:px-3 rounded-2xl transition-all ${
            isScreenSharing ? 'bg-emerald-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title="Share Screen"
        >
          <ScreenShare className="w-5 h-5" />
          <span className="text-[10px]">{isScreenSharing ? 'Sharing' : 'Share'}</span>
        </button>

        {/* Raise Hand */}
        <button
          onClick={toggleHand}
          className={`flex flex-col items-center gap-1 p-2 sm:px-3 rounded-2xl transition-all ${
            isHandRaised ? 'bg-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title="Raise Hand"
        >
          <Hand className="w-5 h-5" />
          <span className="text-[10px]">{isHandRaised ? 'Lower' : 'Hand'}</span>
        </button>

        {/* Live Reactions */}
        <div className="flex items-center gap-1 bg-white/10 p-1 rounded-2xl">
          {['👏', '❤️', '🔥', '🎉', '👍'].map((emoji) => (
            <button
              key={emoji}
              onClick={() => sendReaction(emoji)}
              className="p-1.5 hover:scale-125 active:scale-95 transition-transform text-sm"
              title={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Chat Drawer Toggle */}
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`flex flex-col items-center gap-1 p-2 sm:px-3 rounded-2xl transition-all ${
            isChatOpen ? 'bg-brand-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title="Chat"
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[10px]">Chat</span>
        </button>
      </footer>
    </div>
  );
}
