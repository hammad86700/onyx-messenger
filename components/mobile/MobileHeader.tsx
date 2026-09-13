'use client';

import React from 'react';
import { Profile, isFounder } from '@/types/database';
import FounderBadge from '@/components/chat/FounderBadge';
import { Search, Plus, Sparkles, MessageSquare } from 'lucide-react';

interface MobileHeaderProps {
  currentUser: Profile | null;
  onOpenSearch: () => void;
  onNewChat?: () => void;
  isSearchOpen?: boolean;
}

export default function MobileHeader({
  currentUser,
  onOpenSearch,
  onNewChat,
  isSearchOpen = false,
}: MobileHeaderProps) {
  const isUserFounder = isFounder(currentUser);

  return (
    <header className="h-[calc(4rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] px-4 bg-[#07080b]/95 backdrop-blur-xl border-b border-white/10 flex items-center justify-between shrink-0 z-20 sticky top-0">
      {/* Brand Logo & Founder Badge */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-brand-600 via-indigo-500 to-pink-500 p-[1px] shadow-lg shadow-brand-500/20">
          <div className="w-full h-full bg-[#07080b] rounded-[15px] flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-1">
            <span>Onyx</span>
            <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-brand-500/20 border border-brand-500/30 text-brand-300">
              v2
            </span>
          </h1>

          {isUserFounder && <FounderBadge size="sm" />}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onOpenSearch}
          className={`p-2 rounded-xl border transition-colors touch-manipulation ${
            isSearchOpen
              ? 'bg-brand-500/20 border-brand-500/40 text-brand-300'
              : 'bg-white/5 border-white/10 text-slate-300 hover:text-white active:scale-95'
          }`}
          title="Search users & chats"
          aria-label="Search"
        >
          <Search className="w-4 h-4" />
        </button>

        {onNewChat && (
          <button
            onClick={onNewChat}
            className="p-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 text-white font-medium text-xs flex items-center gap-1 shadow-lg shadow-brand-500/25 active:scale-95 transition-transform touch-manipulation"
            title="Start new conversation"
            aria-label="New Chat"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
}
