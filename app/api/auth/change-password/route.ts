import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashPassword, verifyPassword } from '@/lib/auth/passwords';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Please log in to change your password.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { current_password, new_password } = body;

    if (!current_password || !new_password) {
      return NextResponse.json(
        { error: 'Both current password and new password are required.' },
        { status: 400 }
      );
    }

    if (new_password.length < 6) {
      return NextResponse.json(
        { error: 'New password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    if (current_password === new_password) {
      return NextResponse.json(
        { error: 'New password must be different from your current password.' },
        { status: 400 }
      );
    }

    // 1. Verify current password
    let targetAuthUser = user;
    try {
      const { data: adminUserData } = await supabaseAdmin.auth.admin.getUserById(user.id);
      if (adminUserData?.user) {
        targetAuthUser = adminUserData.user;
      }
    } catch {
      // If service role has issues, proceed with session user
    }

    const storedHash = targetAuthUser.app_metadata?.password_hash;
    let isCurrentPasswordValid = verifyPassword(current_password, storedHash);

    // Fallback verification: attempt signInWithPassword using user email if available
    if (!isCurrentPasswordValid && user.email) {
      try {
        const { createClient: createAnonClient } = await import('@supabase/supabase-js');
        const anonClient = createAnonClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
          email: user.email,
          password: current_password,
        });
        if (!signInErr && signInData?.user) {
          isCurrentPasswordValid = true;
        }
      } catch {}
    }

    // If still not valid and no storedHash exists yet (legacy account), allow update
    if (!isCurrentPasswordValid && !storedHash) {
      isCurrentPasswordValid = true;
    }

    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { error: 'The current password you entered is incorrect. Please try again.' },
        { status: 400 }
      );
    }

    // 2. Compute new scrypt hash
    const newHashedPassword = hashPassword(new_password);

    // 3. Update password in Supabase Auth
    let updated = false;

    // Try admin update first
    try {
      const { error: adminUpdateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: new_password,
        app_metadata: {
          password_hash: newHashedPassword,
          password_updated_at: new Date().toISOString(),
        },
      });

      if (!adminUpdateErr) {
        updated = true;
      } else {
        console.warn('Admin password update note:', adminUpdateErr.message);
      }
    } catch (e) {
      console.warn('Admin update threw:', e);
    }

    // If admin update didn't work (e.g. service role key issue), use user's session client
    if (!updated) {
      const { error: userUpdateErr } = await supabase.auth.updateUser({
        password: new_password,
        data: {
          password_hash: newHashedPassword,
          password_updated_at: new Date().toISOString(),
        },
      });

      if (userUpdateErr) {
        console.error('Session user password update error:', userUpdateErr);
        return NextResponse.json(
          { error: userUpdateErr.message || 'Failed to update password.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Your password has been changed successfully! Please use your new password next time you log in.',
    });
  } catch (err: any) {
    console.error('Change password API error:', err);
    return NextResponse.json(
      { error: err.message || 'An unexpected error occurred while updating your password.' },
      { status: 500 }
    );
  }
}
