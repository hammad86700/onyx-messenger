import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashPassword } from '@/lib/auth/passwords';

export async function POST(request: NextRequest) {
  try {
    const { token, new_password } = await request.json();

    if (!token || !new_password) {
      return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 });
    }

    if (new_password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // 1. Verify single-use reset token (must not be a pending request ref)
    if (typeof token !== 'string' || token.startsWith('req_')) {
      return NextResponse.json(
        { error: 'Invalid reset token. Password reset tokens must be issued by the Administrator.' },
        { status: 400 }
      );
    }

    const { data: tokenRecord, error: tokenErr } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('id, user_id, expires_at, is_used')
      .eq('token', token)
      .maybeSingle();

    if (tokenErr || !tokenRecord) {
      return NextResponse.json({ error: 'Invalid or non-existent token' }, { status: 400 });
    }

    if (tokenRecord.is_used) {
      return NextResponse.json(
        { error: 'This reset token has already been used. Please request a new link.' },
        { status: 400 }
      );
    }

    if (new Date() > new Date(tokenRecord.expires_at)) {
      return NextResponse.json(
        { error: 'This reset token has expired (limit 30 minutes). Please request a new link.' },
        { status: 400 }
      );
    }

    // 2. Hash new password for strict authentication
    const newHashedPassword = hashPassword(new_password);

    // 3. Update user password in auth and overwrite app_metadata password_hash
    // This immediately invalidates the old password across all login attempts
    const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(
      tokenRecord.user_id,
      {
        password: new_password,
        app_metadata: {
          password_hash: newHashedPassword,
          password_updated_at: new Date().toISOString(),
        },
      }
    );

    if (updateAuthErr) {
      console.error('Failed to update auth password:', updateAuthErr);
      return NextResponse.json(
        { error: updateAuthErr.message || 'Failed to update password' },
        { status: 500 }
      );
    }

    // 4. Invalidate token so it can NEVER be reused
    const { error: markErr } = await supabaseAdmin
      .from('password_reset_tokens')
      .update({ is_used: true })
      .eq('id', tokenRecord.id);

    if (markErr) {
      console.error('Failed to mark token as used:', markErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Password has been updated successfully! Your old password is now deactivated. You can now log in with your new password.',
    });
  } catch (err: any) {
    console.error('Reset password error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
