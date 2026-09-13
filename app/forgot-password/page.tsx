'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SupportBadges from '@/components/chat/SupportBadges';
import FounderBadge from '@/components/chat/FounderBadge';
import {
  MessageSquare,
  KeyRound,
  Shield,
  ArrowRight,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  Clock,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import confetti from 'canvas-confetti';

type RecoveryTab = 'self-service' | 'admin-override';

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<RecoveryTab>('self-service');

  // Tab 1: Self-Service State
  const [identifier, setIdentifier] = useState('');
  const [selfLoading, setSelfLoading] = useState(false);
  const [selfError, setSelfError] = useState<string | null>(null);
  const [selfResult, setSelfResult] = useState<{
    resetUrl: string;
    token: string;
    expiresAt: string;
    user: {
      username: string;
      full_name: string;
      is_admin?: boolean;
      is_founder?: boolean;
    };
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Tab 2: Admin Emergency Override State
  const [adminIdentifier, setAdminIdentifier] = useState('');
  const [masterKey, setMasterKey] = useState('');
  const [showMasterKey, setShowMasterKey] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideSuccess, setOverrideSuccess] = useState<string | null>(null);

  // Handle Tab 1: Self-Service Request
  const handleSelfServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSelfError(null);
    setSelfLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate reset link.');
      }

      setSelfResult(data);
    } catch (err: any) {
      setSelfError(err.message || 'Failed to process password recovery request.');
    } finally {
      setSelfLoading(false);
    }
  };

  // Handle Tab 2: Admin Emergency Override
  const handleAdminOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOverrideError(null);

    if (newPassword.length < 6) {
      setOverrideError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setOverrideError('Passwords do not match. Please verify.');
      return;
    }

    setOverrideLoading(true);

    try {
      const res = await fetch('/api/auth/admin-emergency-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: adminIdentifier.trim(),
          master_key: masterKey.trim(),
          new_password: newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Emergency reset failed. Please check master key.');
      }

      setOverrideSuccess(data.message);
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (e) {
        // Ignored
      }
    } catch (err: any) {
      setOverrideError(err.message || 'Failed to execute emergency reset.');
    } finally {
      setOverrideLoading(false);
    }
  };

  const copyResetLink = () => {
    if (selfResult?.resetUrl && navigator.clipboard) {
      navigator.clipboard.writeText(selfResult.resetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden bg-slate-950">
      {/* Ambient background glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-600/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-brand-600/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[160px] pointer-events-none" />

      <div className="w-full max-w-lg z-10">
        {/* Top brand header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-4 px-3 py-1.5 rounded-full bg-slate-900/60 border border-white/5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Login</span>
          </Link>

          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 via-yellow-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 mb-3">
            <KeyRound className="w-7 h-7 text-white drop-shadow" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Account Recovery
          </h1>
          <p className="text-xs font-mono uppercase tracking-widest text-amber-400 mt-1 font-semibold">
            Onyx Security Shield
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Recover access to your account or execute an authorized admin emergency credentials override.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center p-1 rounded-2xl bg-slate-900/80 border border-white/10 mb-6 shadow-xl">
          <button
            type="button"
            onClick={() => {
              setActiveTab('self-service');
              setSelfError(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
              activeTab === 'self-service'
                ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Standard Recovery</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('admin-override');
              setOverrideError(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
              activeTab === 'admin-override'
                ? 'bg-gradient-to-r from-amber-600 to-yellow-600 text-white shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>👑 Admin Emergency</span>
          </button>
        </div>

        {/* Card Container */}
        <div className="glass-panel p-6 sm:p-8 rounded-2xl shadow-2xl relative border border-white/10">
          {/* TAB 1: SELF-SERVICE RECOVERY */}
          {activeTab === 'self-service' && (
            <div>
              {selfError && (
                <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{selfError}</span>
                </div>
              )}

              {selfResult ? (
                /* Generated Reset Link View */
                <div className="space-y-5 animate-fadeIn">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Reset Link Ready</h3>
                      <p className="text-xs text-slate-300 mt-0.5">
                        A secure, single-use reset token has been verified for{' '}
                        <strong className="text-white">@{selfResult.user.username}</strong>.
                      </p>
                    </div>
                  </div>

                  {/* Account Badge Card */}
                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-white/10 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>{selfResult.user.full_name}</span>
                        {selfResult.user.is_founder && <FounderBadge size="sm" />}
                        {selfResult.user.is_admin && !selfResult.user.is_founder && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            Admin
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-brand-400 font-mono">@{selfResult.user.username}</p>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Expires in 30m</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/reset-password?token=${selfResult.token}`)}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-brand-600 via-indigo-600 to-pink-600 hover:from-brand-500 hover:to-pink-500 text-white font-semibold text-xs transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 group"
                    >
                      <span>Proceed to Reset Password Now</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>

                    <button
                      type="button"
                      onClick={copyResetLink}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 text-xs font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span className="text-emerald-400">Link Copied to Clipboard!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-slate-400" />
                          <span>Copy Reset URL</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Request Form */
                <form onSubmit={handleSelfServiceSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Account Email or @Username
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        placeholder="name@example.com or @username"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      Enter the email or @username registered on your Onyx account.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={selfLoading || !identifier.trim()}
                    className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-brand-600 via-indigo-600 to-pink-600 hover:from-brand-500 hover:to-pink-500 text-white font-semibold text-xs transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {selfLoading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Generate Secure Reset Link</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: ADMIN EMERGENCY OVERRIDE */}
          {activeTab === 'admin-override' && (
            <div>
              {overrideError && (
                <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{overrideError}</span>
                </div>
              )}

              {overrideSuccess ? (
                /* Success View */
                <div className="space-y-4 text-center py-4 animate-fadeIn">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white">
                    Admin Password Successfully Overridden
                  </h3>
                  <p className="text-xs text-slate-300 max-w-sm mx-auto">
                    {overrideSuccess}
                  </p>
                  <div className="pt-2">
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-all shadow-lg shadow-brand-500/25"
                    >
                      <span>Proceed to Login</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ) : (
                /* Override Form */
                <form onSubmit={handleAdminOverrideSubmit} className="space-y-4">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
                    <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      <strong>Founder/Admin Emergency Protocol:</strong> Instantly resets admin credentials using the master recovery key configured on the server environment.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Admin Email or @Username
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. hammad2006 or admin@example.com"
                      value={adminIdentifier}
                      onChange={(e) => setAdminIdentifier(e.target.value)}
                      className="glass-input w-full px-3.5 py-2.5 rounded-xl text-sm placeholder:text-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Master Recovery Secret Key
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showMasterKey ? 'text' : 'password'}
                        required
                        placeholder="Enter master emergency key"
                        value={masterKey}
                        onChange={(e) => setMasterKey(e.target.value)}
                        className="glass-input w-full pl-10 pr-11 py-2.5 rounded-xl text-sm placeholder:text-slate-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowMasterKey(!showMasterKey)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showMasterKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      (Configured in server .env.local as ADMIN_MASTER_RECOVERY_KEY or SUPABASE_SERVICE_ROLE_KEY)
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        New Password
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="glass-input w-full px-3.5 py-2.5 rounded-xl text-sm placeholder:text-slate-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Confirm Password
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="glass-input w-full px-3.5 py-2.5 rounded-xl text-sm placeholder:text-slate-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={overrideLoading || !adminIdentifier.trim() || !masterKey.trim()}
                    className="w-full mt-3 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-700 hover:from-amber-500 hover:to-yellow-500 text-white font-bold text-xs tracking-wide uppercase transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {overrideLoading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Override Credentials Now</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* CLI Info Box for Server Admins */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-400">
              Are you the server host? You can also reset the admin password directly via terminal:
            </p>
            <code className="inline-block mt-2 px-3 py-1.5 rounded-lg bg-black/60 border border-white/10 text-[11px] font-mono text-amber-300 select-all">
              npm run reset-admin &lt;new_password&gt;
            </code>
          </div>
        </div>

        {/* Support Badges Section */}
        <div className="mt-8 flex flex-col items-center">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-3">
            Admin & Technical Support
          </p>
          <SupportBadges variant="expanded" />

          {/* Watermark Footer */}
          <div className="mt-6 pt-4 border-t border-slate-800/40 w-full text-center">
            <p className="text-xs text-slate-500 font-medium flex items-center justify-center gap-1.5 select-none">
              <span>Onyx • Conceived &amp; Developed by</span>
              <a
                href="https://instagram.com/not_urs_hammi"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300 font-semibold hover:underline"
              >
                Hammad
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
