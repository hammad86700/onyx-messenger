import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: starredRows, error } = await supabaseAdmin
      .from('starred_messages')
      .select(`
        id,
        user_id,
        message_id,
        created_at,
        message:messages(
          id,
          conversation_id,
          sender_id,
          content,
          media_url,
          media_type,
          file_name,
          file_size,
          created_at,
          sender:profiles(id, username, full_name, avatar_url, is_founder, is_admin),
          conversation:conversations(id, name, type)
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      starred: starredRows || [],
    });
  } catch (err: any) {
    console.error('Fetch starred messages error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

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

    // Check if already starred
    const { data: existing } = await supabaseAdmin
      .from('starred_messages')
      .select('id')
      .eq('user_id', user.id)
      .eq('message_id', message_id)
      .maybeSingle();

    if (existing) {
      // Unstar
      const { error: delErr } = await supabaseAdmin
        .from('starred_messages')
        .delete()
        .eq('id', existing.id);

      if (delErr) throw delErr;

      return NextResponse.json({
        success: true,
        is_starred: false,
        message_id,
      });
    } else {
      // Star
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('starred_messages')
        .insert({
          user_id: user.id,
          message_id,
        })
        .select()
        .single();

      if (insErr) throw insErr;

      return NextResponse.json({
        success: true,
        is_starred: true,
        message_id,
      });
    }
  } catch (err: any) {
    console.error('Toggle starred message error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
