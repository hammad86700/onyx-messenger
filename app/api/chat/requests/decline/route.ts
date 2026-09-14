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

    // 1. Verify user is a participant
    const { data: participant } = await supabaseAdmin
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversation_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!participant) {
      return NextResponse.json({ error: 'Forbidden: You are not a participant' }, { status: 403 });
    }

    // 2. Fetch conversation
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('created_by')
      .eq('id', conversation_id)
      .single();

    // 3. Delete messages, participants, and conversation
    await supabaseAdmin
      .from('messages')
      .delete()
      .eq('conversation_id', conversation_id);

    await supabaseAdmin
      .from('conversation_participants')
      .delete()
      .eq('conversation_id', conversation_id);

    await supabaseAdmin
      .from('conversations')
      .delete()
      .eq('id', conversation_id);

    // Notify requester if needed
    if (conv?.created_by && conv.created_by !== user.id) {
      try {
        const userChannel = supabaseAdmin.channel(`user:${conv.created_by}`);
        await userChannel.send({
          type: 'broadcast',
          event: 'request_declined',
          payload: {
            conversationId: conversation_id,
            declinedBy: user.id,
          },
        });
      } catch (e) {
        // Ignored
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Message request declined.',
    });
  } catch (err: any) {
    console.error('Decline request error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
