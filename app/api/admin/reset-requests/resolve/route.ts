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

    const { request_id } = await request.json();

    if (!request_id) {
      return NextResponse.json({ error: 'request_id is required' }, { status: 400 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('password_reset_tokens')
      .update({ is_used: true })
      .eq('id', request_id);

    if (updateErr) {
      throw updateErr;
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset request resolved/dismissed.',
    });
  } catch (err: any) {
    console.error('Resolve reset request error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
