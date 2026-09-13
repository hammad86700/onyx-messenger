'use client';

import React from 'react';
import { Profile, isFounder, OnyxTheme } from '@/types/database';
import FounderBadge from '@/components/chat/FounderBadge';
import {
  User,
  Shield,
  Palette,
  LogOut,
  ExternalLink,
  Crown,
  Sparkles,
  ChevronRight,
  Instagram,
  Check,
  Download,
  KeyRound,
  Bell,
} from 'lucide-react';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendTestNotification,
} from '@/lib/notifications';

interface MobileSettingsSheetProps {
  currentUser: Profile;
  currentTheme: OnyxTheme;
  onSelectTheme: (theme: OnyxTheme) => void;
  onLogout: () => void;
  onOpenAdmin?: () => void;
  onEditProfile?: () => void;
  onChangePassword?: () => void;
}

const THEMES: { id: OnyxTheme; name: string; dot: string; desc: string }[] = [
  { id: 'onyx-pure', name: 'Onyx Pure', dot: 'bg-slate-900 border-slate-700', desc: 'Minimal OLED pitch dark' },
  { id: 'midnight-violet', name: 'Midnight Violet', dot: 'bg-purple-950 border-purple-500', desc: 'Deep violet neon glow' },
  { id: 'emerald-stealth', name: 'Emerald Stealth', dot: 'bg-emerald-950 border-emerald-500', desc: 'Sleek matrix emerald glow' },
  { id: 'sunset-horizon', name: 'Sunset Horizon', dot: 'bg-rose-950 border-rose-500', desc: 'Warm dusk crimson gradient' },
];

