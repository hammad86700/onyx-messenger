'use client';

import React, { useState, useEffect } from 'react';
import { Download, Smartphone, X, Check } from 'lucide-react';

interface PWAInstallBannerProps {
  variant?: 'banner' | 'button';
  className?: string;
}

export default function PWAInstallBanner({
  variant = 'banner',
  className = '',
}: PWAInstallBannerProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if running as installed standalone PWA
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    ) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // If browser doesn't support beforeinstallprompt or prompt already consumed, show tip
      alert('To install Onyx: Tap your browser menu (⋮ or Share icon) and select "Add to Home Screen" or "Install App".');
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setIsInstallable(false);
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled || dismissed) return null;

  // Compact button variant for Sidebar
  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={handleInstallClick}
        className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-brand-900/40 via-indigo-900/30 to-brand-900/40 hover:from-brand-900/70 hover:to-indigo-900/60 border border-brand-500/30 text-xs font-semibold text-brand-300 hover:text-white transition-all shadow-sm group ${className}`}
        title="Install Onyx App on your device"
      >
        <Smartphone className="w-3.5 h-3.5 text-brand-400 group-hover:scale-110 transition-transform" />
        <span>Install Onyx App</span>
        <Download className="w-3 h-3 text-brand-400 opacity-75" />
      </button>
    );
  }

  // Floating or inline banner variant
  return (
    <div
      className={`p-3 rounded-2xl bg-gradient-to-r from-slate-900/95 to-[#0b0f19]/95 border border-brand-500/30 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 animate-fadeIn ${className}`}
    >
      <div className="flex items-center gap-2.5 overflow-hidden">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md">
          <Smartphone className="w-4 h-4" />
        </div>
        <div className="overflow-hidden">
          <p className="text-xs font-bold text-white truncate">Install Onyx App</p>
          <p className="text-[10px] text-slate-400 truncate">
            Fast 0ms access, full screen & offline push
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleInstallClick}
          className="px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shadow-brand-500/20"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install</span>
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-white transition-colors"
          title="Dismiss banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
