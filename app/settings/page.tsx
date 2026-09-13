'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Profile, isFounder, OnyxTheme } from '@/types/database';
import FounderBadge from '@/components/chat/FounderBadge';
import SupportBadges from '@/components/chat/SupportBadges';
import {
  ArrowLeft,
  User,
  AtSign,
  Camera,
  Check,
  AlertCircle,
  Loader2,
  Lock,
  LogOut,
  Palette,
  Shield,
  Smartphone,
  Sparkles,
  KeyRound,
} from 'lucide-react';
import ChangePasswordModal from '@/components/chat/ChangePasswordModal';

const PRESET_EMOJIS = ['💻', '🚀', '☕', '🎧', '🔥', '🌴', '🎯', '⚡', '🥑', '✨', '💤', '🧠'];

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);

  // Form State
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [customStatus, setCustomStatus] = useState('');
  const [statusEmoji, setStatusEmoji] = useState('👋');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  // Live Debounced Username Check
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'available' | 'taken' | 'invalid' | 'same' | null>('same');

  // Load User Profile
  useEffect(() => {
    let isMounted = true;
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (isMounted && profile) {
          setCurrentUser(profile);
          setFullName(profile.full_name || '');
          setUsername(profile.username || '');
          setBio(profile.bio || '');
          setCustomStatus(profile.custom_status || profile.status_text || '');
          setStatusEmoji(profile.status_emoji || '👋');
          setAvatarUrl(profile.avatar_url);
        }
      } catch (err) {
        console.error('Settings load error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  // Username availability check
  useEffect(() => {
    if (!currentUser) return;
    const clean = username.trim().toLowerCase().replace(/^@+/, '');
    if (!clean) {
      setUsernameStatus(null);
      return;
    }
    if (clean === currentUser.username?.toLowerCase()) {
      setUsernameStatus('same');
      return;
    }
    if (!/^[a-z0-9_]{3,25}$/.test(clean)) {
      setUsernameStatus('invalid');
      return;
    }

    setCheckingUsername(true);
    const timer = setTimeout(async () => {
      try {
        const { data, error: queryErr } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', clean)
          .neq('id', currentUser.id)
          .maybeSingle();

        if (queryErr) {
          setUsernameStatus(null);
        } else if (data) {
          setUsernameStatus('taken');
        } else {
          setUsernameStatus('available');
        }
      } catch {
        setUsernameStatus(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [username, currentUser, supabase]);

  // Handle Avatar Upload directly to Supabase 'avatars' bucket
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) {
      setError('Please select a valid image file (.png, .jpg, or .webp).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Avatar image must be under 5MB.');
      return;
    }

    setUploadingAvatar(true);
    setError(null);

    try {
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `${currentUser.id}/avatar_${Date.now()}.${fileExt}`;

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadErr) {
        throw new Error(uploadErr.message || 'Failed to upload avatar');
      }

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      if (urlData?.publicUrl) {
        setAvatarUrl(urlData.publicUrl);
        setSuccessMsg('Avatar uploaded! Click "Save Settings" to apply.');
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      setError(err.message || 'Failed to upload image.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Save Settings Handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setError(null);
    setSaving(true);

    const cleanUsername = username.trim().toLowerCase().replace(/^@+/, '');

    if (!cleanUsername) {
      setError('Username cannot be empty.');
      setSaving(false);
      return;
    }

    if (!/^[a-z0-9_]{3,25}$/.test(cleanUsername)) {
      setError('Username must be 3-25 characters and contain only lowercase letters, numbers, and underscores.');
      setSaving(false);
      return;
    }

    if (usernameStatus === 'taken') {
      setError('This username is already taken. Please choose another.');
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          username: cleanUsername,
          bio: bio.trim(),
          custom_status: customStatus.trim(),
          status_text: customStatus.trim(),
          status_emoji: statusEmoji,
          avatar_url: avatarUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');

      setCurrentUser(data.profile);
      setSuccessMsg('Profile settings saved successfully!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Profile save error:', err);
      setError(err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07080b] flex flex-col items-center justify-center text-slate-300">
        <div className="w-10 h-10 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin mb-3" />
        <p className="text-xs font-mono">Loading Onyx Settings...</p>
      </div>
    );
  }

  if (!currentUser) return null;

  const userIsFounder = isFounder(currentUser);

  return (
    <div className="min-h-screen bg-[#07080b] text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="h-16 px-4 sm:px-8 border-b border-white/10 bg-black/40 backdrop-blur-xl flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors flex items-center gap-1.5 text-xs"
            title="Back to Chats"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Chats</span>
          </button>

          <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />

          <h1 className="text-base font-bold text-white flex items-center gap-2">
            <span>Settings & Profile</span>
            {userIsFounder && <FounderBadge size="sm" />}
          </h1>
        </div>

        <button
          onClick={handleSignOut}
          className="px-3 py-1.5 rounded-xl bg-slate-900 border border-white/5 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 transition-colors text-xs flex items-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Founder Recognition Banner */}
        {userIsFounder && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-600/10 to-orange-500/10 border border-amber-500/30 flex items-center gap-3.5 shadow-lg shadow-amber-500/5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-amber-300">Verified Founder Status</span>
                <FounderBadge />
              </div>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Your profile is officially verified as Founder of Onyx (anchored to Hammad • @not_urs_hammi).
              </p>
            </div>
          </div>
        )}

        {/* Feedback Alerts */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-start gap-2.5 animate-fadeIn">
            <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Profile Card Form */}
        <form onSubmit={handleSave} className="glass-panel rounded-2xl border border-white/10 p-6 space-y-6 shadow-2xl bg-slate-900/40">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6 border-b border-white/10">
            {/* Avatar Uploader */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative w-24 h-24 rounded-full bg-slate-800 border-2 border-brand-500/40 hover:border-brand-400 cursor-pointer group overflow-hidden shadow-xl transition-all"
                title="Click to upload profile photo"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-brand-300">
                    {fullName?.slice(0, 2).toUpperCase() || 'U'}
                  </div>
                )}

                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity">
                  {uploadingAvatar ? (
                    <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                  ) : (
                    <>
                      <Camera className="w-6 h-6" />
                      <span className="text-[9px] font-semibold mt-1">Upload</span>
                    </>
                  )}
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/jpg"
                onChange={handleAvatarChange}
                className="hidden"
              />
              <span className="text-[10px] text-slate-400">PNG, JPG, WEBP (Max 5MB)</span>
            </div>

            {/* Basic Info Inputs */}
            <div className="flex-1 w-full space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-xs text-white placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Username (@)
                  </label>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    {checkingUsername ? (
                      <span className="text-slate-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin text-brand-400" />
                        <span>Checking...</span>
                      </span>
                    ) : usernameStatus === 'available' ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>Available</span>
                      </span>
                    ) : usernameStatus === 'taken' ? (
                      <span className="text-rose-400 font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>Taken</span>
                      </span>
                    ) : usernameStatus === 'invalid' ? (
                      <span className="text-amber-400 text-[10px]">3-25 chars (a-z, 0-9, _)</span>
                    ) : usernameStatus === 'same' ? (
                      <span className="text-slate-500 font-mono text-[10px]">Current</span>
                    ) : null}
                  </div>
                </div>
                <div className="relative">
                  <AtSign className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="username"
                    className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-xs text-brand-300 font-mono placeholder:text-slate-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bio */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Bio / About
              </label>
              <span className="text-[10px] text-slate-500">{bio.length}/160</span>
            </div>
            <textarea
              rows={3}
              maxLength={160}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell others what you're working on..."
              className="glass-input w-full p-3 rounded-xl text-xs text-white placeholder:text-slate-500 resize-none leading-relaxed"
            />
          </div>

          {/* Custom Status & Emoji */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Custom Status
            </label>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="text-xl p-2 rounded-xl bg-slate-900 border border-white/10 shrink-0 select-none">
                  {statusEmoji}
                </div>
                <input
                  type="text"
                  maxLength={50}
                  value={customStatus}
                  onChange={(e) => setCustomStatus(e.target.value)}
                  placeholder="What are you up to? (e.g. Coding Onyx)"
                  className="glass-input flex-1 px-3.5 py-2.5 rounded-xl text-xs text-white placeholder:text-slate-500"
                />
              </div>

              {/* Preset Emoji Grid */}
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                {PRESET_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setStatusEmoji(emoji)}
                    className={`text-base p-1.5 rounded-lg border transition-all flex items-center justify-center ${
                      statusEmoji === emoji
                        ? 'bg-brand-600/30 border-brand-500 scale-105 shadow-sm'
                        : 'bg-slate-900/60 border-white/5 hover:border-white/20'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsChangePasswordOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5 active:scale-95"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Change Password</span>
              </button>

              {currentUser.is_admin && (
                <button
                  type="button"
                  onClick={() => router.push('/admin')}
                  className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Super-Admin</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={() => router.push('/')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploadingAvatar}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-brand-500/25 flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Settings</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* PWA & System Information Card */}
        <div className="glass-panel rounded-2xl border border-white/10 p-5 space-y-3 bg-slate-900/30 text-xs">
          <div className="flex items-center gap-2 text-brand-400 font-semibold">
            <Smartphone className="w-4 h-4" />
            <span>PWA & Mobile Install</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Onyx is a Progressive Web Application. Install it on your device for instant launch, native push notifications, offline shell caching, and full OLED edge-to-edge dark mode.
          </p>
        </div>

        {/* Watermark & Support Badges */}
        <div className="pt-4 flex flex-col items-center space-y-3 text-center">
          <p className="text-[11px] text-slate-500">
            Onyx Messenger • Conceived & Developed by Hammad
          </p>
          <SupportBadges variant="compact" />
        </div>
      </main>

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
}
