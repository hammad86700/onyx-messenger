import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Not logged in' }, { status: 401 });
    }

    // Verify user is an admin
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { target_user_id } = await request.json();

    if (!target_user_id) {
      return NextResponse.json({ error: 'target_user_id is required' }, { status: 400 });
    }

    // Check target user exists
    const { data: targetProfile, error: targetErr } = await supabaseAdmin
      .from('profiles')
      .select('id, username, full_name')
      .eq('id', target_user_id)
      .single();

    if (targetErr || !targetProfile) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    // Generate crypto token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

    // Invalidate any older unused tokens for this user
    await supabaseAdmin
      .from('password_reset_tokens')
      .update({ is_used: true })
      .eq('user_id', target_user_id)
      .eq('is_used', false);

    // Insert new single-use token
    const { data: tokenRecord, error: tokenErr } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert({
        user_id: target_user_id,
        token,
        expires_at: expiresAt,
        is_used: false,
      })
      .select()
      .single();

    if (tokenErr) {
      console.error('Error creating password reset token:', tokenErr);
      return NextResponse.json({ error: 'Failed to generate reset token' }, { status: 500 });
    }

    // Determine host / origin
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const resetUrl = `${protocol}://${host}/reset-password?token=${token}`;

    return NextResponse.json({
      success: true,
      token,
      resetUrl,
      expiresAt,
      user: targetProfile,
    });
  } catch (err: any) {
    console.error('Admin generate-reset-token error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