export default function MobileSettingsSheet({
  currentUser,
  currentTheme,
  onSelectTheme,
  onLogout,
  onOpenAdmin,
  onEditProfile,
  onChangePassword,
}: MobileSettingsSheetProps) {
  const isUserFounder = isFounder(currentUser);
  const [permission, setPermission] = React.useState<string>('default');
  const [testing, setTesting] = React.useState(false);

  React.useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    setPermission(granted ? 'granted' : 'denied');
  };

  const handleTestAlert = async () => {
    setTesting(true);
    await sendTestNotification();
    setTimeout(() => setTesting(false), 800);
  };

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3.5 pt-3 pb-28 space-y-3.5 bg-[#07080b] chat-scroll-viewport">
      {/* Profile Card */}
      <div className="p-3.5 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl relative overflow-hidden shrink-0">
        <div className="absolute top-0 right-0 w-36 h-36 bg-brand-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center gap-3.5 relative z-10">
          <div className="w-14 h-14 rounded-full bg-slate-800 border-2 border-brand-500/40 flex items-center justify-center font-bold text-lg text-brand-300 overflow-hidden shadow-md shrink-0">
            {currentUser.avatar_url ? (
              <img src={currentUser.avatar_url} alt={currentUser.full_name} className="w-full h-full object-cover" />
            ) : (
              currentUser.full_name?.slice(0, 2).toUpperCase() || 'ME'
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-sm font-bold text-white truncate">{currentUser.full_name}</h2>
              {isUserFounder && <FounderBadge size="sm" />}
            </div>

            <p className="text-xs text-brand-300 font-mono truncate">@{currentUser.username}</p>

            {currentUser.status_text && (
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {currentUser.status_emoji} {currentUser.status_text}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons: Edit Profile & Password */}
        <div className="grid grid-cols-2 gap-2 mt-3.5">
          {onEditProfile && (
            <button
              onClick={onEditProfile}
              className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white border border-white/10 transition-colors flex items-center justify-center gap-1.5 touch-manipulation active:scale-95"
            >
              <User className="w-3.5 h-3.5 text-brand-400" />
              <span>Edit Profile</span>
            </button>
          )}

          {onChangePassword && (
            <button
              onClick={onChangePassword}
              className="py-2.5 px-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-semibold text-indigo-300 border border-indigo-500/20 transition-colors flex items-center justify-center gap-1.5 touch-manipulation active:scale-95"
            >
              <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
              <span>Password</span>
            </button>
          )}
        </div>
      </div>

      {/* Push Notifications Setting Card */}
      <div className="p-3.5 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center border border-brand-500/30">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white">Push Notifications</h3>
              <p className="text-[10px] text-slate-400">Alerts when you receive messages</p>
            </div>
          </div>

          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              permission === 'granted'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : permission === 'denied'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}
          >
            {permission === 'granted' ? 'Active' : permission === 'denied' ? 'Blocked' : 'Off'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          {permission !== 'granted' ? (
            <button
              onClick={handleRequestPermission}
              className="py-2.5 px-3 rounded-xl bg-brand-600 hover:bg-brand-500 active:scale-95 text-xs font-semibold text-white transition-all shadow-md shadow-brand-600/30 flex items-center justify-center gap-1.5 touch-manipulation"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Enable Alerts</span>
            </button>
          ) : (
            <div className="py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-300 flex items-center justify-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Enabled</span>
            </div>
          )}

          <button
            onClick={handleTestAlert}
            disabled={testing}
            className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 border border-white/10 transition-colors flex items-center justify-center gap-1.5 touch-manipulation active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{testing ? 'Sending...' : 'Test Alert'}</span>
          </button>
        </div>
      </div>

      {/* Theme Picker */}
      <div className="space-y-2.5 shrink-0">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1 flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-purple-400" />
          <span>Onyx Themes</span>
        </h3>

        <div className="grid grid-cols-2 gap-2.5">
          {THEMES.map((thm) => {
            const isSelected = currentTheme === thm.id;
            return (
              <button
                key={thm.id}
                onClick={() => onSelectTheme(thm.id)}
                className={`p-3 rounded-2xl border text-left transition-all touch-manipulation relative overflow-hidden ${
                  isSelected
                    ? 'bg-brand-500/15 border-brand-500/50 text-white shadow-lg shadow-brand-500/10'
                    : 'bg-slate-900/60 border-white/5 text-slate-300 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`w-3.5 h-3.5 rounded-full border ${thm.dot}`} />
                  {isSelected && <Check className="w-3.5 h-3.5 text-brand-400" />}
                </div>
                <p className="text-xs font-bold truncate">{thm.name}</p>
                <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{thm.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Founder Recognition & Watermark Card */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-amber-500/10 via-yellow-500/5 to-purple-500/10 border border-amber-500/30 relative overflow-hidden shadow-xl shrink-0">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-md shrink-0">
              <Crown className="w-4 h-4 fill-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white flex items-center gap-1 truncate">
                <span>Engineered by Hammad</span>
                <Sparkles className="w-3 h-3 text-amber-400 animate-pulse shrink-0" />
              </p>
              <p className="text-[10px] text-amber-200/80 truncate">Founder & Principal Architect</p>
            </div>
          </div>

          <a
            href="https://instagram.com/not_urs_hammi"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-pink-600 via-purple-600 to-amber-500 text-white text-[11px] font-bold shadow-md shadow-pink-500/20 active:scale-95 transition-transform touch-manipulation shrink-0"
          >
            <Instagram className="w-3.5 h-3.5" />
            <span>@not_urs_hammi</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>

      {/* Admin Actions (Strictly rendered ONLY for Verified Admins - 100% Invisible to Public Users) */}
      {currentUser.is_admin && onOpenAdmin && (
        <button
          onClick={onOpenAdmin}
          className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-rose-950/40 via-red-900/30 to-slate-900 border border-rose-500/40 text-white shadow-lg touch-manipulation active:scale-98 transition-all hover:border-rose-500/70 shrink-0"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 via-pink-600 to-amber-600 flex items-center justify-center text-white shadow-md shadow-rose-500/25 shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="text-left min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-white truncate">Super-Admin Dashboard</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold uppercase shrink-0">
                  Admin
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">Manage users, delete accounts, stats</p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-rose-600/20 text-rose-300 border border-rose-500/30 flex items-center justify-center shrink-0">
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>
      )}

      {/* Change Password Card */}
      {onChangePassword && (
        <button
          onClick={onChangePassword}
          className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900 border border-indigo-500/30 text-white shadow-lg touch-manipulation active:scale-98 transition-all hover:border-indigo-500/60 shrink-0"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25 shrink-0">
              <KeyRound className="w-5 h-5 text-white" />
            </div>
            <div className="text-left min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-white truncate">Change Password</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold uppercase shrink-0">
                  Security
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">Update your Onyx account credentials safely</p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>
      )}

      {/* Install App on Mobile Card */}
      <button
        onClick={() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('open-onyx-install-modal'));
          }
        }}
        className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-brand-900/30 via-indigo-950/40 to-slate-900 border border-brand-500/30 text-white shadow-lg touch-manipulation active:scale-98 transition-all hover:border-brand-500/60 shrink-0"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-pink-600 flex items-center justify-center text-white shadow-md shadow-brand-500/25 shrink-0">
            <span className="font-black text-xs tracking-tighter">OX</span>
          </div>
          <div className="text-left min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-white truncate">Install Onyx App</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold uppercase shrink-0">
                PWA
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">Add to phone home screen like WhatsApp</p>
          </div>
        </div>
        <div className="w-8 h-8 rounded-xl bg-brand-600/30 text-brand-300 border border-brand-500/30 flex items-center justify-center shrink-0">
          <Download className="w-4 h-4" />
        </div>
      </button>

      {/* Sign Out Button */}
      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white text-xs font-semibold transition-colors active:scale-98 touch-manipulation shrink-0"
      >
        <LogOut className="w-4 h-4 text-rose-400" />
        <span>Log Out of Onyx</span>
      </button>

      {/* Footer Branding & Serverless Specs */}
      <div className="text-center pt-2 pb-6 shrink-0">
        <p className="text-[10px] text-slate-500 font-mono tracking-wider">
          ONYX MESSENGER v2.0 • SERVERLESS 1K CAPACITY
        </p>
      </div>
    </div>
  );
}
