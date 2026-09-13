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

    const { message_id } = await request.json();

    if (!message_id) {
      return NextResponse.json({ error: 'message_id is required' }, { status: 400 });
    }

    // Mark view_once_viewed = true
    const { data: updated, error } = await supabaseAdmin
      .from('messages')
      .update({ view_once_viewed: true })
      .eq('id', message_id)
      .select('id, conversation_id, view_once_viewed')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, message: updated });
  } catch (err: any) {
    console.error('Mark view-once error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
