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

    // 1. Delete user reactions
    try {
      await supabaseAdmin.from('message_reactions').delete().eq('user_id', targetUserId);
    } catch (e) {
      console.warn('Reactions cleanup notice:', e);
    }

    // 2. Delete user starred messages
    try {
      await supabaseAdmin.from('starred_messages').delete().eq('user_id', targetUserId);
    } catch (e) {
      console.warn('Starred cleanup notice:', e);
    }

    // 3. Delete user sent messages
    try {
      await supabaseAdmin.from('messages').delete().eq('sender_id', targetUserId);
    } catch (e) {
      console.warn('Messages cleanup notice:', e);
    }

    // 4. Delete user conversation memberships
    try {
      await supabaseAdmin.from('conversation_participants').delete().eq('user_id', targetUserId);
    } catch (e) {
      console.warn('Participants cleanup notice:', e);
    }

    // 5. Delete user profile record
    const { error: profileDeleteErr } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', targetUserId);

    if (profileDeleteErr) {
      console.error('Profile deletion error:', profileDeleteErr);
    }

    // 6. Permanently delete user from Supabase Auth
    const { error: authDeleteErr } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (authDeleteErr) {
      console.error('Auth user deletion error:', authDeleteErr);
      // Even if auth fails because user was already deleted, profile is removed
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
