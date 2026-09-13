'use client';

import React from 'react';
import { Message } from '@/types/database';
import {
  Reply,
  Copy,
  Star,
  Edit2,
  Trash2,
  X,
  Smile,
  Check,
} from 'lucide-react';

interface MobileMessageActionSheetProps {
  isOpen: boolean;
  message: Message | null;
  currentUserId: string;
  onClose: () => void;
  onReply: (message: Message) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onToggleStar: (messageId: string) => void;
  onEditMessage?: (messageId: string, content: string) => void;
  onDeleteMessage?: (messageId: string) => void;
}

const QUICK_EMOJIS = ['❤️', '🔥', '😂', '👍', '😮', '🙏'];

export default function MobileMessageActionSheet({
  isOpen,
  message,
  currentUserId,
  onClose,
  onReply,
  onToggleReaction,
  onToggleStar,
  onEditMessage,
  onDeleteMessage,
}: MobileMessageActionSheetProps) {
  if (!isOpen || !message) return null;

  const isMine = message.sender_id === currentUserId;
  const is15MinWindow =
    Date.now() - new Date(message.created_at).getTime() <= 15 * 60 * 1000;

  const handleCopyText = async () => {
    if (message.content) {
      try {
        await navigator.clipboard.writeText(message.content);
      } catch {
        // Clipboard fallback
      }
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0e1017] border-t border-white/10 rounded-t-3xl p-5 shadow-2xl animate-fadeIn gpu-accelerated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div className="w-12 h-1.5 rounded-full bg-slate-700/80 mx-auto mb-4" />

        {/* Quick Emoji Reaction Pill Bar */}
        <div className="flex items-center justify-around bg-slate-900/90 border border-white/10 rounded-2xl p-2 mb-4 shadow-lg">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onToggleReaction(message.id, emoji);
                onClose();
              }}
              className="text-2xl hover:scale-125 active:scale-95 transition-transform p-1 touch-manipulation"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Action List */}
        <div className="space-y-1">
          {/* Reply */}
          <button
            onClick={() => {
              onReply(message);
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-slate-200 hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors text-xs font-medium touch-manipulation"
          >
            <Reply className="w-4 h-4 text-brand-400" />
            <span>Reply</span>
          </button>

          {/* Copy Text */}
          {message.content && (
            <button
              onClick={handleCopyText}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-slate-200 hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors text-xs font-medium touch-manipulation"
            >
              <Copy className="w-4 h-4 text-indigo-400" />
              <span>Copy Message Text</span>
            </button>
          )}

          {/* Star / Unstar */}
          <button
            onClick={() => {
              onToggleStar(message.id);
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-slate-200 hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors text-xs font-medium touch-manipulation"
          >
            <Star className={`w-4 h-4 ${message.is_starred ? 'text-amber-400 fill-amber-400' : 'text-amber-400'}`} />
            <span>{message.is_starred ? 'Remove Star' : 'Star Message'}</span>
          </button>

          {/* Edit (Author & <15m) */}
          {isMine && is15MinWindow && onEditMessage && message.content && (
            <button
              onClick={() => {
                const newText = prompt('Edit your message:', message.content || '');
                if (newText !== null && newText.trim() && newText !== message.content) {
                  onEditMessage(message.id, newText.trim());
                }
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-slate-200 hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors text-xs font-medium touch-manipulation"
            >
              <Edit2 className="w-4 h-4 text-emerald-400" />
              <span>Edit Message (15m window)</span>
            </button>
          )}

          {/* Delete for Everyone */}
          {onDeleteMessage && (
            <button
              onClick={() => {
                if (confirm('Delete this message for everyone?')) {
                  onDeleteMessage(message.id);
                }
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/20 transition-colors text-xs font-medium touch-manipulation"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete for Everyone</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
