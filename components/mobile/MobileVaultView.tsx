'use client';

import React, { useState, useEffect } from 'react';
import { Conversation, StarredMessage } from '@/types/database';
import { formatMessageTime } from '@/lib/utils';
import { Bookmark, Star, FileText, Image as ImageIcon, Mic, ChevronRight } from 'lucide-react';

interface MobileVaultViewProps {
  onOpenSavedChat: () => void;
  onOpenStarredDrawer?: () => void;
}

export default function MobileVaultView({
  onOpenSavedChat,
  onOpenStarredDrawer,
}: MobileVaultViewProps) {
  const [starredCount, setStarredCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStarredCount = async () => {
      try {
        const res = await fetch('/api/chat/starred');
        const data = await res.json();
        if (data.starred) {
          setStarredCount(data.starred.length);
        }
      } catch {
        // Fallback
      } finally {
        setLoading(false);
      }
    };

    fetchStarredCount();
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full overflow-y-auto px-4 py-6 space-y-4 bg-[#07080b] chat-scroll-viewport">
      {/* Header Info */}
      <div className="p-4 rounded-3xl bg-gradient-to-tr from-amber-500/15 via-orange-500/10 to-transparent border border-amber-500/20 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-lg">
            <Bookmark className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Personal Vault</h2>
            <p className="text-[11px] text-amber-200/80">Encrypted Cloud Storage & Saved Notes</p>
          </div>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Your personal private cloud. Forward important voice notes, photos, code snippets, or document links for instant access across all devices.
        </p>
      </div>

      {/* Saved Messages Direct Button */}
      <button
        onClick={onOpenSavedChat}
        className="w-full p-4 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-white/10 flex items-center justify-between text-left transition-all active:scale-98 touch-manipulation group shadow-lg"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
            <Bookmark className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Saved Messages</h3>
            <p className="text-[11px] text-slate-400">Personal scratchpad, drafts & cloud storage</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
      </button>

      {/* Starred Messages Section */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            <h3 className="text-xs font-bold text-white">Starred Messages</h3>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold">
            {starredCount} saved
          </span>
        </div>

        <p className="text-[11px] text-slate-400">
          Messages you star inside any direct or group chat appear here for fast bookmarking.
        </p>

        {onOpenStarredDrawer && (
          <button
            onClick={onOpenStarredDrawer}
            className="w-full py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 touch-manipulation"
          >
            <Star className="w-3.5 h-3.5 fill-amber-300" />
            <span>View All Starred Messages</span>
          </button>
        )}
      </div>

      {/* Media Type Features */}
      <div className="grid grid-cols-3 gap-2.5 pt-2">
        <div className="p-3 rounded-2xl bg-slate-900/40 border border-white/5 text-center space-y-1">
          <ImageIcon className="w-5 h-5 text-brand-400 mx-auto" />
          <p className="text-[11px] font-bold text-slate-200">Photos</p>
          <p className="text-[9px] text-slate-400">Cached locally</p>
        </div>
        <div className="p-3 rounded-2xl bg-slate-900/40 border border-white/5 text-center space-y-1">
          <Mic className="w-5 h-5 text-emerald-400 mx-auto" />
          <p className="text-[11px] font-bold text-slate-200">Voice Notes</p>
          <p className="text-[9px] text-slate-400">Audio playback</p>
        </div>
        <div className="p-3 rounded-2xl bg-slate-900/40 border border-white/5 text-center space-y-1">
          <FileText className="w-5 h-5 text-indigo-400 mx-auto" />
          <p className="text-[11px] font-bold text-slate-200">Files</p>
          <p className="text-[9px] text-slate-400">PDFs & Docs</p>
        </div>
      </div>
    </div>
  );
}
