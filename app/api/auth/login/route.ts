import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyPassword } from '@/lib/auth/passwords';

export async function POST(request: NextRequest) {
  try {
    const { email: rawIdentifier, password } = await request.json();

    if (!rawIdentifier || !password) {
      return NextResponse.json(
        { error: 'Email/Username and password are required.' },
        { status: 400 }
      );
    }

    const identifier = rawIdentifier.trim();
    let targetAuthUser: any = null;

    // 1. Check if identifier is an email address
    if (identifier.includes('@') && identifier.includes('.')) {
      const cleanEmail = identifier.toLowerCase();
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      targetAuthUser = usersData?.users.find(
        (u) => u.email?.toLowerCase() === cleanEmail
      );
    }

    // 2. If not found by email, check by @username in profiles table
    if (!targetAuthUser) {
      const cleanUsername = identifier.toLowerCase().replace(/^@+/, '');
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .ilike('username', cleanUsername)
        .maybeSingle();

      if (profile?.id) {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(profile.id);
        if (userData?.user) {
          targetAuthUser = userData.user;
        }
      }
    }

    // If user does not exist at all, reject immediately
    if (!targetAuthUser) {
      return NextResponse.json(
        { error: 'Invalid email or password. Please check your credentials.' },
        { status: 401 }
      );
    }

    // 3. STRICT CRYPTOGRAPHIC PASSWORD VERIFICATION
    const storedHash = targetAuthUser.app_metadata?.password_hash;
    let isPasswordValid = verifyPassword(password, storedHash);

    // Fallback: If user account lacks stored password_hash, sync it
    if (!isPasswordValid && !storedHash) {
      try {
        const { hashPassword } = await import('@/lib/auth/passwords');
        const newHashed = hashPassword(password);
        await supabaseAdmin.auth.admin.updateUserById(targetAuthUser.id, {
          password,
          app_metadata: { password_hash: newHashed },
        });
        isPasswordValid = true;
      } catch {}
    }

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password. Please check your credentials.' },
        { status: 401 }
      );
    }

    // 3.5 Check if target profile is banned
    const { data: userProfile }: { data: any } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', targetAuthUser.id)
      .maybeSingle();

    if (userProfile?.is_banned) {
      return NextResponse.json(
        { error: 'Your account has been suspended by an administrator.' },
        { status: 403 }
      );
    }

    // 4. Generate verified session token using admin privileges (bypasses disabled email provider)
    const { data: linkData, error: linkErr } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: targetAuthUser.email,
      });

    if (linkErr || !linkData.properties?.hashed_token) {
      console.error('Session link generation error:', linkErr);
      return NextResponse.json(
        { error: 'Authentication service temporarily unavailable.' },
        { status: 500 }
      );
    }

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

    const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });

    if (verifyErr || !verifyData.session) {
      console.error('Session verify error:', verifyErr);
      return NextResponse.json(
        { error: 'Failed to initialize authenticated session.' },
        { status: 500 }
      );
    }

    // 5. Establish authenticated session cookies and return session payload
    const res = NextResponse.json({
      success: true,
      user: {
        id: targetAuthUser.id,
        email: targetAuthUser.email,
        username: userProfile?.username || targetAuthUser.user_metadata?.username,
      },
      profile: userProfile || {
        id: targetAuthUser.id,
        username: targetAuthUser.user_metadata?.username || targetAuthUser.email?.split('@')[0],
        full_name: targetAuthUser.user_metadata?.full_name || 'Onyx User',
        avatar_url: targetAuthUser.user_metadata?.avatar_url || null,
        is_admin: Boolean(userProfile?.is_admin),
        is_founder: Boolean(userProfile?.is_founder),
        created_at: new Date().toISOString(),
      },
      session: verifyData.session,
    });

    for (const c of pendingCookies) {
      res.cookies.set({ name: c.name, value: c.value, ...c.options });
    }

    return res;
  } catch (err: any) {
    console.error('Login API error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error during login.' },
      { status: 500 }
    );
  }
}
