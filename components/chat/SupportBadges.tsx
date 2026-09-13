'use client';

import React from 'react';
import { MessageCircle, ExternalLink } from 'lucide-react';

interface SupportBadgesProps {
  className?: string;
  variant?: 'compact' | 'expanded';
}

export default function SupportBadges({ className = '', variant = 'compact' }: SupportBadgesProps) {
  const whatsappUrl = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || 'https://wa.me/923242779514';
  const instagramUrl = process.env.NEXT_PUBLIC_ADMIN_INSTAGRAM || 'https://instagram.com/not_urs_hammi';

  if (variant === 'expanded') {
    return (
      <div className={`flex flex-col sm:flex-row items-center justify-center gap-3 w-full ${className}`}>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-200 text-sm font-medium w-full sm:w-auto justify-center group shadow-sm hover:shadow-emerald-500/10"
        >
          <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
            <MessageCircle className="w-3.5 h-3.5" />
          </div>
          <span>Support on WhatsApp</span>
          <ExternalLink className="w-3 h-3 text-emerald-400/60 group-hover:translate-x-0.5 transition-transform" />
        </a>

        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-amber-500/10 hover:from-pink-500/20 hover:to-amber-500/20 text-pink-400 border border-pink-500/20 hover:border-pink-500/40 transition-all duration-200 text-sm font-medium w-full sm:w-auto justify-center group shadow-sm"
        >
          <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-500 to-pink-500 flex items-center justify-center text-white group-hover:scale-110 transition-transform text-[10px] font-bold">
            IG
          </div>
          <span className="bg-gradient-to-r from-pink-400 to-purple-300 bg-clip-text text-transparent font-semibold">
            @not_urs_hammi
          </span>
          <ExternalLink className="w-3 h-3 text-pink-400/60 group-hover:translate-x-0.5 transition-transform" />
        </a>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs text-slate-400 font-medium mr-1">Admin Support:</span>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Chat on WhatsApp with Support"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-800/40 transition-colors text-xs font-medium group"
      >
        <MessageCircle className="w-3 h-3 text-emerald-400 group-hover:scale-110 transition-transform" />
        <span>WhatsApp</span>
      </a>

      <a
        href={instagramUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Direct Message @not_urs_hammi on Instagram"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-950/60 hover:bg-purple-900/80 text-pink-400 border border-pink-800/40 transition-colors text-xs font-medium group"
      >
        <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-amber-400 to-pink-500 inline-block group-hover:scale-110 transition-transform" />
        <span>@not_urs_hammi</span>
      </a>
    </div>
  );
}
