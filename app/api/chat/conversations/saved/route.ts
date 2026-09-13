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

    // 1. Check if Saved Messages conversation already exists for this user
    const { data: existingSaved } = await supabaseAdmin
      .from('conversations')
      .select(`
        *,
        participants:conversation_participants(
          user_id,
          is_group_admin,
          is_pinned,
          last_read_at,
          profile:profiles(*)
        )
      `)
      .eq('created_by', user.id)
      .eq('name', 'Saved Messages')
      .maybeSingle();

    if (existingSaved) {
      return NextResponse.json({
        conversation: {
          ...existingSaved,
          is_pinned: true,
        },
      });
    }

    // 2. Otherwise, create new Saved Messages self-chat
    const { data: newSaved, error: convErr } = await supabaseAdmin
      .from('conversations')
      .insert({
        type: 'direct',
        name: 'Saved Messages',
        created_by: user.id,
      })
      .select()
      .single();

    if (convErr || !newSaved) {
      throw convErr || new Error('Failed to create Saved Messages');
    }

    // Add user as sole participant with is_pinned = true
    await supabaseAdmin
      .from('conversation_participants')
      .insert({
        conversation_id: newSaved.id,
        user_id: user.id,
        is_group_admin: true,
        is_pinned: true,
      });

    const { data: fullSaved } = await supabaseAdmin
      .from('conversations')
      .select(`
        *,
        participants:conversation_participants(
          user_id,
          is_group_admin,
          is_pinned,
          last_read_at,
          profile:profiles(*)
        )
      `)
      .eq('id', newSaved.id)
      .single();

    return NextResponse.json({
      conversation: {
        ...(fullSaved || newSaved),
        is_pinned: true,
      },
    });
  } catch (err: any) {
    console.error('Saved messages route error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
