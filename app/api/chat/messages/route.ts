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

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversation_id');
    const limitParam = searchParams.get('limit');
    const after = searchParams.get('after');
    const before = searchParams.get('before');

    if (!conversationId) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
    }

    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 30, 1), 100) : 30;

    // Verify user is a participant
    const { data: participation } = await supabaseAdmin
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!participation) {
      return NextResponse.json({ error: 'Forbidden: You are not a participant in this conversation' }, { status: 403 });
    }

    // Update user's last_read_at in conversation_participants
    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from('conversation_participants')
      .update({ last_read_at: nowIso })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);

    // Fetch messages with cursor-based pagination or newer sync
    let query = supabaseAdmin
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
        reply_to_id,
        is_edited,
        is_deleted,
        file_name,
        file_size,
        view_once_viewed,
        sender:profiles(id, username, full_name, avatar_url, status_emoji, is_founder, is_admin)
      `)
      .eq('conversation_id', conversationId);

    let isDescending = false;

    if (after) {
      // Sync newer messages in chronological order
      query = query.gt('created_at', after).order('created_at', { ascending: true }).limit(100);
    } else if (before) {
      // Fetch older messages before cursor (newest to oldest)
      isDescending = true;
      query = query.lt('created_at', before).order('created_at', { ascending: false }).limit(limit);
    } else {
      // Initial fetch: 30 most recent messages (newest to oldest)
      isDescending = true;
      query = query.order('created_at', { ascending: false }).limit(limit);
    }

    const { data: messages, error } = await query;

    if (error) throw error;

    const rawList = messages || [];
    const hasMore = isDescending ? rawList.length === limit : false;
    // For descending queries, reverse back to chronological order
    const messageList = isDescending ? [...rawList].reverse() : rawList;
    const messageIds = messageList.map((m) => m.id);

    // Fetch all reactions for these messages
    let reactionsMap: { [msgId: string]: { [emoji: string]: { count: number; user_ids: string[]; has_reacted: boolean } } } = {};
    const deletedForMeSet = new Set<string>();

    if (messageIds.length > 0) {
      const { data: rawReactions } = await supabaseAdmin
        .from('message_reactions')
        .select('id, message_id, user_id, emoji')
        .in('message_id', messageIds);

      if (rawReactions) {
        for (const r of rawReactions) {
          // Check for "Delete for me" flag
          if (r.emoji === '__deleted_for_me__' && r.user_id === user.id) {
            deletedForMeSet.add(r.message_id);
            continue;
          }

          // Ignore any internal system flags from emoji reaction aggregates
          if (r.emoji.startsWith('__')) {
            continue;
          }

          if (!reactionsMap[r.message_id]) {
            reactionsMap[r.message_id] = {};
          }
          if (!reactionsMap[r.message_id][r.emoji]) {
            reactionsMap[r.message_id][r.emoji] = {
              count: 0,
              user_ids: [],
              has_reacted: false,
            };
          }

          reactionsMap[r.message_id][r.emoji].count += 1;
          reactionsMap[r.message_id][r.emoji].user_ids.push(r.user_id);
          if (r.user_id === user.id) {
            reactionsMap[r.message_id][r.emoji].has_reacted = true;
          }
        }
      }
    }

    // Filter out messages deleted for the current user
    const visibleMessages = messageList.filter((m) => !deletedForMeSet.has(m.id));
    const visibleMessageIds = visibleMessages.map((m) => m.id);

    // Hydrate reply_to messages
    const replyIds = Array.from(
      new Set(visibleMessages.filter((m) => m.reply_to_id).map((m) => m.reply_to_id as string))
    );

    let repliesMap: { [id: string]: any } = {};
    if (replyIds.length > 0) {
      const { data: repliedMessages } = await supabaseAdmin
        .from('messages')
        .select(`
          id,
          sender_id,
          content,
          media_url,
          media_type,
          file_name,
          sender:profiles(id, username, full_name, is_founder, is_admin)
        `)
        .in('id', replyIds);

      if (repliedMessages) {
        for (const rm of repliedMessages) {
          repliesMap[rm.id] = rm;
        }
      }
    }

    // Hydrate starred status for the current user
    let starredSet = new Set<string>();
    if (visibleMessageIds.length > 0) {
      const { data: userStarred } = await supabaseAdmin
        .from('starred_messages')
        .select('message_id')
        .eq('user_id', user.id)
        .in('message_id', visibleMessageIds);

      if (userStarred) {
        for (const s of userStarred) {
          starredSet.add(s.message_id);
        }
      }
    }

    // Format output
    const hydratedMessages = visibleMessages.map((m) => {
      const msgReactions = reactionsMap[m.id]
        ? Object.entries(reactionsMap[m.id]).map(([emoji, data]) => ({
            emoji,
            count: data.count,
            user_ids: data.user_ids,
            has_reacted: data.has_reacted,
          }))
        : [];

      return {
        ...m,
        reply_to: m.reply_to_id ? repliesMap[m.reply_to_id] || null : null,
        reactions: msgReactions,
        is_starred: starredSet.has(m.id),
      };
    });

    return NextResponse.json({ messages: hydratedMessages, has_more: hasMore });
  } catch (err: any) {
    console.error('Fetch messages error:', err);
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
    const {
      conversation_id,
      content,
      media_url,
      media_type = 'text',
      reply_to_id,
      file_name,
      file_size,
      view_once_viewed,
    } = body;

    if (!conversation_id) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
    }

    if (!content && !media_url) {
      return NextResponse.json({ error: 'Message must contain either text content or media' }, { status: 400 });
    }

    // Insert message
    const { data: message, error: msgErr } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id,
        sender_id: user.id,
        content: content || null,
        media_url: media_url || null,
        media_type: media_type || 'text',
        is_read: false,
        reply_to_id: reply_to_id || null,
        file_name: file_name || null,
        file_size: file_size || null,
        view_once_viewed: view_once_viewed === false ? false : null,
        is_edited: false,
        is_deleted: false,
      })
      .select(`
        id,
        conversation_id,
        sender_id,
        content,
        media_url,
        media_type,
        is_read,
        created_at,
        reply_to_id,
        is_edited,
        is_deleted,
        file_name,
        file_size,
        view_once_viewed,
        sender:profiles(id, username, full_name, avatar_url, status_emoji)
      `)
      .single();

    if (msgErr) throw msgErr;

    // If message was a reply, fetch parent snippet
    let replySnippet: any = null;
    if (reply_to_id) {
      const { data: parentMsg } = await supabaseAdmin
        .from('messages')
        .select(`
          id,
          sender_id,
          content,
          media_url,
          media_type,
          file_name,
          sender:profiles(id, username, full_name)
        `)
        .eq('id', reply_to_id)
        .maybeSingle();

      replySnippet = parentMsg;
    }

    // Update conversation timestamp
    await supabaseAdmin
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversation_id);

    return NextResponse.json({
      message: {
        ...message,
        reply_to: replySnippet,
        reactions: [],
      },
    });
  } catch (err: any) {
    console.error('Send message error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Edit Message: authors can edit text within a 15-minute window
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message_id, content } = await request.json();

    if (!message_id || !content?.trim()) {
      return NextResponse.json({ error: 'message_id and content are required' }, { status: 400 });
    }

    // Fetch message
    const { data: msg, error: fetchErr } = await supabaseAdmin
      .from('messages')
      .select('id, sender_id, created_at, is_deleted')
      .eq('id', message_id)
      .single();

    if (fetchErr || !msg) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (msg.sender_id !== user.id) {
      return NextResponse.json({ error: 'You can only edit your own messages' }, { status: 403 });
    }

    if (msg.is_deleted) {
      return NextResponse.json({ error: 'Deleted messages cannot be edited' }, { status: 400 });
    }

    // 15-minute window enforcement
    const messageAgeMs = Date.now() - new Date(msg.created_at).getTime();
    if (messageAgeMs > 15 * 60 * 1000) {
      return NextResponse.json(
        { error: 'Messages can only be edited within 15 minutes of sending.' },
        { status: 400 }
      );
    }

    // Update message
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('messages')
      .update({
        content: content.trim(),
        is_edited: true,
      })
      .eq('id', message_id)
      .select(`
        id,
        conversation_id,
        sender_id,
        content,
        media_url,
        media_type,
        is_read,
        created_at,
        reply_to_id,
        is_edited,
        is_deleted,
        file_name,
        file_size,
        view_once_viewed,
        sender:profiles(id, username, full_name, avatar_url, status_emoji)
      `)
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true, message: updated });
  } catch (err: any) {
    console.error('Edit message error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Message Deletion: Supports "Delete for me" (type=me) and "Delete for everyone" (type=everyone)
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
    const messageId = searchParams.get('message_id');
    const deleteType = searchParams.get('type') || 'everyone'; // 'me' | 'everyone'

    if (!messageId) {
      return NextResponse.json({ error: 'message_id is required' }, { status: 400 });
    }

    // Fetch message
    const { data: msg, error: fetchErr } = await supabaseAdmin
      .from('messages')
      .select('id, sender_id, conversation_id')
      .eq('id', messageId)
      .single();

    if (fetchErr || !msg) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Verify user is a participant of the conversation
    const { data: participation } = await supabaseAdmin
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', msg.conversation_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!participation) {
      return NextResponse.json({ error: 'Forbidden: You are not in this conversation' }, { status: 403 });
    }

    // CASE 1: Delete for Me
    if (deleteType === 'me') {
      // Record persistent deletion flag in message_reactions
      const { error: insErr } = await supabaseAdmin
        .from('message_reactions')
        .insert({
          message_id: messageId,
          user_id: user.id,
          emoji: '__deleted_for_me__',
        });

      if (insErr && !insErr.message.includes('duplicate')) {
        throw insErr;
      }

      return NextResponse.json({
        success: true,
        deleted_for_me: true,
        messageId,
      });
    }

    // CASE 2: Delete for Everyone (Author or Super Admin only)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    const isAuthor = msg.sender_id === user.id;
    const isAdmin = profile?.is_admin === true;

    if (!isAuthor && !isAdmin) {
      return NextResponse.json(
        { error: 'Only the sender can delete this message for everyone.' },
        { status: 403 }
      );
    }

    // Mark as deleted for everyone and strip content and media
    const { data: deleted, error: delErr } = await supabaseAdmin
      .from('messages')
      .update({
        is_deleted: true,
        content: 'This message was deleted',
        media_url: null,
        file_name: null,
        file_size: null,
      })
      .eq('id', messageId)
      .select(`
        id,
        conversation_id,
        sender_id,
        content,
        media_url,
        media_type,
        is_read,
        created_at,
        reply_to_id,
        is_edited,
        is_deleted,
        file_name,
        file_size,
        view_once_viewed,
        sender:profiles(id, username, full_name, avatar_url, status_emoji)
      `)
      .single();

    if (delErr) throw delErr;

    return NextResponse.json({ success: true, message: deleted, deleted_for_everyone: true });
  } catch (err: any) {
    console.error('Delete message error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
