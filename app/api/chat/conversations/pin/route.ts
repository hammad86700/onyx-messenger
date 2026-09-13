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

    const { conversation_id, is_pinned } = await request.json();

    if (!conversation_id || typeof is_pinned !== 'boolean') {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('conversation_participants')
      .update({ is_pinned })
      .eq('conversation_id', conversation_id)
      .eq('user_id', user.id)
      .select('conversation_id, is_pinned')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, is_pinned: updated.is_pinned });
  } catch (err: any) {
    console.error('Pin conversation error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
