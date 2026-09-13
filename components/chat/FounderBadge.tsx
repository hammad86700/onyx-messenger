'use client';

import React from 'react';

interface FounderBadgeProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function FounderBadge({
  className = '',
  showText = true,
  size = 'md',
}: FounderBadgeProps) {
  const sizeClasses = {
    sm: 'px-1.5 py-0.2 text-[9px]',
    md: 'px-2 py-0.5 text-[10px]',
    lg: 'px-2.5 py-1 text-xs',
  }[size];

  const crownSizes = {
    sm: 'text-[10px]',
    md: 'text-xs',
    lg: 'text-sm',
  }[size];

  return (
    <span
      title="Verified Founder & System Architect"
      className={`inline-flex items-center gap-1 rounded-full font-bold tracking-wide bg-gradient-to-r from-amber-500/20 via-yellow-500/25 to-amber-600/20 text-amber-300 border border-amber-500/50 shadow-sm shadow-amber-500/25 select-none shrink-0 backdrop-blur-sm ${sizeClasses} ${className}`}
    >
      <span className={`${crownSizes} leading-none drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]`}>👑</span>
      {showText && (
        <span className="bg-gradient-to-r from-amber-200 via-yellow-200 to-amber-400 bg-clip-text text-transparent font-extrabold uppercase text-[9px] tracking-wider">
          Founder
        </span>
      )}
    </span>
  );
}
