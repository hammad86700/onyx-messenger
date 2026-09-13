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

    const { message_id, emoji } = await request.json();

    if (!message_id || !emoji) {
      return NextResponse.json({ error: 'message_id and emoji are required' }, { status: 400 });
    }

    // Check if user has already reacted with this emoji
    const { data: existingReaction } = await supabaseAdmin
      .from('message_reactions')
      .select('id')
      .eq('message_id', message_id)
      .eq('user_id', user.id)
      .eq('emoji', emoji)
      .maybeSingle();

    if (existingReaction) {
      // Toggle off: delete reaction
      await supabaseAdmin
        .from('message_reactions')
        .delete()
        .eq('id', existingReaction.id);
    } else {
      // Toggle on: add reaction
      await supabaseAdmin
        .from('message_reactions')
        .insert({
          message_id,
          user_id: user.id,
          emoji,
        });
    }

    // Fetch updated aggregate reactions for this message
    const { data: rawReactions } = await supabaseAdmin
      .from('message_reactions')
      .select('id, user_id, emoji')
      .eq('message_id', message_id);

    let reactionsMap: { [e: string]: { count: number; user_ids: string[]; has_reacted: boolean } } = {};
    if (rawReactions) {
      for (const r of rawReactions) {
        if (!reactionsMap[r.emoji]) {
          reactionsMap[r.emoji] = { count: 0, user_ids: [], has_reacted: false };
        }
        reactionsMap[r.emoji].count += 1;
        reactionsMap[r.emoji].user_ids.push(r.user_id);
        if (r.user_id === user.id) {
          reactionsMap[r.emoji].has_reacted = true;
        }
      }
    }

    const updatedReactions = Object.entries(reactionsMap).map(([e, data]) => ({
      emoji: e,
      count: data.count,
      user_ids: data.user_ids,
      has_reacted: data.has_reacted,
    }));

    return NextResponse.json({
      success: true,
      message_id,
      reactions: updatedReactions,
    });
  } catch (err: any) {
    console.error('Toggle reaction error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
