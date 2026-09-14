import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isFounder } from '@/types/database';

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Please log in' }, { status: 401 });
    }

    // Verify caller is an administrator
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!adminProfile?.is_admin) {
      return NextResponse.json(
        { error: 'Forbidden: Super-Admin access required to delete users' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('user_id');

    if (!targetUserId) {
      return NextResponse.json({ error: 'Missing target user_id' }, { status: 400 });
    }

    // Guard: Cannot delete self
    if (user.id === targetUserId) {
      return NextResponse.json(
        { error: 'You cannot delete your own admin account.' },
        { status: 400 }
      );
    }

    // Fetch target user profile to inspect safety rules
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .maybeSingle();

    // Guard: Cannot delete the Founder
    if (
      targetProfile &&
      (isFounder(targetProfile) ||
        targetProfile.username === 'hammad2006' ||
        targetProfile.is_founder)
    ) {
      return NextResponse.json(
        { error: 'Protection fault: The Founder account cannot be deleted.' },
        { status: 403 }
      );
    }

    // 1. Kick active user session immediately via real-time channel
    try {
      const userKickChannel = supabaseAdmin.channel(`user:${targetUserId}`);
      await userKickChannel.send({
        type: 'broadcast',
        event: 'account_deleted',
        payload: { user_id: targetUserId },
      });
      supabaseAdmin.removeChannel(userKickChannel);
    } catch (e) {
      console.warn('Realtime kick broadcast notice:', e);
    }

    // 2. Delete password reset tokens
    try {
      await supabaseAdmin.from('password_reset_tokens').delete().eq('user_id', targetUserId);
    } catch (e) {
      console.warn('Reset tokens cleanup notice:', e);
    }

    // 3. Delete user reactions
    try {
      await supabaseAdmin.from('message_reactions').delete().eq('user_id', targetUserId);
    } catch (e) {
      console.warn('Reactions cleanup notice:', e);
    }

    // 4. Delete user starred messages
    try {
      await supabaseAdmin.from('starred_messages').delete().eq('user_id', targetUserId);
    } catch (e) {
      console.warn('Starred cleanup notice:', e);
    }

    // 5. Delete user sent messages
    try {
      await supabaseAdmin.from('messages').delete().eq('sender_id', targetUserId);
    } catch (e) {
      console.warn('Messages cleanup notice:', e);
    }

    // 6. Clean up conversations created by this user to satisfy foreign key constraints
    try {
      await supabaseAdmin
        .from('conversations')
        .update({ created_by: null })
        .eq('created_by', targetUserId);
    } catch (e) {
      console.warn('Conversations created_by cleanup notice:', e);
    }

    // 7. Delete user conversation memberships
    try {
      await supabaseAdmin.from('conversation_participants').delete().eq('user_id', targetUserId);
    } catch (e) {
      console.warn('Participants cleanup notice:', e);
    }

    // 8. Clean up user avatar file from avatars bucket
    try {
      if (targetProfile?.avatar_url) {
        const urlParts = targetProfile.avatar_url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        if (fileName) {
          await supabaseAdmin.storage.from('avatars').remove([fileName, `${targetUserId}/${fileName}`]);
        }
      }
    } catch (e) {
      console.warn('Avatar storage cleanup notice:', e);
    }

    // 9. Delete user profile record
    const { error: profileDeleteErr } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', targetUserId);

    if (profileDeleteErr) {
      console.error('Profile deletion error:', profileDeleteErr);
    }

    // 10. Permanently delete user from Supabase Auth
    const { error: authDeleteErr } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (authDeleteErr) {
      console.error('Auth user deletion error:', authDeleteErr);
    }

    return NextResponse.json({
      success: true,
      message: `User @${targetProfile?.username || targetUserId} has been permanently deleted from Onyx.`,
      deleted_user_id: targetUserId,
    });
  } catch (err: any) {
    console.error('Delete user API error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error while deleting user' },
      { status: 500 }
    );
  }
}
