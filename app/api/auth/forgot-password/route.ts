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

    // Invalidate any existing unused pending requests for this user
    await supabaseAdmin
      .from('password_reset_tokens')
      .update({ is_used: true })
      .eq('user_id', targetProfile.id)
      .eq('is_used', false);

    // Generate secure pending request token (prefixed with req_ so it cannot be used directly as a reset token)
    const requestToken = `req_${crypto.randomBytes(16).toString('hex')}`;
    const requestId = `OX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours

    const { error: insertErr } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert({
        user_id: targetProfile.id,
        token: requestToken,
        expires_at: expiresAt,
        is_used: false,
      });

    if (insertErr) {
      console.error('Failed to log password reset request:', insertErr);
      return NextResponse.json(
        { error: 'Failed to record password reset request. Please try again.' },
        { status: 500 }
      );
    }

    // Pre-filled WhatsApp message for Admin Hammad
    const adminPhone = '923242779514';
    const waText = `Assalam o Alaikum / Hello Admin Hammad,

I requested a password reset for my Onyx Messenger account:
• Username: @${targetProfile.username}
• Full Name: ${targetProfile.full_name}
• Request Ref: ${requestId}

Please verify my account and send me a secure single-use recovery link. Thank you!`;

    const whatsappUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(waText)}`;
    const instagramUrl = 'https://instagram.com/not_urs_hammi';

    return NextResponse.json({
      success: true,
      message: 'Password reset request submitted successfully to Admin.',
      requestId,
      user: {
        username: targetProfile.username,
        full_name: targetProfile.full_name,
        is_admin: targetProfile.is_admin,
        is_founder: targetProfile.is_founder,
      },
      whatsappUrl,
      instagramUrl,
    });
  } catch (err: any) {
    console.error('Forgot password error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
