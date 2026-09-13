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

    const nowIso = new Date().toISOString();

    // Update user's activity timestamp across all their conversations
    await supabaseAdmin
      .from('conversation_participants')
      .update({ last_read_at: nowIso })
      .eq('user_id', user.id);

    return NextResponse.json({ success: true, timestamp: nowIso });
  } catch (err: any) {
    console.error('Heartbeat error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
