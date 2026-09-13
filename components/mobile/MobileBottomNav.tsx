'use client';

import React from 'react';
import { MessageSquare, Bookmark, Settings } from 'lucide-react';

export type MobileTab = 'chats' | 'vault' | 'settings';

interface MobileBottomNavProps {
  activeTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  totalUnreadCount?: number;
}

export default function MobileBottomNav({
  activeTab,
  onSelectTab,
  totalUnreadCount = 0,
}: MobileBottomNavProps) {
  const tabs: { id: MobileTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'chats', label: 'Chats', icon: MessageSquare },
    { id: 'vault', label: 'Vault', icon: Bookmark },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="h-[calc(4rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] px-6 bg-[#07080b]/95 backdrop-blur-2xl border-t border-white/10 flex items-center justify-around shrink-0 z-20">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`relative flex flex-col items-center justify-center gap-1 py-1 px-4 rounded-xl transition-all duration-200 touch-manipulation active:scale-95 ${
              isActive ? 'text-brand-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110 stroke-[2.5]' : 'stroke-2'}`} />

              {/* Unread badge on Chats */}
              {tab.id === 'chats' && totalUnreadCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold font-mono flex items-center justify-center shadow-lg shadow-brand-500/50 animate-pulse">
                  {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                </span>
              )}
            </div>

            <span className="text-[11px] tracking-tight">{tab.label}</span>

            {/* Active Glow Pill Indicator */}
            {isActive && (
              <span className="absolute -bottom-1 w-5 h-0.5 rounded-full bg-brand-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
