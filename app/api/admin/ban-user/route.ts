import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check caller is admin
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { target_user_id, is_banned } = await request.json();

    if (!target_user_id || typeof is_banned !== 'boolean') {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    // Prevent banning self
    if (user.id === target_user_id) {
      return NextResponse.json({ error: 'You cannot ban your own admin account.' }, { status: 400 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('profiles')
      .update({ is_banned })
      .eq('id', target_user_id)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, user: updated });
  } catch (err: any) {
    console.error('Ban user error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
