'use client';

import React, { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Profile, isFounder } from '@/types/database';
import FounderBadge from './FounderBadge';
import {
  X,
  Camera,
  User,
  AtSign,
  FileText,
  Smile,
  Shield,
  Check,
  AlertCircle,
  Loader2,
  Lock,
  KeyRound,
} from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: Profile;
  onProfileUpdated: (updated: Profile) => void;
}

const PRESET_EMOJIS = ['💻', '🚀', '☕', '🎧', '🔥', '🌴', '🎯', '⚡', '🥑', '✨', '💤', '🧠'];

export default function EditProfileModal({
  isOpen,
  onClose,
  currentUser,
  onProfileUpdated,
}: EditProfileModalProps) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(currentUser.full_name || '');
  const [username, setUsername] = useState(currentUser.username || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [customStatus, setCustomStatus] = useState(
    currentUser.custom_status || currentUser.status_text || ''
  );
  const [statusEmoji, setStatusEmoji] = useState(currentUser.status_emoji || '👋');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentUser.avatar_url);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  // Debounced Username Availability State
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'available' | 'taken' | 'invalid' | 'same' | null>('same');

  // Debounce username check against Supabase profiles table
  React.useEffect(() => {
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
          console.error('Username check error:', queryErr);
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
  }, [username, currentUser.id, currentUser.username, supabase]);

  if (!isOpen) return null;

  const isUserFounder = isFounder(currentUser);

  // Handle avatar file selection & direct Supabase upload to 'avatars' bucket
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate image format
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) {
      setError('Please select a valid image file (.png, .jpg, or .webp).');
      return;
    }

    // Limit size to 5MB
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
        throw new Error(uploadErr.message || 'Failed to upload avatar.');
      }

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      if (urlData?.publicUrl) {
        setAvatarUrl(urlData.publicUrl);
        setSuccessMsg('Avatar uploaded! Click "Save Changes" to apply.');
        setTimeout(() => setSuccessMsg(null), 3500);
      }
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      setError(err.message || 'Failed to upload avatar image.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile.');
      }

      onProfileUpdated(data.profile);
      onClose();
    } catch (err: any) {
      console.error('Profile update error:', err);
      setError(err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div className="glass-panel w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-500/20 border border-brand-500/30 text-brand-400 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Edit Profile</span>
                {isUserFounder && <FounderBadge size="sm" />}
              </h2>
              <p className="text-[11px] text-slate-400">Update your public identity on Onyx</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Avatar Upload Section */}
          <div className="flex flex-col items-center py-2">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative w-20 h-20 rounded-full bg-slate-800 border-2 border-brand-500/40 hover:border-brand-400 cursor-pointer group overflow-hidden shadow-xl transition-all"
              title="Click to change avatar photo"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl font-bold text-brand-300">
                  {fullName?.slice(0, 2).toUpperCase() || 'U'}
                </div>
              )}

              {/* Hover Camera Overlay */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity">
                {uploadingAvatar ? (
                  <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    <span className="text-[9px] font-semibold mt-0.5">Change</span>
                  </>
                )}
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/jpg"
              onChange={handleAvatarFileChange}
              className="hidden"
            />
            <p className="text-[11px] text-slate-400 mt-2">
              Click photo to upload (.png, .jpg, .webp up to 5MB)
            </p>
          </div>

          {/* Full Name */}
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
                className="glass-input w-full pl-10 pr-4 py-2 rounded-xl text-xs text-white placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Username */}
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
                    <X className="w-3 h-3" />
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
                className="glass-input w-full pl-10 pr-4 py-2 rounded-xl text-xs text-brand-300 font-mono placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Bio */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Bio
              </label>
              <span className="text-[10px] text-slate-500">{bio.length}/160</span>
            </div>
            <textarea
              rows={2}
              maxLength={160}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell others about yourself..."
              className="glass-input w-full p-2.5 rounded-xl text-xs text-white placeholder:text-slate-500 resize-none"
            />
          </div>

          {/* Custom Status & Emoji */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Custom Status
            </label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-lg p-2 rounded-xl bg-slate-900 border border-white/10 shrink-0 select-none">
                  {statusEmoji}
                </div>
                <input
                  type="text"
                  maxLength={50}
                  value={customStatus}
                  onChange={(e) => setCustomStatus(e.target.value)}
                  placeholder="What's happening? (e.g. Coding Onyx)"
                  className="glass-input flex-1 px-3 py-2 rounded-xl text-xs text-white placeholder:text-slate-500"
                />
              </div>

              {/* Preset Emoji Grid */}
              <div className="grid grid-cols-6 gap-1.5 pt-1">
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

          {/* Founder Lock Banner if Founder */}
          {isUserFounder && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5 text-amber-300 text-xs">
              <Lock className="w-4 h-4 shrink-0 text-amber-400" />
              <div className="overflow-hidden">
                <span className="font-bold">Founder Lock Active:</span>{' '}
                <span className="text-[11px] text-amber-200/90">
                  Your verified 👑 Founder badge is permanently anchored to Hammad (@not_urs_hammi).
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => setIsChangePasswordOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5 active:scale-95"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Change Password</span>
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploadingAvatar}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-brand-500/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
}
