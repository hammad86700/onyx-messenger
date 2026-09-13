import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ valid: false, reason: 'Missing token' }, { status: 400 });
    }

    const { data: tokenRecord, error } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('id, user_id, expires_at, is_used')
      .eq('token', token)
      .maybeSingle();

    if (error || !tokenRecord) {
      return NextResponse.json({ valid: false, reason: 'Invalid or unknown token' });
    }

    if (tokenRecord.is_used) {
      return NextResponse.json({ valid: false, reason: 'This reset link has already been used' });
    }

    const now = new Date();
    const expiresAt = new Date(tokenRecord.expires_at);

    if (now > expiresAt) {
      return NextResponse.json({ valid: false, reason: 'This reset link has expired (30-minute limit)' });
    }

    // Fetch user details for display
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('username, full_name, avatar_url')
      .eq('id', tokenRecord.user_id)
      .single();

    return NextResponse.json({
      valid: true,
      user: profile || { username: 'user', full_name: 'User' },
      expiresAt: tokenRecord.expires_at,
    });
  } catch (err: any) {
    console.error('Validate reset token error:', err);
    return NextResponse.json({ valid: false, reason: 'Server error' }, { status: 500 });
  }
}
