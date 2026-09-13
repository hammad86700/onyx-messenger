'use client';

import React, { useState } from 'react';
import { Profile } from '@/types/database';
import { X, Sparkles, Check, Smile } from 'lucide-react';

interface ProfileStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: Profile;
  onProfileUpdated: (updated: Profile) => void;
}

const PRESET_EMOJIS = ['💻', '🚀', '☕', '🎧', '🔥', '🌴', '🎯', '⚡', '🥑', '✨', '💤', '🧠'];

export default function ProfileStatusModal({
  isOpen,
  onClose,
  currentUser,
  onProfileUpdated,
}: ProfileStatusModalProps) {
  const [statusEmoji, setStatusEmoji] = useState(currentUser.status_emoji || '👋');
  const [statusText, setStatusText] = useState(currentUser.status_text || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status_emoji: statusEmoji,
          status_text: statusText.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');

      onProfileUpdated(data.profile);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update profile status');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel p-6 rounded-2xl max-w-sm w-full border border-white/10 shadow-2xl relative animate-fadeIn">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Set Status & Bio</h3>
              <p className="text-[11px] text-slate-400">Visible to all your contacts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Status Emoji
            </label>
            <div className="grid grid-cols-6 gap-2">
              {PRESET_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setStatusEmoji(emoji)}
                  className={`text-xl p-2 rounded-xl border transition-all flex items-center justify-center ${
                    statusEmoji === emoji
                      ? 'bg-brand-600/30 border-brand-500 shadow-md scale-105'
                      : 'bg-slate-900/60 border-white/5 hover:border-white/20'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Custom Status / Bio
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-lg">{statusEmoji}</span>
              <input
                type="text"
                placeholder="What's happening? (e.g. Coding, Away...)"
                maxLength={60}
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                className="glass-input w-full pl-10 pr-3 py-2 rounded-xl text-xs placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-brand-500/20"
            >
              {saving ? 'Saving...' : 'Save Status'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
