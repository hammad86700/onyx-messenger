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

    const { conversation_id } = await request.json();

    if (!conversation_id) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
    }

    // 1. Fetch conversation
    const { data: conv, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', conversation_id)
      .single();

    if (convErr || !conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // 2. Verify user is a participant
    const { data: participant } = await supabaseAdmin
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversation_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!participant) {
      return NextResponse.json({ error: 'Forbidden: You are not a participant' }, { status: 403 });
    }

    // 3. Update conversation name to null (marking it accepted)
    const { data: updatedConv, error: updateErr } = await supabaseAdmin
      .from('conversations')
      .update({
        name: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation_id)
      .select(`
        *,
        participants:conversation_participants(
          conversation_id,
          user_id,
          is_group_admin,
          profile:profiles(id, username, full_name, avatar_url, is_admin, status_emoji, status_text)
        )
      `)
      .single();

    if (updateErr) {
      throw updateErr;
    }

    const enriched = {
      ...updatedConv,
      is_request: false,
      is_incoming_request: false,
      is_outgoing_request: false,
      request_status: 'accepted',
    };

    // 4. Broadcast acceptance to room and to requester user channel
    try {
      const roomChannel = supabaseAdmin.channel(`chat-room:${conversation_id}`);
      await roomChannel.send({
        type: 'broadcast',
        event: 'request_accepted',
        payload: {
          conversationId: conversation_id,
          acceptedBy: user.id,
          conversation: enriched,
        },
      });

      if (conv.created_by && conv.created_by !== user.id) {
        const userChannel = supabaseAdmin.channel(`user:${conv.created_by}`);
        await userChannel.send({
          type: 'broadcast',
          event: 'request_accepted',
          payload: {
            conversationId: conversation_id,
            acceptedBy: user.id,
            conversation: enriched,
          },
        });
      }
    } catch (broadcastErr) {
      console.warn('Realtime broadcast error on request accept:', broadcastErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Message request accepted successfully.',
      conversation: enriched,
    });
  } catch (err: any) {
    console.error('Accept request error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
