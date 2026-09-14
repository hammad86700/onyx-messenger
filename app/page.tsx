'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Profile, isFounder } from '@/types/database';
import { MobileChatLayout } from '@/components/mobile/MobileShell';
import AuthView from '@/components/mobile/AuthView';

export default function MainPage() {
  const supabase = createClient();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // 1. Initial User & Profile Load with Fast-Bypass & Hard Timeout
  useEffect(() => {
    let mounted = true;

    async function initUser() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!mounted) return;

        if (!session?.user) {
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        const currentUser = session.user;
        setUser(currentUser);

        // Fetch profile with a 2.5-second hard timeout to prevent locking
        const profilePromise = supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .maybeSingle();

        const timeoutPromise = new Promise<{ data: null; error: string }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: 'timeout' }), 2500)
        );

        const res: any = await Promise.race([profilePromise, timeoutPromise]);

        if (!mounted) return;

        if (res?.data) {
          setProfile(res.data);
        } else {
          // Fallback profile if profile row doesn't exist yet or query timed out
          const resolvedUsername = currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'user';
          const fallbackProfile: Profile = {
            id: currentUser.id,
            username: resolvedUsername,
            full_name: currentUser.user_metadata?.full_name || 'Onyx User',
            avatar_url: currentUser.user_metadata?.avatar_url || null,
            bio: null,
            is_admin: Boolean(currentUser.email === 'hammad2006' || currentUser.email === 'hammad86700@gmail.com' || resolvedUsername === 'hammad2006'),
            is_founder: Boolean(isFounder({ username: resolvedUsername }) || currentUser.email === 'hammad2006' || currentUser.email === 'hammad86700@gmail.com'),
            is_banned: false,
            created_at: new Date().toISOString(),
          };
          setProfile(fallbackProfile);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        if (mounted) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initUser();

    // Listen to auth changes so login/logout updates state immediately
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        try {
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();
          if (prof && mounted) {
            setProfile(prof);
          }
        } catch {}
        if (mounted) setLoading(false);
      } else {
        if (mounted) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  // 2. Global Online Presence Pool
  useEffect(() => {
    if (!profile) return;

    const presenceChannel = supabase.channel('online-users', {
      config: {
        presence: { key: profile.id },
      },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const activeIds = new Set<string>(Object.keys(state));
        setOnlineUserIds(activeIds);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: profile.id,
            username: profile.username,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [profile, supabase]);

  return (
    <div className="flex-1 min-h-0 w-full h-full flex items-center justify-center bg-[#050608] select-none overflow-hidden">
      {loading ? (
        /* Styled Centered Brand Loader */
        <div className="w-full max-w-md h-full sm:h-auto sm:max-h-[92vh] flex flex-col items-center justify-center p-8 text-white text-center gap-5 bg-[#090a0f] sm:rounded-3xl sm:border sm:border-white/10 shadow-2xl my-auto">
          <div className="relative">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-pink-600 flex items-center justify-center shadow-2xl shadow-brand-500/30 ring-1 ring-white/20 animate-pulse">
              <span className="font-black text-2xl text-white tracking-tighter">OX</span>
            </div>
            <div className="absolute -inset-2 rounded-3xl bg-brand-500/20 blur-xl -z-10 animate-pulse" />
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Onyx
            </h1>
            <p className="text-[10px] font-mono tracking-widest text-brand-400 uppercase font-semibold">
              Fast • Private • Borderless
            </p>
          </div>

          <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur-md">
            <div className="w-3.5 h-3.5 border-2 border-brand-500/30 border-t-brand-400 rounded-full animate-spin" />
            <span className="text-xs font-mono text-slate-400">Connecting to Onyx...</span>
          </div>
        </div>
      ) : !profile ? (
        /* Unauthenticated: Render Sign In / Create Account form centered */
        <div className="w-full max-w-md h-full sm:h-auto sm:max-h-[92vh] flex flex-col bg-[#090a0f] sm:rounded-3xl sm:border sm:border-white/10 shadow-2xl overflow-hidden my-auto">
          <AuthView
            onAuthSuccess={(newProfile) => {
              setUser(newProfile);
              setProfile(newProfile);
            }}
          />
        </div>
      ) : (
        /* Authenticated: Render Native Messenger (Mobile full-screen, Desktop dual-pane) */
        <div className="w-full h-full flex flex-col bg-[#07080b] overflow-hidden">
          <MobileChatLayout
            currentUser={profile}
            onUpdateCurrentUser={(updated) => setProfile(updated)}
            onlineUserIds={onlineUserIds}
          />
        </div>
      )}
    </div>
  );
}