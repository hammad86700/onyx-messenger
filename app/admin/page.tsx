'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Profile, isFounder } from '@/types/database';
import SupportBadges from '@/components/chat/SupportBadges';
import FounderBadge from '@/components/chat/FounderBadge';
import {
  ShieldAlert,
  Users,
  MessageSquare,
  KeyRound,
  Check,
  Copy,
  ExternalLink,
  Search,
  ArrowLeft,
  Shield,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  UserCheck,
  UserX,
  HardDrive,
  Radio,
  Megaphone,
  Ban,
  Activity,
  Send,
  Trash2,
} from 'lucide-react';

interface ResetModalData {
  isOpen: boolean;
  user: Profile | null;
  resetUrl: string | null;
  expiresAt: string | null;
}

export default function AdminPortalPage() {
  const router = useRouter();
  const supabase = createClient();

  const [currentAdmin, setCurrentAdmin] = useState<Profile | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [stats, setStats] = useState({
    users: 0,
    conversations: 0,
    messages: 0,
    storage_files: 0,
  });
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Announcement state
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementType, setAnnouncementType] = useState<'info' | 'warning' | 'emergency'>('emergency');
  const [broadcasting, setBroadcasting] = useState(false);
  const [lastBroadcast, setLastBroadcast] = useState<{
    message: string;
    type: string;
    time: string;
  } | null>(null);

  // Modal state
  const [resetModal, setResetModal] = useState<ResetModalData>({
    isOpen: false,
    user: null,
    resetUrl: null,
    expiresAt: null,
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      // Verify admin status
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profErr || !profile?.is_admin) {
        router.push('/');
        return;
      }

      setCurrentAdmin(profile);

      // Fetch all users
      const { data: allProfiles, error: usersErr } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersErr) throw usersErr;
      setUsers(allProfiles || []);

      // Fetch stats via API
      try {
        const statsRes = await fetch('/api/admin/stats');
        const statsData = await statsRes.json();
        if (statsData.stats) {
          setStats(statsData.stats);
        }
      } catch (err) {
        console.error('Failed to load stats:', err);
      }
    } catch (err: any) {
      console.error('Error loading admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  // Presence channel for online socket count
  useEffect(() => {
    if (!currentAdmin) return;

    const presenceChannel = supabase.channel('online-users');
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const activeIds = Object.keys(state);
        setOnlineCount(activeIds.length);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [currentAdmin]);

  // Publish Emergency Announcement
  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementMessage.trim()) return;

    setBroadcasting(true);
    try {
      const res = await fetch('/api/admin/announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: announcementMessage.trim(),
          type: announcementType,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to publish announcement');

      setLastBroadcast({
        message: announcementMessage.trim(),
        type: announcementType,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      setAnnouncementMessage('');
      showToast('Global emergency announcement broadcast to all users!');
    } catch (err: any) {
      alert(err.message || 'Error publishing broadcast');
    } finally {
      setBroadcasting(false);
    }
  };

  // Toggle Ban/Unban User
  const handleToggleBan = async (targetUser: Profile) => {
    const isBanning = !targetUser.is_banned;
    const confirmMsg = isBanning
      ? `Are you sure you want to BAN @${targetUser.username}? They will be immediately blocked from logging in.`
      : `Unban @${targetUser.username}? They will be able to log in again.`;

    if (!confirm(confirmMsg)) return;

    setActionLoadingId(`ban-${targetUser.id}`);
    try {
      const res = await fetch('/api/admin/ban-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_user_id: targetUser.id,
          is_banned: isBanning,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update ban status');

      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, is_banned: isBanning } : u))
      );
      showToast(`User @${targetUser.username} has been ${isBanning ? 'banned' : 'unbanned'}.`);
    } catch (err: any) {
      alert(err.message || 'Failed to update ban status');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleGenerateResetLink = async (targetUser: Profile) => {
    setActionLoadingId(targetUser.id);
    try {
      const res = await fetch('/api/admin/generate-reset-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: targetUser.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate token');

      if (navigator?.clipboard) {
        await navigator.clipboard.writeText(data.resetUrl);
      }

      setResetModal({
        isOpen: true,
        user: targetUser,
        resetUrl: data.resetUrl,
        expiresAt: data.expiresAt,
      });

      showToast(`Password reset link generated & copied for @${targetUser.username}!`);
    } catch (err: any) {
      alert(err.message || 'Error generating reset token');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleAdmin = async (targetUser: Profile) => {
    if (targetUser.id === currentAdmin?.id && targetUser.is_admin) {
      if (!confirm('Are you sure you want to demote yourself from Admin?')) return;
    }

    setActionLoadingId(`toggle-${targetUser.id}`);
    try {
      const res = await fetch('/api/admin/toggle-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_user_id: targetUser.id,
          is_admin: !targetUser.is_admin,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update admin role');

      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, is_admin: !targetUser.is_admin } : u))
      );
      showToast(
        `Updated role for @${targetUser.username} to ${!targetUser.is_admin ? 'Admin' : 'Standard User'}`
      );
    } catch (err: any) {
      alert(err.message || 'Failed to update role');
    } finally {
      setActionLoadingId(null);
    }
  };

  const copyResetUrl = () => {
    if (resetModal.resetUrl && navigator.clipboard) {
      navigator.clipboard.writeText(resetModal.resetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDeleteUser = async (targetUser: Profile) => {
    if (targetUser.id === currentAdmin?.id) {
      alert('You cannot delete your own admin account.');
      return;
    }

    if (isFounder(targetUser) || targetUser.username === 'hammad2006') {
      alert('The Founder account is protected and cannot be deleted.');
      return;
    }

    const confirmed = confirm(
      `⚠️ PERMANENT USER DELETION ⚠️\n\nAre you sure you want to permanently DELETE and remove @${targetUser.username} (${targetUser.full_name}) from Onyx?\n\nThis will completely wipe their account, messages, and profile from the database. This action CANNOT be undone.`
    );

    if (!confirmed) return;

    setActionLoadingId(`delete-${targetUser.id}`);
    try {
      const res = await fetch(`/api/admin/delete-user?user_id=${targetUser.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');

      setUsers((prev) => prev.filter((u) => u.id !== targetUser.id));
      setStats((prev) => ({ ...prev, users: Math.max(0, prev.users - 1) }));
      showToast(`User @${targetUser.username} has been permanently removed from Onyx.`);
    } catch (err: any) {
      alert(err.message || 'Error deleting user');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.full_name.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090a0f] flex flex-col items-center justify-center text-slate-300">
        <div className="w-10 h-10 border-3 border-brand-500/20 border-t-brand-500 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium">Loading Super-Admin Portal...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 flex flex-col">
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-sm font-medium shadow-2xl flex items-center gap-2.5 animate-fadeIn backdrop-blur-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors shrink-0 touch-manipulation active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Chat</span>
            </Link>

            <div className="h-4 w-px bg-slate-800 shrink-0" />

            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold shrink-0">
                <Shield className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                  <span className="truncate">Super-Admin</span>
                  <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
                    Restricted
                  </span>
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <SupportBadges className="hidden lg:flex" />
            <div className="flex items-center gap-2 sm:gap-2.5 pl-2 sm:pl-3 border-l border-slate-800">
              <div className="w-8 h-8 rounded-full bg-brand-600/30 border border-brand-500/40 flex items-center justify-center text-brand-300 font-semibold text-xs shrink-0">
                {currentAdmin?.full_name?.[0] || 'A'}
              </div>
              <div className="hidden sm:block text-left text-xs min-w-0">
                <p className="font-semibold text-slate-200 flex items-center gap-1.5 truncate">
                  <span>{currentAdmin?.full_name}</span>
                  {isFounder(currentAdmin) && <FounderBadge size="sm" />}
                </p>
                <p className="text-[10px] text-brand-400 font-mono truncate">@{currentAdmin?.username}</p>
              </div>
              <button
                onClick={handleLogout}
                title="Log Out"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors ml-1"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* Real-Time Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Registered Users */}
          <div className="glass-panel p-5 rounded-2xl border border-white/5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Users</p>
                <p className="text-3xl font-extrabold text-white mt-1.5">{stats.users}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                <Users className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Registered accounts in database</span>
            </div>
          </div>

          {/* Active Online Sockets */}
          <div className="glass-panel p-5 rounded-2xl border border-white/5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Active Online</p>
                <p className="text-3xl font-extrabold text-white mt-1.5">{onlineCount}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Radio className="w-6 h-6 animate-pulse" />
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Connected WebSockets right now</span>
            </div>
          </div>

          {/* Total Messages Exchanged */}
          <div className="glass-panel p-5 rounded-2xl border border-white/5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Messages</p>
                <p className="text-3xl font-extrabold text-white mt-1.5">{stats.messages}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <MessageSquare className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
              <span>Texts, media, & voice notes</span>
            </div>
          </div>

          {/* Storage Files in chat-attachments */}
          <div className="glass-panel p-5 rounded-2xl border border-white/5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Cloud Media</p>
                <p className="text-3xl font-extrabold text-white mt-1.5">{stats.storage_files}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <HardDrive className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Files in &apos;chat-attachments&apos; bucket</span>
            </div>
          </div>
        </div>

        {/* Emergency Broadcast Announcement Publisher */}
        <div className="glass-panel p-6 rounded-2xl border border-rose-500/20 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Megaphone className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  Emergency Global Announcement
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    Live Broadcast
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Send an immediate alert banner that instantly displays across all active client windows.
                </p>
              </div>
            </div>

            {lastBroadcast && (
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-white/5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Last sent at {lastBroadcast.time}</span>
              </div>
            )}
          </div>

          <form onSubmit={handlePublishAnnouncement} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-3">
                <input
                  type="text"
                  placeholder="Type an announcement (e.g., 'Scheduled maintenance in 10 minutes')..."
                  value={announcementMessage}
                  onChange={(e) => setAnnouncementMessage(e.target.value)}
                  className="glass-input w-full px-4 py-2.5 rounded-xl text-sm placeholder:text-slate-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={announcementType}
                  onChange={(e: any) => setAnnouncementType(e.target.value)}
                  className="glass-input px-3 py-2.5 rounded-xl text-xs flex-1 bg-slate-900 text-slate-200"
                >
                  <option value="emergency">🚨 Critical</option>
                  <option value="warning">⚠️ Warning</option>
                  <option value="info">ℹ️ Info</option>
                </select>

                <button
                  type="submit"
                  disabled={broadcasting || !announcementMessage.trim()}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-semibold transition-all shadow-md shadow-rose-500/20 flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                >
                  {broadcasting ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Broadcast</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* User Directory Table Section */}
        <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-xl">
          <div className="p-6 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>User Directory</span>
                <span className="text-xs font-mono font-normal text-slate-400 px-2 py-0.5 rounded-full bg-slate-800">
                  {filteredUsers.length} accounts
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Manage user permissions, ban bad actors, and generate single-use 30-minute password reset links.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by name or @user..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="glass-input w-full pl-9 pr-4 py-2 rounded-xl text-xs placeholder:text-slate-500"
                />
              </div>

              <button
                onClick={loadAdminData}
                title="Refresh user list"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shrink-0"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile View: Sleek User Cards (< md screens) */}
          <div className="block md:hidden divide-y divide-slate-800/60">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm">
                No users found matching &quot;{searchQuery}&quot;.
              </div>
            ) : (
              filteredUsers.map((user) => {
                const isSelf = user.id === currentAdmin?.id;
                const isActionLoading = actionLoadingId === user.id;
                const isRoleLoading = actionLoadingId === `toggle-${user.id}`;
                const isBanLoading = actionLoadingId === `ban-${user.id}`;
                const isDeleteLoading = actionLoadingId === `delete-${user.id}`;

                return (
                  <div key={user.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-brand-300 overflow-hidden shrink-0">
                          {user.avatar_url ? (
                            <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                          ) : (
                            user.full_name?.slice(0, 2).toUpperCase() || 'U'
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white text-sm flex items-center gap-1.5 truncate">
                            <span className={user.is_banned ? 'line-through text-slate-400' : ''}>
                              {user.full_name}
                            </span>
                            {isFounder(user) && <FounderBadge size="sm" />}
                            {isSelf && (
                              <span className="text-[10px] text-brand-400 bg-brand-500/10 border border-brand-500/20 px-1.5 py-0.2 rounded font-normal shrink-0">
                                You
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-brand-400 font-mono truncate">@{user.username}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {user.is_admin ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <Shield className="w-2.5 h-2.5" />
                            Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            User
                          </span>
                        )}

                        {user.is_banned && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                            <Ban className="w-2.5 h-2.5" />
                            Banned
                          </span>
                        )}
                      </div>
                    </div>

                    {user.status_text && (
                      <p className="text-xs text-slate-400 italic truncate">
                        {user.status_emoji} {user.status_text}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-white/5 gap-2">
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">
                        Joined {new Date(user.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>

                      {/* Mobile Action Buttons */}
                      <div className="flex items-center gap-1.5">
                        {!isSelf && (
                          <button
                            onClick={() => handleToggleBan(user)}
                            disabled={isBanLoading}
                            title={user.is_banned ? 'Lift ban' : 'Ban user'}
                            className={`p-2 rounded-xl text-xs font-medium border transition-colors touch-manipulation active:scale-95 ${
                              user.is_banned
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                : 'bg-red-500/10 text-red-300 border-red-500/30'
                            }`}
                          >
                            {isBanLoading ? (
                              <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Ban className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => handleToggleAdmin(user)}
                          disabled={isRoleLoading}
                          title={user.is_admin ? 'Demote from admin' : 'Make admin'}
                          className={`p-2 rounded-xl text-xs font-medium border transition-colors touch-manipulation active:scale-95 ${
                            user.is_admin
                              ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {isRoleLoading ? (
                            <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          ) : user.is_admin ? (
                            <UserX className="w-3.5 h-3.5" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          onClick={() => handleGenerateResetLink(user)}
                          disabled={isActionLoading}
                          title="Generate reset link"
                          className="p-2 rounded-xl bg-brand-600/20 hover:bg-brand-600/30 text-brand-300 border border-brand-500/30 transition-colors touch-manipulation active:scale-95"
                        >
                          {isActionLoading ? (
                            <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          ) : (
                            <KeyRound className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {!isSelf && (
                          <button
                            onClick={() => handleDeleteUser(user)}
                            disabled={isDeleteLoading}
                            title="Permanently remove user"
                            className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors touch-manipulation active:scale-95"
                          >
                            {isDeleteLoading ? (
                              <div className="w-3.5 h-3.5 border-2 border-rose-400/40 border-t-rose-400 rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table View (>= md screens) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wider font-semibold text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-6">User</th>
                  <th className="py-3.5 px-6">Status / Bio</th>
                  <th className="py-3.5 px-6">Role & Status</th>
                  <th className="py-3.5 px-6">Registered On</th>
                  <th className="py-3.5 px-6 text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-500 text-sm">
                      No users found matching &quot;{searchQuery}&quot;.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelf = user.id === currentAdmin?.id;
                    const isActionLoading = actionLoadingId === user.id;
                    const isRoleLoading = actionLoadingId === `toggle-${user.id}`;
                    const isBanLoading = actionLoadingId === `ban-${user.id}`;
                    const isDeleteLoading = actionLoadingId === `delete-${user.id}`;

                    return (
                      <tr
                        key={user.id}
                        className={`transition-colors ${
                          user.is_banned ? 'bg-rose-950/20 hover:bg-rose-950/30' : 'hover:bg-slate-800/30'
                        }`}
                      >
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-brand-300 overflow-hidden shrink-0">
                              {user.avatar_url ? (
                                <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                              ) : (
                                user.full_name?.slice(0, 2).toUpperCase() || 'U'
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-white flex items-center gap-1.5">
                                <span className={user.is_banned ? 'line-through text-slate-400' : ''}>
                                  {user.full_name}
                                </span>
                                {isFounder(user) && <FounderBadge size="sm" />}
                                {isSelf && (
                                  <span className="text-[10px] text-brand-400 bg-brand-500/10 border border-brand-500/20 px-1.5 py-0.2 rounded font-normal">
                                    You
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-brand-400 font-mono">@{user.username}</p>
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-6 text-xs text-slate-300">
                          {user.status_emoji || user.status_text ? (
                            <div className="flex items-center gap-1.5 max-w-xs">
                              {user.status_emoji && <span className="text-sm">{user.status_emoji}</span>}
                              {user.status_text && (
                                <span className="text-slate-400 italic truncate" title={user.status_text}>
                                  {user.status_text}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600 italic">No status</span>
                          )}
                        </td>

                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2 flex-wrap">
                            {user.is_admin ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                <Shield className="w-3 h-3" />
                                Super Admin
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                                User
                              </span>
                            )}

                            {user.is_banned && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse">
                                <Ban className="w-3 h-3" />
                                Banned
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-4 px-6 text-xs text-slate-400">
                          {new Date(user.created_at).toLocaleDateString([], {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>

                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Ban / Unban User (cannot ban self) */}
                            {!isSelf && (
                              <button
                                onClick={() => handleToggleBan(user)}
                                disabled={isBanLoading}
                                title={user.is_banned ? 'Lift ban from user' : 'Ban user from platform'}
                                className={`p-2 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                                  user.is_banned
                                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                    : 'bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/30'
                                }`}
                              >
                                {isBanLoading ? (
                                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                ) : (
                                  <Ban className="w-3.5 h-3.5" />
                                )}
                                <span className="hidden sm:inline">
                                  {user.is_banned ? 'Unban' : 'Ban'}
                                </span>
                              </button>
                            )}

                            {/* Toggle Admin role */}
                            <button
                              onClick={() => handleToggleAdmin(user)}
                              disabled={isRoleLoading}
                              title={user.is_admin ? 'Demote to regular user' : 'Promote to super admin'}
                              className={`p-2 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                                user.is_admin
                                  ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                              }`}
                            >
                              {user.is_admin ? (
                                <UserX className="w-3.5 h-3.5" />
                              ) : (
                                <UserCheck className="w-3.5 h-3.5" />
                              )}
                              <span className="hidden sm:inline">
                                {user.is_admin ? 'Demote' : 'Make Admin'}
                              </span>
                            </button>

                            {/* Generate Reset Link Button */}
                            <button
                              onClick={() => handleGenerateResetLink(user)}
                              disabled={isActionLoading}
                              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white text-xs font-semibold transition-all shadow-md shadow-brand-500/20 flex items-center gap-1.5 disabled:opacity-50"
                            >
                              {isActionLoading ? (
                                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              ) : (
                                <KeyRound className="w-3.5 h-3.5" />
                              )}
                              <span>Reset Link</span>
                            </button>

                            {/* Delete User Permanently */}
                            {!isSelf && (
                              <button
                                onClick={() => handleDeleteUser(user)}
                                disabled={isDeleteLoading}
                                title="Permanently delete user from Onyx"
                                className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors flex items-center gap-1.5 touch-manipulation active:scale-95"
                              >
                                {isDeleteLoading ? (
                                  <div className="w-3.5 h-3.5 border-2 border-rose-400/40 border-t-rose-400 rounded-full animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                                <span className="hidden sm:inline">Delete</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Generated Token Modal */}
      {resetModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl max-w-lg w-full border border-white/10 shadow-2xl relative animate-fadeIn">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Reset Link Generated</h3>
                <p className="text-xs text-slate-400">
                  Direct credential recovery URL for @{resetModal.user?.username}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 mb-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Direct Reset Link:</span>
                <span className="flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
                  <Clock className="w-3 h-3" />
                  Valid for 30 minutes (single-use)
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 font-mono text-xs text-brand-300 break-all select-all">
                {resetModal.resetUrl}
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              This link has been automatically copied to your clipboard. Send it directly to the user to allow them to set a new password. Once submitted, the link will immediately expire.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setResetModal({ isOpen: false, user: null, resetUrl: null, expiresAt: null })}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Close
              </button>

              <button
                onClick={copyResetUrl}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-md shadow-brand-500/20"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
              </button>

              {resetModal.resetUrl && (
                <a
                  href={resetModal.resetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <span>Open</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
