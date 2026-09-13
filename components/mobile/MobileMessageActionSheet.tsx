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
  onDeleteMessage?: (messageId: string, mode: 'me' | 'everyone') => void;
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
  const [showDeleteChoices, setShowDeleteChoices] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setShowDeleteChoices(false);
    }
  }, [isOpen, message?.id]);

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

  const handleClose = () => {
    setShowDeleteChoices(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center animate-fadeIn"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md bg-[#0e1017] border-t border-white/10 rounded-t-3xl p-5 shadow-2xl animate-fadeIn gpu-accelerated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div className="w-12 h-1.5 rounded-full bg-slate-700/80 mx-auto mb-4" />

        {showDeleteChoices ? (
          /* Delete Choice Sub-View (Delete for me vs Delete for everyone) */
          <div className="space-y-3 py-1 animate-fadeIn">
            <div className="text-center pb-1">
              <h3 className="text-sm font-bold text-white">Delete message?</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isMine
                  ? 'Choose how you want this message deleted'
                  : 'Remove this message from your chat view'}
              </p>
            </div>

            <div className="space-y-1.5 pt-1">
              {/* Delete for Me (Always available for both own and recipient messages) */}
              <button
                onClick={() => {
                  if (onDeleteMessage) {
                    onDeleteMessage(message.id, 'me');
                  }
                  handleClose();
                }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-white/10 transition-colors text-xs font-semibold touch-manipulation"
              >
                <div className="text-left">
                  <div className="font-semibold text-white">Delete for me</div>
                  <div className="text-[10px] text-slate-400 font-normal">Hides message only from your chat</div>
                </div>
                <Trash2 className="w-4 h-4 text-slate-400" />
              </button>

              {/* Delete for Everyone (ONLY available for author's own messages) */}
              {isMine && (
                <button
                  onClick={() => {
                    if (onDeleteMessage) {
                      onDeleteMessage(message.id, 'everyone');
                    }
                    handleClose();
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition-colors text-xs font-semibold touch-manipulation"
                >
                  <div className="text-left">
                    <div className="font-semibold text-rose-400">Delete for everyone</div>
                    <div className="text-[10px] text-rose-300/70 font-normal">Removes for all conversation participants</div>
                  </div>
                  <Trash2 className="w-4 h-4 text-rose-400" />
                </button>
              )}

              {/* Cancel Button */}
              <button
                onClick={() => setShowDeleteChoices(false)}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-colors mt-2"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* Normal Action List */
          <>
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

              {/* Delete Trigger */}
              {onDeleteMessage && (
                <button
                  onClick={() => setShowDeleteChoices(true)}
                  className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/20 transition-colors text-xs font-medium touch-manipulation"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isMine ? 'Delete Message' : 'Delete for me'}</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
