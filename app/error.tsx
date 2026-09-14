'use client';

import React, { useEffect } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Onyx Global Client Error:', error);
  }, [error]);

  const handleHardReset = () => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.clear();
        // Keep auth session but clear UI state caches
        localStorage.removeItem('onyx_mobile_theme');
      }
    } catch {}
    reset();
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-center bg-[#07080b] p-6 text-center select-none z-50">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-pink-600 p-[1px] shadow-2xl shadow-brand-500/30">
          <div className="w-full h-full bg-[#08090e] rounded-[23px] flex items-center justify-center">
            <AlertTriangle className="w-9 h-9 text-brand-400 animate-pulse" />
          </div>
        </div>
        <div className="absolute -inset-2 rounded-3xl bg-brand-500/20 blur-xl -z-10" />
      </div>

      <h1 className="text-xl font-extrabold text-white tracking-tight mb-2">
        Something went wrong
      </h1>
      <p className="text-xs text-slate-400 max-w-sm leading-relaxed mb-6">
        Onyx encountered an unexpected display issue. Your messages and data are safe. Tap below to reload.
      </p>

      <button
        onClick={handleHardReset}
        className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-brand-600 to-indigo-600 text-white text-xs font-bold shadow-xl shadow-brand-500/30 active:scale-95 transition-all touch-manipulation hover:opacity-95"
      >
        <RefreshCw className="w-4 h-4" />
        <span>Reload Onyx</span>
      </button>

      <p className="text-[10px] font-mono text-slate-600 mt-8">
        Onyx Messenger • Fast & Private
      </p>
    </div>
  );
}
