import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashPassword } from '@/lib/auth/passwords';

export async function POST(request: NextRequest) {
  try {
    const { identifier: rawIdentifier, master_key, new_password } = await request.json();

    if (!rawIdentifier || !master_key || !new_password) {
      return NextResponse.json(
        { error: 'Admin Identifier, Master Recovery Key, and New Password are all required.' },
        { status: 400 }
      );
    }

    if (new_password.length < 6) {
      return NextResponse.json(
        { error: 'New password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    // 1. Verify Master Recovery Key
    const configuredKey = process.env.ADMIN_MASTER_RECOVERY_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const isValidMasterKey =
      (configuredKey && master_key.trim() === configuredKey.trim()) ||
      (serviceRoleKey && master_key.trim() === serviceRoleKey.trim());

    if (!isValidMasterKey) {
      return NextResponse.json(
        { error: 'Invalid Master Recovery Key. Access denied.' },
        { status: 403 }
      );
    }

    const identifier = rawIdentifier.trim();
    let targetProfile: any = null;
    let targetAuthUser: any = null;

    // 2. Locate Admin user by email or username
    if (identifier.includes('@') && identifier.includes('.')) {
      const cleanEmail = identifier.toLowerCase();
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      targetAuthUser = usersData?.users.find(
        (u) => u.email?.toLowerCase() === cleanEmail
      );

      if (targetAuthUser) {
        const { data: prof } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('id', targetAuthUser.id)
          .maybeSingle();
        targetProfile = prof;
      }
    }

    if (!targetProfile) {
      const cleanUsername = identifier.toLowerCase().replace(/^@+/, '');
      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .ilike('username', cleanUsername)
        .maybeSingle();

      if (prof) {
        targetProfile = prof;
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(prof.id);
        targetAuthUser = userData?.user;
      }
    }

    if (!targetProfile || !targetAuthUser) {
      return NextResponse.json(
        { error: 'Target account not found.' },
        { status: 404 }
      );
    }

    // 3. Verify user has Admin or Founder privileges
    const isAdminOrFounder = Boolean(
      targetProfile.is_admin ||
      targetProfile.is_founder ||
      targetProfile.username?.toLowerCase() === 'hammad2006'
    );

    if (!isAdminOrFounder) {
      return NextResponse.json(
        { error: 'Emergency Master Key override is strictly restricted to Admin and Founder accounts.' },
        { status: 403 }
      );
    }

    // 4. Hash new password and update in Supabase Auth
    const newHashedPassword = hashPassword(new_password);

    const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(
      targetProfile.id,
      {
        password: new_password,
        app_metadata: {
          password_hash: newHashedPassword,
          password_updated_at: new Date().toISOString(),
          emergency_reset_at: new Date().toISOString(),
        },
      }
    );

    if (updateAuthErr) {
      console.error('Failed to update admin password:', updateAuthErr);
      return NextResponse.json(
        { error: updateAuthErr.message || 'Failed to update admin password.' },
        { status: 500 }
      );
    }

    // 5. Invalidate older reset tokens
    await supabaseAdmin
      .from('password_reset_tokens')
      .update({ is_used: true })
      .eq('user_id', targetProfile.id)
      .eq('is_used', false);

    return NextResponse.json({
      success: true,
      message: `Admin credentials successfully recovered for @${targetProfile.username}. You may now log in immediately.`,
      user: {
        username: targetProfile.username,
        full_name: targetProfile.full_name,
        is_founder: targetProfile.is_founder,
      },
    });
  } catch (err: any) {
    console.error('Admin emergency reset error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
