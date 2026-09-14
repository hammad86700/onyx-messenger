import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Not logged in' }, { status: 401 });
    }

    // Verify user is an admin
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch active password reset requests (tokens starting with req_ and is_used = false)
    const { data: rawRequests, error: reqErr } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('id, user_id, token, created_at, expires_at, is_used')
      .like('token', 'req_%')
      .eq('is_used', false)
      .order('created_at', { ascending: false });

    if (reqErr) {
      throw reqErr;
    }

    if (!rawRequests || rawRequests.length === 0) {
      return NextResponse.json({ requests: [] });
    }

    // Hydrate user profile and email for each request
    const userIds = Array.from(new Set(rawRequests.map((r) => r.user_id)));

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, username, full_name, avatar_url, is_admin, is_founder, created_at')
      .in('id', userIds);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    // Fetch auth emails
    const emailMap = new Map<string, string>();
    try {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      if (usersData?.users) {
        for (const u of usersData.users) {
          if (u.email) emailMap.set(u.id, u.email);
        }
      }
    } catch {}

    const hydratedRequests = rawRequests.map((req) => {
      const prof = profileMap.get(req.user_id);
      const email = emailMap.get(req.user_id) || null;

      return {
        id: req.id,
        user_id: req.user_id,
        created_at: req.created_at,
        expires_at: req.expires_at,
        token_preview: req.token.slice(0, 12) + '...',
        user: prof || {
          id: req.user_id,
          username: 'unknown',
          full_name: 'Unknown User',
          avatar_url: null,
          is_admin: false,
          is_founder: false,
        },
        email,
      };
    });

    return NextResponse.json({ requests: hydratedRequests });
  } catch (err: any) {
    console.error('Fetch reset requests error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
