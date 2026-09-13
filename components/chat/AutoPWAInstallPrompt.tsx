'use client';

import React, { useState, useEffect } from 'react';
import { Download, X, Share, PlusSquare, Sparkles } from 'lucide-react';

// Global cache for beforeinstallprompt so it's never lost during React hydration
let cachedDeferredPrompt: any = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    cachedDeferredPrompt = e;
  });
}

export default function AutoPWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(cachedDeferredPrompt);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [modalTab, setModalTab] = useState<'android' | 'ios'>('android');
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker for PWA installability
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('Onyx Service Worker registered successfully:', reg.scope);
        })
        .catch((err) => {
          console.warn('Onyx Service Worker notice:', err);
        });
    }

    // 2. Check if already installed in standalone mode
    if (typeof window !== 'undefined') {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;

      if (standalone) {
        setIsStandalone(true);
        return;
      }

      // Detect iOS vs Android
      const ua = navigator.userAgent;
      const iOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
      setIsIOS(iOSDevice);
      if (iOSDevice) setModalTab('ios');

      // Check if dismissed in this session
      const dismissed = sessionStorage.getItem('onyx_pwa_dismissed');

      // If global cached prompt exists, show immediately
      if (cachedDeferredPrompt) {
        setDeferredPrompt(cachedDeferredPrompt);
        if (dismissed !== 'true') setVisible(true);
      }

      // Listen for Chrome/Android beforeinstallprompt
      const handleBeforeInstall = (e: Event) => {
        e.preventDefault();
        cachedDeferredPrompt = e;
        setDeferredPrompt(e);
        if (sessionStorage.getItem('onyx_pwa_dismissed') !== 'true') {
          setVisible(true);
        }
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstall);

      window.addEventListener('appinstalled', () => {
        setIsStandalone(true);
        setVisible(false);
        cachedDeferredPrompt = null;
        setDeferredPrompt(null);
      });

      // Listen for custom trigger from Settings or anywhere in app
      const handleOpenModal = () => {
        setShowGuideModal(true);
      };
      window.addEventListener('open-onyx-install-modal', handleOpenModal);

      // Show the install banner on mobile after 1s delay
      const timer = setTimeout(() => {
        const isMobile = window.innerWidth < 1024 || iOSDevice;
        if (isMobile && !standalone && sessionStorage.getItem('onyx_pwa_dismissed') !== 'true') {
          setVisible(true);
        }
      }, 1200);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        window.removeEventListener('open-onyx-install-modal', handleOpenModal);
        clearTimeout(timer);
      };
    }
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = deferredPrompt || cachedDeferredPrompt;

    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice && choice.outcome === 'accepted') {
          setVisible(false);
          setIsStandalone(true);
        }
      } catch (err) {
        console.error('PWA Install prompt error:', err);
      }
      cachedDeferredPrompt = null;
      setDeferredPrompt(null);
      return;
    }

    // Direct browser prompt not supported / HTTP IP / iOS -> Show step-by-step visual install guide
    setShowGuideModal(true);
  };

  const handleDismiss = () => {
    setVisible(false);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('onyx_pwa_dismissed', 'true');
    }
  };

  if (isStandalone && !showGuideModal) {
    return null;
  }

  return (
    <>
      {/* Bottom Floating Mobile Install Banner */}
      {visible && !isStandalone && (
        <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 sm:w-96 z-40 animate-fadeIn select-none">
          <div className="p-3 rounded-2xl bg-[#0d0f17]/95 border border-brand-500/40 shadow-2xl backdrop-blur-2xl flex items-center justify-between gap-3 text-white ring-1 ring-white/10">
            <div className="flex items-center gap-2.5 overflow-hidden">
              {/* App Icon */}
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-pink-600 flex items-center justify-center shrink-0 shadow-lg shadow-brand-500/30">
                <span className="font-extrabold text-sm text-white tracking-tighter">OX</span>
              </div>

              <div className="overflow-hidden">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-white truncate">Install Onyx App</p>
                  <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                    Native
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate">
                  Add to phone home screen like WhatsApp
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleInstallClick}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-brand-500/25 active:scale-95 transition-all touch-manipulation"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install</span>
              </button>

              <button
                type="button"
                onClick={handleDismiss}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Universal Mobile Install Guide Modal (For Android Chrome & iOS Safari) */}
      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn select-none"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/15 p-5 space-y-4 shadow-2xl bg-slate-900/95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-md">
                  OX
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Install Onyx on Mobile</h3>
                  <p className="text-[10px] text-brand-300 font-mono">100% Full-Screen Native App</p>
                </div>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Platform Selector Tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-800/80 border border-white/10 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setModalTab('android')}
                className={`py-1.5 rounded-xl transition-colors ${
                  modalTab === 'android'
                    ? 'bg-brand-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Android (Chrome)
              </button>
              <button
                type="button"
                onClick={() => setModalTab('ios')}
                className={`py-1.5 rounded-xl transition-colors ${
                  modalTab === 'ios'
                    ? 'bg-brand-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                iPhone (Safari)
              </button>
            </div>

            {/* Android Chrome Instructions */}
            {modalTab === 'android' ? (
              <div className="space-y-2.5 text-xs text-slate-300">
                <p className="text-[11px] text-slate-400">
                  Follow these 3 quick steps in Google Chrome to install Onyx to your Android app drawer:
                </p>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/60 border border-white/5">
                  <span className="w-6 h-6 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <span className="font-semibold text-white">Tap Chrome Menu</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Tap the three vertical dots <strong>⋮</strong> in the top-right corner of Chrome.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/60 border border-white/5">
                  <span className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <span className="font-semibold text-white">Select Install App</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/60 border border-white/5">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <span className="font-semibold text-white">Tap Install to Confirm</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Onyx will install directly. Open it from your home screen for the full WhatsApp/Instagram experience!
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* iPhone Safari Instructions */
              <div className="space-y-2.5 text-xs text-slate-300">
                <p className="text-[11px] text-slate-400">
                  Follow these 3 quick steps in Safari to add Onyx to your iPhone home screen:
                </p>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/60 border border-white/5">
                  <span className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <span className="font-semibold text-white">Tap Share Button</span>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      Look for the <Share className="w-3.5 h-3.5 text-blue-400 inline" /> icon in Safari&apos;s bottom toolbar.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/60 border border-white/5">
                  <span className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <span className="font-semibold text-white">Select Add to Home Screen</span>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      Tap <PlusSquare className="w-3.5 h-3.5 text-purple-400 inline" />{' '}
                      <strong>Add to Home Screen</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/60 border border-white/5">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <span className="font-semibold text-white">Tap Add</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Tap <strong>Add</strong> at top right to complete. Launch Onyx in full screen!
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-brand-500/25 active:scale-98"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}
