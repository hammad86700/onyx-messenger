'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Message, Profile, MessageReactionSummary, isFounder, OnyxTheme } from '@/types/database';
import { formatMessageTime, formatFileSize } from '@/lib/utils';
import FounderBadge from './FounderBadge';
import MessageContent from './MessageContent';
import {
  FileText,
  Download,
  Check,
  CheckCheck,
  X,
  Maximize2,
  File,
  Clock,
  AlertCircle,
  Reply,
  Smile,
  Edit2,
  Trash2,
  Play,
  Pause,
  Flame,
  Lock,
  Eye,
  Volume2,
  Star,
} from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  currentUserId: string;
  isGroup?: boolean;
  highlightQuery?: string;
  theme?: OnyxTheme;
  onReply?: (message: Message) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onToggleStar?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onViewOnceOpened?: (messageId: string) => void;
  scrollToMessage?: (messageId: string) => void;
}

const QUICK_EMOJIS = ['❤️', '🔥', '😂', '👍', '😮'];

export default function MessageBubble({
  message,
  currentUserId,
  isGroup = false,
  highlightQuery = '',
  theme = 'onyx-pure',
  onReply,
  onToggleReaction,
  onToggleStar,
  onEditMessage,
  onDeleteMessage,
  onViewOnceOpened,
  scrollToMessage,
}: MessageBubbleProps) {
  const isMine = message.sender_id === currentUserId;

  // Modals & Floating Menus
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || '');
  const [editSaving, setEditSaving] = useState(false);

  // View-Once Photo State
  const [viewOnceModal, setViewOnceModal] = useState(false);
  const [viewOnceSeconds, setViewOnceSeconds] = useState(10);

  // Voice Note Audio Player State
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioSpeed, setAudioSpeed] = useState<1 | 1.5 | 2>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const is15MinWindow =
    Date.now() - new Date(message.created_at).getTime() <= 15 * 60 * 1000;

  const isVoice =
    message.media_type === 'voice' ||
    (message.media_url && /\.(webm|mp3|wav|ogg|m4a)$/i.test(message.media_url) && message.media_url.includes('voice'));

  const isPdf =
    message.media_type === 'pdf' ||
    (message.media_url && message.media_url.toLowerCase().endsWith('.pdf'));

  const isImage =
    message.media_type === 'image' ||
    (message.media_url && /\.(png|jpe?g|webp|gif|svg)$/i.test(message.media_url));

  const isViewOnce = message.view_once_viewed !== null && typeof message.view_once_viewed !== 'undefined';
  const isViewOnceExpired = message.view_once_viewed === true;

  const getFileName = (url: string) => {
    if (message.file_name) return message.file_name;
    try {
      const parts = url.split('/');
      const fullName = parts[parts.length - 1];
      const match = fullName.match(/^\d+_(.+)$/);
      return match ? decodeURIComponent(match[1]) : decodeURIComponent(fullName);
    } catch {
      return 'Attachment';
    }
  };

  // Voice Player Controls with WebM streaming support
  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    const dur = audioRef.current.duration;
    if (dur && !isNaN(dur) && isFinite(dur)) {
      setAudioDuration(dur);
    } else if (dur === Infinity) {
      // Chromium WebM duration workaround
      audioRef.current.currentTime = 1e101;
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current) {
          audioRef.current.ontimeupdate = () => {
            if (audioRef.current) {
              setAudioProgress(audioRef.current.currentTime);
            }
          };
          if (isFinite(audioRef.current.duration)) {
            setAudioDuration(audioRef.current.duration);
          }
          audioRef.current.currentTime = 0;
        }
      };
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setAudioProgress(audioRef.current.currentTime);
    const dur = audioRef.current.duration;
    if (dur && !isNaN(dur) && isFinite(dur) && audioDuration === 0) {
      setAudioDuration(dur);
    }
  };

  const handleWaveformSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !audioDuration || isNaN(audioDuration) || !isFinite(audioDuration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = ratio * audioDuration;
    audioRef.current.currentTime = newTime;
    setAudioProgress(newTime);
  };

  const toggleVoicePlay = async () => {
    if (!audioRef.current) return;
    if (isPlayingVoice) {
      audioRef.current.pause();
      setIsPlayingVoice(false);
    } else {
      audioRef.current.playbackRate = audioSpeed;
      try {
        await audioRef.current.play();
        setIsPlayingVoice(true);
      } catch (err) {
        console.warn('Audio play error, retrying load:', err);
        try {
          audioRef.current.load();
          await audioRef.current.play();
          setIsPlayingVoice(true);
        } catch (e2) {
          console.error('Audio playback failed:', e2);
          setIsPlayingVoice(false);
        }
      }
    }
  };

  const cycleSpeed = () => {
    const nextSpeed: 1 | 1.5 | 2 = audioSpeed === 1 ? 1.5 : audioSpeed === 1.5 ? 2 : 1;
    setAudioSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  // View-Once 10-Second Countdown
  useEffect(() => {
    if (!viewOnceModal) return;

    setViewOnceSeconds(10);
    const interval = setInterval(() => {
      setViewOnceSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          closeViewOnce();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [viewOnceModal]);

  const openViewOnce = () => {
    if (isViewOnceExpired) return;
    setViewOnceModal(true);
  };

  const closeViewOnce = () => {
    setViewOnceModal(false);
    if (onViewOnceOpened && !message.view_once_viewed) {
      onViewOnceOpened(message.id);
    }
  };

  // Inline Edit Save
  const handleSaveEdit = async () => {
    if (!editContent.trim() || editSaving) return;
    setEditSaving(true);
    try {
      if (onEditMessage) {
        await onEditMessage(message.id, editContent.trim());
      }
      setIsEditing(false);
    } catch {
      // error handled in parent
    } finally {
      setEditSaving(false);
    }
  };

  // Touch Swipe-To-Reply Gesture State
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = e.touches[0].clientX - touchStartX;
    if (diff > 0 && diff <= 80) {
      setSwipeOffset(diff);
    }
  };

  const handleTouchEnd = () => {
    if (swipeOffset >= 45 && onReply && !message.is_deleted) {
      onReply(message);
    }
    setSwipeOffset(0);
    setTouchStartX(null);
  };

  return (
    <div
      id={`msg-${message.id}`}
      className={`group relative flex flex-col mb-3.5 transition-all ${
        isMine ? 'items-end' : 'items-start'
      } animate-fadeIn`}
    >
      {/* Group sender name for incoming messages */}
      {!isMine && isGroup && message.sender && (
        <span className="text-[11px] font-medium text-brand-400 mb-1 ml-10 flex items-center gap-1.5 flex-wrap">
          <span>{message.sender.full_name}</span>
          {isFounder(message.sender) && <FounderBadge />}
          {message.sender.status_emoji && <span>{message.sender.status_emoji}</span>}
          <span className="text-slate-500 font-mono text-[10px]">
            @{message.sender.username}
          </span>
        </span>
      )}

      {/* Message Row with Floating Action Bar & Touch Swipe */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
          transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : 'none',
        }}
        className={`flex items-end gap-2 max-w-[82%] sm:max-w-[70%] min-w-0 relative ${
          isMine ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {/* Swipe-to-reply icon indicator */}
        {swipeOffset > 10 && (
          <div
            style={{ opacity: Math.min(1, swipeOffset / 45) }}
            className="absolute -left-7 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-brand-500/30 text-brand-300 flex items-center justify-center pointer-events-none transition-opacity shadow-sm"
          >
            <Reply className="w-3.5 h-3.5" />
          </div>
        )}

        {/* Avatar for received messages */}
        {!isMine && (
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-brand-300 overflow-hidden shrink-0 mb-1">
            {message.sender?.avatar_url ? (
              <img
                src={message.sender.avatar_url}
                alt={message.sender?.username || 'user'}
                className="w-full h-full object-cover"
              />
            ) : (
              message.sender?.full_name?.slice(0, 2).toUpperCase() || 'U'
            )}
          </div>
        )}

        {/* Bubble container with Theme Gradients */}
        <div
          className={`relative rounded-2xl p-3 shadow-md transition-all message-bubble touch-manipulation min-w-0 max-w-full overflow-hidden ${
            message.is_deleted
              ? 'bg-slate-900/60 border border-white/5 text-slate-400 italic'
              : isMine
              ? theme === 'midnight-violet'
                ? 'bg-gradient-to-tr from-indigo-600 via-purple-600 to-violet-500 text-white rounded-br-none shadow-lg shadow-purple-500/20'
                : theme === 'emerald-stealth'
                ? 'bg-gradient-to-tr from-emerald-700 via-teal-700 to-cyan-700 text-white rounded-br-none shadow-lg shadow-emerald-500/20'
                : theme === 'sunset-horizon'
                ? 'bg-gradient-to-tr from-rose-600 via-pink-600 to-amber-600 text-white rounded-br-none shadow-lg shadow-rose-500/20'
                : 'bg-gradient-to-tr from-brand-700 to-indigo-600 text-white rounded-br-none shadow-brand-500/10'
              : 'bg-slate-900/95 text-slate-100 rounded-bl-none border border-white/10'
          }`}
        >
          {/* Quoted Reply Preview Block */}
          {message.reply_to && !message.is_deleted && (
            <div
              onClick={() => scrollToMessage && message.reply_to_id && scrollToMessage(message.reply_to_id)}
              className={`mb-2 p-2 rounded-xl text-xs flex flex-col gap-0.5 border-l-3 cursor-pointer transition-colors ${
                isMine
                  ? 'bg-black/25 border-brand-300 hover:bg-black/35 text-slate-200'
                  : 'bg-slate-800/80 border-indigo-500 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <span className="font-bold text-[10px] text-brand-300 truncate">
                {message.reply_to.sender?.full_name || 'User'}
              </span>
              <p className="truncate opacity-85 text-[11px]">
                {message.reply_to.content || (message.reply_to.media_type === 'image' ? '📷 Photo' : '📎 Attachment')}
              </p>
            </div>
          )}

          {/* Deleted Message State */}
          {message.is_deleted ? (
            <div className="flex items-center gap-2 py-0.5 text-xs text-slate-400 italic">
              <Trash2 className="w-3.5 h-3.5 opacity-60" />
              <span>This message was deleted</span>
            </div>
          ) : (
            <>
              {/* Voice Note Audio Waveform Player */}
              {message.media_url && isVoice && (
                <div className="mb-2 p-2.5 rounded-xl bg-slate-950/75 border border-white/10 flex items-center gap-2.5 sm:gap-3 w-full max-w-[270px] sm:max-w-xs">
                  <audio
                    ref={audioRef}
                    src={message.media_url}
                    preload="metadata"
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => {
                      setIsPlayingVoice(false);
                      setAudioProgress(0);
                    }}
                    onError={() => setIsPlayingVoice(false)}
                    className="hidden"
                  />

                  {/* Play/Pause Button */}
                  <button
                    type="button"
                    onClick={toggleVoicePlay}
                    className="w-9 h-9 rounded-full bg-brand-600 hover:bg-brand-500 text-white flex items-center justify-center shrink-0 shadow-md transition-transform hover:scale-105"
                  >
                    {isPlayingVoice ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>

                  {/* Animated Waveform Bars with Interactive Scrubbing */}
                  <div
                    onClick={handleWaveformSeek}
                    title="Click to seek"
                    className="flex-1 flex flex-col justify-center gap-1 overflow-hidden cursor-pointer select-none py-1 group/wave"
                  >
                    <div className="flex items-center gap-1 h-5">
                      {[35, 65, 45, 85, 55, 95, 70, 40, 80, 60, 30, 75, 90, 50, 70, 40, 85, 55].map((height, i) => {
                        const barRatio = i / 18;
                        const currentRatio = audioDuration > 0 ? audioProgress / audioDuration : 0;
                        const isPlayed = currentRatio >= barRatio;

                        return (
                          <div
                            key={i}
                            style={{ height: `${height}%` }}
                            className={`w-1 rounded-full transition-all duration-100 ${
                              isPlayed
                                ? (isMine ? 'bg-white shadow-sm shadow-white/40' : 'bg-brand-400 shadow-sm shadow-brand-400/30')
                                : (isMine ? 'bg-white/30' : 'bg-slate-600/70')
                            } ${isPlayingVoice && isPlayed ? 'opacity-100' : 'opacity-85'}`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>
                        {Math.floor(audioProgress / 60)}:
                        {Math.floor(audioProgress % 60).toString().padStart(2, '0')}
                      </span>
                      <span>
                        {audioDuration > 0
                          ? `${Math.floor(audioDuration / 60)}:${Math.floor(audioDuration % 60).toString().padStart(2, '0')}`
                          : (isPlayingVoice ? 'playing...' : '0:00')}
                      </span>
                    </div>
                  </div>

                  {/* Speed toggle pill */}
                  <button
                    type="button"
                    onClick={cycleSpeed}
                    className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-bold text-brand-300 hover:bg-slate-700 transition-colors shrink-0"
                  >
                    {audioSpeed}x
                  </button>
                </div>
              )}

              {/* View-Once Media Photo Card */}
              {message.media_url && isImage && isViewOnce && (
                <div className="mb-2">
                  {isViewOnceExpired ? (
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5 flex items-center gap-2.5 text-xs text-slate-500 italic">
                      <Lock className="w-4 h-4 text-slate-600" />
                      <span>Photo • Opened (View once expired)</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={openViewOnce}
                      className="p-3 rounded-xl bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-indigo-500/20 hover:from-pink-500/30 hover:to-indigo-500/30 border border-pink-500/30 text-white flex items-center gap-3 transition-all group w-full"
                    >
                      <div className="w-8 h-8 rounded-full bg-pink-500 text-white flex items-center justify-center font-bold text-xs shadow-lg shadow-pink-500/30 group-hover:scale-105 transition-transform">
                        1
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>Photo</span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-pink-500/30 text-pink-300">
                            View Once
                          </span>
                        </p>
                        <p className="text-[11px] text-pink-200/80">Tap to reveal (10s countdown)</p>
                      </div>
                    </button>
                  )}
                </div>
              )}

              {/* Normal Inline Image Preview */}
              {message.media_url && isImage && !isViewOnce && (
                <div className="mb-2 relative rounded-xl overflow-hidden group cursor-pointer border border-white/10 bg-slate-950/40">
                  <img
                    src={message.media_url}
                    alt="Chat attachment"
                    onClick={() => setImageModalOpen(true)}
                    className="max-h-72 max-w-full rounded-xl object-cover hover:scale-[1.01] transition-transform duration-200"
                    loading="lazy"
                  />
                  <div
                    onClick={() => setImageModalOpen(true)}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-xs font-medium backdrop-blur-xs"
                  >
                    <Maximize2 className="w-4 h-4" />
                    <span>View Full Size</span>
                  </div>
                </div>
              )}

              {/* Structured PDF / Document Download Card */}
              {message.media_url && !isImage && !isVoice && (
                <div className="mb-2 p-2.5 rounded-xl bg-slate-950/80 border border-white/10 flex items-center gap-2.5 min-w-0 max-w-full overflow-hidden">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isPdf
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                    }`}
                  >
                    {isPdf ? <FileText className="w-4 h-4" /> : <File className="w-4 h-4" />}
                  </div>

                  <div className="flex-1 min-w-0 pr-1 overflow-hidden">
                    <p className="text-xs font-semibold text-white truncate break-all">
                      {getFileName(message.media_url)}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono truncate">
                      <span className="uppercase shrink-0">{isPdf ? 'PDF' : 'Doc'}</span>
                      {message.file_size && (
                        <>
                          <span>•</span>
                          <span className="shrink-0">{formatFileSize(message.file_size)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <a
                    href={message.media_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors shrink-0"
                    title="Download File"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              )}

              {/* Inline Editing Mode */}
              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    rows={2}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="glass-input w-full p-2 text-xs rounded-lg text-white resize-none"
                  />
                  <div className="flex items-center justify-end gap-2 text-[11px]">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={editSaving}
                      className="px-3 py-1 rounded bg-brand-600 text-white font-semibold"
                    >
                      {editSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Text Message Content with IDE code blocks and search highlight */
                message.content && (
                  <MessageContent
                    content={message.content}
                    highlightQuery={highlightQuery}
                    isMine={isMine}
                  />
                )
              )}

              {/* Timestamp, Star Indicator, Edited Badge & Granular Delivery Checks */}
              <div
                className={`flex items-center gap-1.5 mt-1 text-[10px] ${
                  isMine ? 'text-brand-200/80 justify-end' : 'text-slate-400 justify-start'
                }`}
              >
                {message.is_starred && (
                  <span title="Starred message">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  </span>
                )}
                {message.is_edited && <span className="text-[9px] opacity-75">(edited)</span>}
                <span>{formatMessageTime(message.created_at)}</span>

                {isMine && (
                  message.status === 'sending' ? (
                    <span title="Sending with 0ms delay..." className="flex items-center gap-0.5 text-brand-200/70">
                      <Clock className="w-3 h-3 animate-spin" />
                    </span>
                  ) : message.status === 'error' ? (
                    <span title="Failed to deliver message" className="flex items-center gap-0.5 text-rose-300">
                      <AlertCircle className="w-3 h-3" />
                    </span>
                  ) : message.is_read ? (
                    <span title="Seen by recipient">
                      <CheckCheck className="w-3.5 h-3.5 text-cyan-300" />
                    </span>
                  ) : (
                    <span title="Delivered">
                      <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
                    </span>
                  )
                )}
              </div>
            </>
          )}

          {/* Floating Action Menu on Hover (Reply, Emoji Reaction, Edit, Delete) - Desktop mouse hover only */}
          {!message.is_deleted && (
            <div
              className={`absolute top-0 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-150 z-20 hidden sm:flex items-center gap-1 p-1 rounded-full bg-slate-900 border border-white/15 shadow-xl backdrop-blur-md reaction-bar gpu-accelerated ${
                isMine ? 'left-0 -translate-x-3/4' : 'right-0 translate-x-3/4'
              }`}
            >
              {/* Quick Reactions Trigger */}
              <button
                type="button"
                onClick={() => setShowReactionPicker(!showReactionPicker)}
                className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-amber-400 transition-colors"
                title="React"
              >
                <Smile className="w-3.5 h-3.5" />
              </button>

              {/* Reply Button */}
              {onReply && (
                <button
                  type="button"
                  onClick={() => onReply(message)}
                  className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                  title="Reply"
                >
                  <Reply className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Star / Unstar Message Button */}
              {onToggleStar && (
                <button
                  type="button"
                  onClick={() => onToggleStar(message.id)}
                  className={`p-1.5 rounded-full hover:bg-slate-800 transition-colors ${
                    message.is_starred ? 'text-amber-400 hover:text-amber-300' : 'text-slate-400 hover:text-amber-400'
                  }`}
                  title={message.is_starred ? 'Unstar message' : 'Star message'}
                >
                  <Star className={`w-3.5 h-3.5 ${message.is_starred ? 'fill-amber-400' : ''}`} />
                </button>
              )}

              {/* Edit Button (Author only, < 15 mins) */}
              {isMine && is15MinWindow && onEditMessage && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-brand-300 transition-colors"
                  title="Edit message"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Delete for Everyone */}
              {onDeleteMessage && (isMine || isGroup) && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Delete this message for everyone?')) {
                      onDeleteMessage(message.id);
                    }
                  }}
                  className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
                  title="Delete for everyone"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Floating Emoji Picker Bar */}
          {showReactionPicker && (
            <div
              className={`absolute -top-10 z-30 flex items-center gap-1.5 p-1.5 rounded-full bg-slate-900/95 border border-white/20 shadow-2xl backdrop-blur-xl animate-fadeIn reaction-bar gpu-accelerated ${
                isMine ? 'right-0' : 'left-0'
              }`}
            >
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    if (onToggleReaction) onToggleReaction(message.id, emoji);
                    setShowReactionPicker(false);
                  }}
                  className="w-7 h-7 rounded-full hover:scale-125 transition-transform flex items-center justify-center text-sm"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Emoji Reaction Pills Below Bubble */}
      {message.reactions && message.reactions.length > 0 && !message.is_deleted && (
        <div className={`flex flex-wrap items-center gap-1 mt-1 ${isMine ? 'justify-end mr-2' : 'justify-start ml-10'}`}>
          {message.reactions.map((r) => (
            <button
              key={r.emoji}
              onClick={() => onToggleReaction && onToggleReaction(message.id, r.emoji)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                r.has_reacted
                  ? 'bg-brand-600/30 border-brand-500 text-white shadow-sm'
                  : 'bg-slate-900/80 border-white/10 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>{r.emoji}</span>
              <span className="text-[10px] font-bold">{r.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* 10-Second Countdown View-Once Fullscreen Modal */}
      {viewOnceModal && message.media_url && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-fadeIn select-none"
          onClick={closeViewOnce}
        >
          <div
            className="relative max-w-2xl w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Circular Countdown Ring */}
            <div className="w-full flex items-center justify-between pb-4 text-white">
              <div className="flex items-center gap-2.5">
                <Flame className="w-5 h-5 text-pink-400 animate-pulse" />
                <span className="text-sm font-bold">View-Once Media</span>
              </div>

              {/* 10-Second Timer Badge */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-500/20 border border-pink-500/40 text-pink-300 font-mono font-bold text-sm">
                  <Clock className="w-4 h-4 animate-spin" />
                  <span>{viewOnceSeconds}s</span>
                </div>
                <button
                  onClick={closeViewOnce}
                  className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Media Image */}
            <img
              src={message.media_url}
              alt="View once revealed"
              className="max-h-[75vh] max-w-full rounded-2xl object-contain shadow-2xl border border-white/10"
            />
            <p className="text-xs text-slate-400 mt-4">This photo will permanently expire when timer finishes.</p>
          </div>
        </div>
      )}

      {/* Normal Image Modal Lightbox */}
      {imageModalOpen && message.media_url && !isViewOnce && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setImageModalOpen(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
              <a
                href={message.media_url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="p-2 rounded-full bg-black/60 hover:bg-black/90 text-white transition-colors border border-white/20"
                title="Download image"
              >
                <Download className="w-4 h-4" />
              </a>
              <button
                onClick={() => setImageModalOpen(false)}
                className="p-2 rounded-full bg-black/60 hover:bg-black/90 text-white transition-colors border border-white/20"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={message.media_url}
              alt="Full size preview"
              className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl border border-white/10"
            />
          </div>
        </div>
      )}
    </div>
  );
}
