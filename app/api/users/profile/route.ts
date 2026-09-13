import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Please log in' }, { status: 401 });
    }

    const {
      status_emoji,
      status_text,
      full_name,
      username,
      bio,
      custom_status,
      avatar_url,
    } = await request.json();

    const updateData: any = {};

    if (typeof status_emoji !== 'undefined') updateData.status_emoji = status_emoji;
    if (typeof status_text !== 'undefined') updateData.status_text = status_text;
    if (typeof bio !== 'undefined') updateData.bio = bio ? bio.trim() : null;
    if (typeof custom_status !== 'undefined') updateData.custom_status = custom_status ? custom_status.trim() : null;

    if (typeof full_name !== 'undefined') {
      const trimmed = full_name.trim();
      if (!trimmed) {
        return NextResponse.json({ error: 'Full name cannot be empty.' }, { status: 400 });
      }
      updateData.full_name = trimmed;
    }

    if (typeof avatar_url !== 'undefined') {
      updateData.avatar_url = avatar_url;
    }

    // Validate and update username if provided
    if (typeof username !== 'undefined') {
      const cleanUsername = username.trim().toLowerCase().replace(/^@+/, '');

      if (!/^[a-z0-9_]{3,25}$/.test(cleanUsername)) {
        return NextResponse.json(
          { error: 'Username must be 3-25 characters and contain only lowercase letters, numbers, and underscores.' },
          { status: 400 }
        );
      }

      // Check if already taken by another user
      const { data: existingUser, error: checkErr } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .ilike('username', cleanUsername)
        .neq('id', user.id)
        .maybeSingle();

      if (checkErr) {
        console.error('Error checking username uniqueness:', checkErr);
      }

      if (existingUser) {
        return NextResponse.json(
          { error: `The username "@${cleanUsername}" is already taken by another user.` },
          { status: 400 }
        );
      }

      updateData.username = cleanUsername;

      // Update username in auth user metadata
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { username: cleanUsername },
      });
    }

    // Check founder lock: if user is founder, keep is_founder permanently true
    const { data: currentProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_founder, username')
      .eq('id', user.id)
      .single();

    if (
      currentProfile?.is_founder ||
      currentProfile?.username?.toLowerCase() === 'hammad2006' ||
      updateData.username === 'hammad2006' ||
      updateData.username === 'not_urs_hammi'
    ) {
      updateData.is_founder = true;
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)
      .select('*')
      .single();

    if (updateErr) {
      console.error('Database profile update error:', updateErr);
      return NextResponse.json({ error: updateErr.message || 'Failed to update profile.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, profile: updated });
  } catch (err: any) {
    console.error('Update profile error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 });
  }
}
