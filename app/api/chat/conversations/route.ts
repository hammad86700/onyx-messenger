import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Get all conversation IDs that user participates in
    const { data: participantRows, error: partErr } = await supabaseAdmin
      .from('conversation_participants')
      .select('conversation_id, is_pinned, last_read_at')
      .eq('user_id', user.id);

    if (partErr) throw partErr;

    if (!participantRows || participantRows.length === 0) {
      return NextResponse.json({ conversations: [] });
    }

    const convIds = participantRows.map((p) => p.conversation_id);

    // 2. Fetch conversations
    const { data: convs, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .in('id', convIds)
      .order('updated_at', { ascending: false });

    if (convErr) throw convErr;

    // 3. Fetch all participants for these conversations
    const { data: allParticipants, error: allPartErr } = await supabaseAdmin
      .from('conversation_participants')
      .select(`
        conversation_id,
        user_id,
        is_group_admin,
        is_pinned,
        last_read_at,
        joined_at,
        profile:profiles(id, username, full_name, avatar_url, is_admin, status_emoji, status_text)
      `)
      .in('conversation_id', convIds);

    if (allPartErr) throw allPartErr;

    // 4. Fetch the last message for each conversation
    const { data: messages, error: msgErr } = await supabaseAdmin
      .from('messages')
      .select(`
        id,
        conversation_id,
        sender_id,
        content,
        media_url,
        media_type,
        is_read,
        created_at,
        sender:profiles(id, username, full_name, avatar_url)
      `)
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false });

    if (msgErr) throw msgErr;

    // Fetch deleted_for_me flags for this user
    const deletedForMeIds = new Set<string>();
    const messageIds = (messages || []).map((m) => m.id);
    if (messageIds.length > 0) {
      const { data: myDeleted } = await supabaseAdmin
        .from('message_reactions')
        .select('message_id')
        .eq('user_id', user.id)
        .eq('emoji', '__deleted_for_me__')
        .in('message_id', messageIds);

      if (myDeleted) {
        for (const d of myDeleted) {
          deletedForMeIds.add(d.message_id);
        }
      }
    }

    // Map participants, pinned status, and last message to each conversation
    const mappedConvs = (convs || []).map((conv) => {
      const participants = (allParticipants || []).filter(
        (p) => p.conversation_id === conv.id
      );
      const lastMessage = (messages || []).find(
        (m) => m.conversation_id === conv.id && !deletedForMeIds.has(m.id)
      );
      const myPart = participantRows.find((p) => p.conversation_id === conv.id);

      const isDirect = conv.type === 'direct';
      const isPendingRequest = isDirect && conv.name === 'pending_request';
      const isIncoming = isPendingRequest && conv.created_by !== user.id;
      const isOutgoing = isPendingRequest && conv.created_by === user.id;

      return {
        ...conv,
        participants,
        last_message: lastMessage || null,
        is_pinned: myPart?.is_pinned === true,
        is_request: isPendingRequest,
        is_incoming_request: isIncoming,
        is_outgoing_request: isOutgoing,
        request_status: isPendingRequest ? 'pending' : 'accepted',
      };
    });

    // Pinned chats first, then by updated_at
    mappedConvs.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    return NextResponse.json({ conversations: mappedConvs });
  } catch (err: any) {
    console.error('Fetch conversations error:', err);
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

    const body = await request.json();
    const { type, group_name, participant_ids } = body;
    const target_user_id = body.target_user_id || body.recipient_id;

    if (type === 'direct') {
      if (!target_user_id) {
        return NextResponse.json({ error: 'target_user_id is required for direct chat' }, { status: 400 });
      }

      if (target_user_id === user.id) {
        return NextResponse.json({ error: 'Cannot create direct chat with yourself' }, { status: 400 });
      }

      // Check if direct conversation already exists between these 2 users
      const { data: myConvs } = await supabaseAdmin
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (myConvs && myConvs.length > 0) {
        const myConvIds = myConvs.map((c) => c.conversation_id);

        const { data: targetMatches } = await supabaseAdmin
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', target_user_id)
          .in('conversation_id', myConvIds);

        if (targetMatches && targetMatches.length > 0) {
          const commonIds = targetMatches.map((t) => t.conversation_id);
          // Check if any of these common conversations is of type 'direct'
          const { data: existingDirect } = await supabaseAdmin
            .from('conversations')
            .select('*')
            .eq('type', 'direct')
            .in('id', commonIds)
            .maybeSingle();

          if (existingDirect) {
            const { data: fullExisting } = await supabaseAdmin
              .from('conversations')
              .select(`
                *,
                participants:conversation_participants(
                  conversation_id,
                  user_id,
                  is_group_admin,
                  profile:profiles(id, username, full_name, avatar_url, is_admin, status_emoji, status_text)
                )
              `)
              .eq('id', existingDirect.id)
              .single();

            const targetConv = fullExisting || existingDirect;
            const isPendingRequest = targetConv.name === 'pending_request';
            const enriched = {
              ...targetConv,
              is_request: isPendingRequest,
              is_incoming_request: isPendingRequest && targetConv.created_by !== user.id,
              is_outgoing_request: isPendingRequest && targetConv.created_by === user.id,
              request_status: isPendingRequest ? 'pending' : 'accepted',
            };

            return NextResponse.json({ conversation: enriched, isNew: false });
          }
        }
      }

      // Create new direct conversation with pending_request status
      const { data: newConv, error: createConvErr } = await supabaseAdmin
        .from('conversations')
        .insert({
          type: 'direct',
          name: 'pending_request',
          created_by: user.id,
        })
        .select()
        .single();

      if (createConvErr || !newConv) {
        throw createConvErr || new Error('Failed to create conversation');
      }

      // Insert both participants
      const participantsToInsert = [
        { conversation_id: newConv.id, user_id: user.id, is_group_admin: false },
        { conversation_id: newConv.id, user_id: target_user_id, is_group_admin: false },
      ];

      const { error: partErr } = await supabaseAdmin
        .from('conversation_participants')
        .insert(participantsToInsert);

      if (partErr) throw partErr;

      const { data: fullNewConv } = await supabaseAdmin
        .from('conversations')
        .select(`
          *,
          participants:conversation_participants(
            conversation_id,
            user_id,
            is_group_admin,
            profile:profiles(id, username, full_name, avatar_url, is_admin, status_emoji, status_text)
          )
        `)
        .eq('id', newConv.id)
        .single();

      const convFinal = fullNewConv || newConv;
      const enrichedNew = {
        ...convFinal,
        is_request: true,
        is_incoming_request: false,
        is_outgoing_request: true,
        request_status: 'pending',
      };

      return NextResponse.json({ conversation: enrichedNew, isNew: true });
    }

    if (type === 'group') {
      if (!group_name || !group_name.trim()) {
        return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
      }

      const participantIds: string[] = Array.isArray(participant_ids) ? participant_ids : [];
      // Ensure current user is in participantIds
      const uniqueParticipants = Array.from(new Set([user.id, ...participantIds]));

      if (uniqueParticipants.length < 2) {
        return NextResponse.json(
          { error: 'Group must include at least one other participant' },
          { status: 400 }
        );
      }

      const avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(
        group_name.trim()
      )}`;

      const { data: newConv, error: createConvErr } = await supabaseAdmin
        .from('conversations')
        .insert({
          type: 'group',
          name: group_name.trim(),
          avatar_url: avatarUrl,
          created_by: user.id,
        })
        .select()
        .single();

      if (createConvErr || !newConv) {
        throw createConvErr || new Error('Failed to create group conversation');
      }

      // Insert all participants
      const participantsToInsert = uniqueParticipants.map((pid) => ({
        conversation_id: newConv.id,
        user_id: pid,
        is_group_admin: pid === user.id,
      }));

      const { error: partErr } = await supabaseAdmin
        .from('conversation_participants')
        .insert(participantsToInsert);

      if (partErr) throw partErr;

      return NextResponse.json({ conversation: newConv, isNew: true });
    }

    return NextResponse.json({ error: 'Invalid conversation type' }, { status: 400 });
  } catch (err: any) {
    console.error('Create conversation error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Delete or Clear the whole chat
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversation_id');
    const mode = searchParams.get('mode') || 'delete'; // 'delete' or 'clear'

    if (!conversationId) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
    }

    // Verify user is a participant
    const { data: participation } = await supabaseAdmin
      .from('conversation_participants')
      .select('user_id, is_group_admin')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!participation) {
      return NextResponse.json({ error: 'Forbidden: You are not in this conversation' }, { status: 403 });
    }

    // Get participant IDs so callers and socket channels can broadcast deletion
    const { data: allParticipants } = await supabaseAdmin
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId);
    const participantUserIds = (allParticipants || []).map((p) => p.user_id);

    // 1. Fetch message IDs in this conversation to clean up reactions & starred
    const { data: convMessages } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId);

    const messageIds = (convMessages || []).map((m) => m.id);

    if (messageIds.length > 0) {
      try {
        await supabaseAdmin.from('message_reactions').delete().in('message_id', messageIds);
      } catch (e) {
        console.warn('Reactions cleanup error:', e);
      }

      try {
        await supabaseAdmin.from('starred_messages').delete().in('message_id', messageIds);
      } catch (e) {
        console.warn('Starred cleanup error:', e);
      }
    }

    // 2. Delete all messages in the conversation
    const { error: delMsgErr } = await supabaseAdmin
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId);

    if (delMsgErr) {
      console.error('Delete messages error:', delMsgErr);
    }

    if (mode === 'clear') {
      // Clear mode: messages deleted, update conversation updated_at
      await supabaseAdmin
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      return NextResponse.json({
        success: true,
        mode: 'clear',
        conversation_id: conversationId,
        participant_ids: participantUserIds,
        message: 'All messages in this conversation have been cleared.',
      });
    }

    // Mode is 'delete': remove participants and delete the conversation itself
    try {
      await supabaseAdmin
        .from('conversation_participants')
        .delete()
        .eq('conversation_id', conversationId);
    } catch (e) {
      console.warn('Delete participants error:', e);
    }

    const { error: delConvErr } = await supabaseAdmin
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (delConvErr) {
      console.error('Delete conversation error:', delConvErr);
    }

    return NextResponse.json({
      success: true,
      mode: 'delete',
      conversation_id: conversationId,
      participant_ids: participantUserIds,
      message: 'The whole chat has been permanently deleted.',
    });
  } catch (err: any) {
    console.error('Delete conversation error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
