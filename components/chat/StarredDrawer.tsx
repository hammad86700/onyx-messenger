'use client';

import React, { useState, useEffect } from 'react';
import { StarredMessage } from '@/types/database';
import { formatMessageTime } from '@/lib/utils';
import {
  Star,
  X,
  FileText,
  File,
  Image as ImageIcon,
  Mic,
  ArrowRight,
  ExternalLink,
  Trash2,
  Bookmark,
} from 'lucide-react';

interface StarredDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: string;
  onJumpToMessage: (messageId: string, conversationId?: string) => void;
  onUnstar?: (messageId: string) => void;
  onUnstarMessage?: (messageId: string) => void;
}

type StarredFilter = 'all' | 'media' | 'files';

export default function StarredDrawer({
  isOpen,
  onClose,
  conversationId,
  onJumpToMessage,
  onUnstar,
  onUnstarMessage,
}: StarredDrawerProps) {
  const [starredMessages, setStarredMessages] = useState<StarredMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StarredFilter>('all');
  const [unstarringId, setUnstarringId] = useState<string | null>(null);

  const fetchStarred = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/chat/starred');
      const data = await res.json();
      if (data.starred) {
        setStarredMessages(data.starred);
      }
    } catch (err) {
      console.error('Failed to load starred messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStarred();
    }
  }, [isOpen]);

  const handleUnstar = async (messageId: string) => {
    setUnstarringId(messageId);
    try {
      const res = await fetch('/api/chat/starred', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId }),
      });

      if (res.ok) {
        setStarredMessages((prev) => prev.filter((s) => s.message_id !== messageId));
        if (onUnstar) onUnstar(messageId);
        if (onUnstarMessage) onUnstarMessage(messageId);
      }
    } catch (err) {
      console.error('Failed to unstar message:', err);
    } finally {
      setUnstarringId(null);
    }
  };

  if (!isOpen) return null;

  const filteredStarred = starredMessages.filter((item) => {
    const msg = item.message;
    if (!msg) return false;
    if (filter === 'media') {
      return msg.media_type === 'image' || msg.media_type === 'voice';
    }
    if (filter === 'files') {
      return msg.media_type === 'pdf' || msg.media_type === 'file';
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-sm flex justify-end animate-fadeIn">
      <div className="w-full max-w-md h-full bg-[#090a0f] border-l border-white/10 shadow-2xl flex flex-col overflow-hidden slide-over-drawer gpu-accelerated">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Star className="w-4 h-4 fill-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>Starred Messages</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-mono">
                  {starredMessages.length}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">Saved important messages & attachments</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-1 bg-slate-950/40">
          {(['all', 'media', 'files'] as StarredFilter[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                filter === tab
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
              <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              <p className="text-xs">Loading starred messages...</p>
            </div>
          ) : filteredStarred.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
              <Star className="w-8 h-8 opacity-40 stroke-1" />
              <p className="text-xs font-semibold text-slate-400">No starred messages</p>
              <p className="text-[11px]">
                Hover over any message and click the star icon to bookmark it here.
              </p>
            </div>
          ) : (
            filteredStarred.map((item) => {
              const msg = item.message;
              if (!msg) return null;

              const isUnstarring = unstarringId === msg.id;

              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/5 hover:border-amber-500/30 transition-all space-y-2.5 group relative"
                >
                  {/* Sender & Timestamp Header */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-amber-300 shrink-0">
                        {msg.sender?.avatar_url ? (
                          <img src={msg.sender.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
                        ) : (
                          msg.sender?.full_name?.slice(0, 2).toUpperCase() || 'U'
                        )}
                      </div>
                      <span className="font-semibold text-white truncate text-xs">
                        {msg.sender?.full_name || 'User'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formatMessageTime(msg.created_at)}
                      </span>
                      <button
                        onClick={() => handleUnstar(msg.id)}
                        disabled={isUnstarring}
                        title="Remove from starred"
                        className="p-1 rounded-lg hover:bg-slate-800 text-amber-400 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Message Content Snippet */}
                  {msg.content && (
                    <p className="text-xs text-slate-200 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  )}

                  {/* Media Attachment Previews */}
                  {msg.media_url && (
                    <div className="rounded-xl overflow-hidden bg-black/40 border border-white/5 p-2">
                      {msg.media_type === 'image' && (
                        <img
                          src={msg.media_url}
                          alt="Attachment"
                          className="max-h-36 w-full object-cover rounded-lg"
                        />
                      )}
                      {msg.media_type === 'voice' && (
                        <div className="flex items-center gap-2 text-xs text-brand-300 py-1">
                          <Mic className="w-4 h-4 text-brand-400" />
                          <span>Voice Note Attachment</span>
                        </div>
                      )}
                      {(msg.media_type === 'pdf' || msg.media_type === 'file') && (
                        <div className="flex items-center gap-2 text-xs text-slate-300 py-1">
                          <FileText className="w-4 h-4 text-rose-400" />
                          <span className="truncate">{msg.file_name || 'Document'}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Jump To Message Action */}
                  <div className="flex items-center justify-end pt-1">
                    <button
                      onClick={() => {
                        onJumpToMessage(msg.id, msg.conversation_id);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-[11px] font-semibold transition-colors group/btn"
                    >
                      <span>Jump to Message</span>
                      <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
