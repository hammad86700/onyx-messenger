'use client';

import React, { useState, useEffect } from 'react';
import { Smartphone, Download, Check, Share, PlusSquare, X } from 'lucide-react';

export default function LoginPWAInstallCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    // Check if already in standalone app mode
    if (
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true)
    ) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS Safari
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      const isIPhoneOrIPad = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
      setIsIOS(isIPhoneOrIPad);
    }

    // Capture Android / Chrome install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  if (isInstalled) {
    return (
      <div className="w-full mb-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-center gap-2 animate-fadeIn">
        <Check className="w-4 h-4 text-emerald-400" />
        <span className="font-semibold">Onyx App Installed (Running in Standalone Mode)</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      setShowIOSModal(true);
    }
  };

  return (
    <>
      <div className="w-full mb-6 p-4 rounded-2xl bg-gradient-to-r from-brand-950/60 via-slate-900/80 to-purple-950/50 border border-brand-500/30 shadow-xl backdrop-blur-xl animate-fadeIn">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-brand-500/25">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                <span>Install Onyx App on Mobile</span>
                <span className="text-[9px] uppercase font-mono bg-brand-500/20 text-brand-300 px-1.5 py-0.2 rounded border border-brand-500/30">
                  App
                </span>
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                Fast edge-to-edge messaging with 0 delay
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleInstallClick}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-brand-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install</span>
          </button>
        </div>
      </div>

      {/* iOS Safari & General Manual Install Guide Modal */}
      {showIOSModal && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setShowIOSModal(false)}
        >
          <div
            className="glass-panel w-full max-w-sm rounded-2xl border border-white/10 p-5 space-y-4 shadow-2xl bg-slate-900/95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">
                  {isIOS ? 'Install on iPhone / iPad' : 'Install Onyx App'}
                </h3>
              </div>
              <button
                onClick={() => setShowIOSModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Install Onyx directly to your home screen to enjoy instant launch and a full-screen dark-mode app experience:
            </p>

            <div className="space-y-2.5 text-xs text-slate-300">
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/60 border border-white/5">
                <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <span className="font-semibold text-white">Tap the Share button</span>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                    Look for <Share className="w-3.5 h-3.5 text-blue-400 inline" /> in Safari&apos;s bottom toolbar.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/60 border border-white/5">
                <div className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <span className="font-semibold text-white">Add to Home Screen</span>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                    Scroll down and tap <PlusSquare className="w-3.5 h-3.5 text-purple-400 inline" />{' '}
                    <strong>Add to Home Screen</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/60 border border-white/5">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <span className="font-semibold text-white">Open from Home Screen</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tap <strong>Add</strong> at top right. Onyx will appear as an app icon on your home screen!
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-colors shadow-md shadow-brand-500/20"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}
