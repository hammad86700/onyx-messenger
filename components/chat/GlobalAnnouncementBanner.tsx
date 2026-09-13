'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { GlobalAnnouncement } from '@/types/database';
import { Megaphone, X, AlertTriangle, Info } from 'lucide-react';

export default function GlobalAnnouncementBanner() {
  const supabase = createClient();
  const [announcement, setAnnouncement] = useState<GlobalAnnouncement | null>(null);

  useEffect(() => {
    const channel = supabase.channel('system-announcements');

    channel.on('broadcast', { event: 'global_banner' }, (payload) => {
      if (payload?.payload) {
        setAnnouncement(payload.payload as GlobalAnnouncement);
      }
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  if (!announcement) return null;

  const isEmergency = announcement.type === 'emergency';

  return (
    <div
      className={`w-full px-4 py-2.5 z-50 flex items-center justify-between text-xs font-medium backdrop-blur-xl border-b transition-all animate-fadeIn ${
        isEmergency
          ? 'bg-rose-950/80 border-rose-500/30 text-rose-200'
          : 'bg-brand-950/80 border-brand-500/30 text-brand-200'
      }`}
    >
      <div className="flex items-center gap-2.5 max-w-5xl mx-auto overflow-hidden">
        <div
          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
            isEmergency ? 'bg-rose-500/20 text-rose-400' : 'bg-brand-500/20 text-brand-300'
          }`}
        >
          {isEmergency ? <AlertTriangle className="w-3.5 h-3.5" /> : <Megaphone className="w-3.5 h-3.5" />}
        </div>
        <div className="truncate">
          <span className="font-bold uppercase tracking-wider text-[10px] mr-1.5 opacity-80">
            {isEmergency ? 'System Alert' : 'Announcement'}:
          </span>
          <span>{announcement.message}</span>
        </div>
      </div>

      <button
        onClick={() => setAnnouncement(null)}
        className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors shrink-0 ml-3"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
