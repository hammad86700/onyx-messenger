import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { hashPassword } from '@/lib/auth/passwords';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { full_name, username, email, password } = body;

    // Validation
    if (!full_name || !username || !email || !password) {
      return NextResponse.json(
        { error: 'All fields (Full Name, Username, Email, Password) are required.' },
        { status: 400 }
      );
    }

    full_name = full_name.trim();
    username = username.trim().toLowerCase().replace(/^@+/, '');
    email = email.trim().toLowerCase();

    // Validate username format
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return NextResponse.json(
        { error: 'Username must be 3-20 characters long and contain only letters, numbers, and underscores.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    // Check if username already taken
    const { data: existingUser, error: checkErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { error: `The username @${username} is already taken. Please choose another.` },
        { status: 409 }
      );
    }

    // Check if this is the first user registered in the system; if so, make them admin!
    const { count: profileCount } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    const isFirstUser = (profileCount ?? 0) === 0;

    // Securely hash password for strict cryptographic authentication
    const hashedPassword = hashPassword(password);

    // Create user via admin API with email auto-confirmed so user can log in immediately
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        username,
      },
      app_metadata: {
        password_hash: hashedPassword,
      },
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || 'Failed to create account.' },
        { status: 400 }
      );
    }

    const userId = authData.user.id;

    // Ensure app_metadata is populated
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { password_hash: hashedPassword },
    });
    const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
      full_name
    )}&backgroundColor=7c3aed,6366f1,ec4899`;

    // Insert into profiles table
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        username,
        full_name,
        avatar_url: avatarUrl,
        is_admin: isFirstUser,
      });

    if (profileError) {
      console.error('Error inserting profile:', profileError);
      // Clean up auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: 'Failed to initialize user profile.' },
        { status: 500 }
      );
    }

    // Establish session cookies and return verified session tokens
    const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            pendingCookies.push({ name, value, options });
          },
          remove(name: string, options: CookieOptions) {
            pendingCookies.push({ name, value: '', options });
          },
        },
      }
    );

    const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    let verifiedSession: any = null;
    if (linkData?.properties?.hashed_token) {
      const { data: verifyData } = await supabase.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: 'magiclink',
      });
      verifiedSession = verifyData?.session || null;
    }

    const userProfile = {
      id: userId,
      username,
      full_name,
      avatar_url: avatarUrl,
      is_admin: isFirstUser,
      is_founder: isFirstUser || username === 'hammad2006' || username === 'not_urs_hammi',
      created_at: new Date().toISOString(),
    };

    const res = NextResponse.json({
      success: true,
      message: 'Account created successfully!',
      user: {
        id: userId,
        username,
        full_name,
        email,
        is_admin: isFirstUser,
      },
      profile: userProfile,
      session: verifiedSession,
    });

    for (const c of pendingCookies) {
      res.cookies.set({ name: c.name, value: c.value, ...c.options });
    }

    return res;
  } catch (err: any) {
    console.error('Registration API error:', err);
    return NextResponse.json(
      { error: err.message || 'An unexpected error occurred during registration.' },
      { status: 500 }
    );
  }
}
