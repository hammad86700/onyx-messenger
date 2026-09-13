import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { identifier: rawIdentifier } = await request.json();

    if (!rawIdentifier || typeof rawIdentifier !== 'string') {
      return NextResponse.json(
        { error: 'Email or @username is required to request a password reset.' },
        { status: 400 }
      );
    }

    const identifier = rawIdentifier.trim();
    let targetProfile: any = null;
    let targetAuthUser: any = null;

    // 1. If identifier is an email address
    if (identifier.includes('@') && identifier.includes('.')) {
      const cleanEmail = identifier.toLowerCase();
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      targetAuthUser = usersData?.users.find(
        (u) => u.email?.toLowerCase() === cleanEmail
      );

      if (targetAuthUser) {
        const { data: prof } = await supabaseAdmin
          .from('profiles')
          .select('id, username, full_name, is_admin, is_founder, is_banned')
          .eq('id', targetAuthUser.id)
          .maybeSingle();
        targetProfile = prof;
      }
    }

    // 2. If not found by email, check by @username in profiles table
    if (!targetProfile) {
      const cleanUsername = identifier.toLowerCase().replace(/^@+/, '');
      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('id, username, full_name, is_admin, is_founder, is_banned')
        .ilike('username', cleanUsername)
        .maybeSingle();

      if (prof) {
        targetProfile = prof;
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(prof.id);
        targetAuthUser = userData?.user;
      }
    }

    // If user does not exist
    if (!targetProfile || !targetAuthUser) {
      return NextResponse.json(
        { error: 'No Onyx account found with that email or username.' },
        { status: 404 }
      );
    }

    if (targetProfile.is_banned) {
      return NextResponse.json(
        { error: 'This account has been suspended. Please contact support.' },
        { status: 403 }
      );
    }

    // Generate secure single-use 30-minute crypto token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    // Invalidate any existing unused reset tokens for this user
    await supabaseAdmin
      .from('password_reset_tokens')
      .update({ is_used: true })
      .eq('user_id', targetProfile.id)
      .eq('is_used', false);

    // Insert new reset token
    const { error: insertErr } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert({
        user_id: targetProfile.id,
        token,
        expires_at: expiresAt,
        is_used: false,
      });

    if (insertErr) {
      console.error('Failed to create reset token:', insertErr);
      return NextResponse.json(
        { error: 'Failed to generate password reset token. Please try again.' },
        { status: 500 }
      );
    }

    // Determine host
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const resetUrl = `${protocol}://${host}/reset-password?token=${token}`;

    // Attempt Supabase built-in recovery email as well if configured
    try {
      if (targetAuthUser.email) {
        await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: targetAuthUser.email,
        });
      }
    } catch (e) {
      // Ignored if local or rate-limited
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset link generated successfully.',
      token,
      resetUrl,
      expiresAt,
      user: {
        username: targetProfile.username,
        full_name: targetProfile.full_name,
        is_admin: targetProfile.is_admin,
        is_founder: targetProfile.is_founder,
      },
    });
  } catch (err: any) {
    console.error('Forgot password error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
