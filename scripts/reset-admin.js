/**
 * Onyx Admin Emergency Password Reset CLI Tool
 *
 * Usage:
 *   node scripts/reset-admin.js [email_or_username] [new_password]
 *
 * Examples:
 *   npm run reset-admin
 *   npm run reset-admin myNewPassword123
 *   node scripts/reset-admin.js hammad2006 newPass@2026
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// 1. Read .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ Error: .env.local file not found at:', envPath);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');

function getEnvVal(key) {
  const match = envContent.match(new RegExp(`${key}=["']?([^"'\r\n]+)["']?`));
  return match ? match[1].trim() : null;
}

const supabaseUrl = getEnvVal('NEXT_PUBLIC_SUPABASE_URL');
const serviceRoleKey = getEnvVal('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Password hashing implementation matching lib/auth/passwords.ts
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function handleSupabaseAuthError(err, serviceRoleKey) {
  const errMsg = err?.message || String(err);
  if (errMsg.includes('Unregistered API key') || err?.status === 401) {
    console.error('\n❌ SUPABASE CONFIGURATION ERROR: Invalid SUPABASE_SERVICE_ROLE_KEY');
    console.error('=============================================================');
    console.error(`Current key in .env.local: "${serviceRoleKey}"`);
    console.error('\nThis key is not registered in your Supabase project (dzkgtonubjwzqbebimky).');
    console.error('In Supabase, the "service_role" secret key is a JWT token starting with "eyJhbGciOiJIUzI1Ni...".');
    console.error('\n👉 HOW TO FIX IN 1 MINUTE:');
    console.error('   1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/dzkgtonubjwzqbebimky');
    console.error('   2. Go to: Project Settings (gear icon at bottom left) ➔ API');
    console.error('   3. In "Project API keys", find "service_role" (secret)');
    console.error('   4. Click "Reveal" and copy the token (it begins with eyJhbGciOi...)');
    console.error('   5. Replace SUPABASE_SERVICE_ROLE_KEY in .env.local and in Vercel Project Settings!');
    console.error('=============================================================\n');
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let targetIdentifier = 'hammad2006';
  let newPassword = 'OnyxAdmin@2026!';

  if (args.length === 1) {
    if (emailRegex.test(args[0]) || ['hammad2006', 'admin'].includes(args[0].toLowerCase())) {
      targetIdentifier = args[0];
      newPassword = 'OnyxAdmin@2026!';
    } else {
      // It's the password passed in by the user
      targetIdentifier = 'hammad2006';
      newPassword = args[0];
    }
  } else if (args.length >= 2) {
    targetIdentifier = args[0];
    newPassword = args[1];
  }

  console.log('\n========================================');
  console.log('   👑 ONYX ADMIN RECOVERY CLI TOOL');
  console.log('========================================\n');
  console.log(`🔍 Searching for admin/founder account: "${targetIdentifier}"...`);

  let targetProfile = null;
  let targetAuthUser = null;

  // Search in profiles
  const isEmail = emailRegex.test(targetIdentifier);

  if (isEmail) {
    const { data: usersData, error: usersErr } = await supabaseAdmin.auth.admin.listUsers();
    if (usersErr) {
      handleSupabaseAuthError(usersErr, serviceRoleKey);
    }
    targetAuthUser = usersData?.users.find(
      (u) => u.email?.toLowerCase() === targetIdentifier.toLowerCase()
    );

    if (targetAuthUser) {
      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', targetAuthUser.id)
        .maybeSingle();
      targetProfile = prof;
    }
  } else {
    const cleanUsername = targetIdentifier.toLowerCase().replace(/^@+/, '');
    const { data: prof, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .ilike('username', cleanUsername)
      .maybeSingle();

    if (profErr) {
      handleSupabaseAuthError(profErr, serviceRoleKey);
    }

    if (prof) {
      targetProfile = prof;
      const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(prof.id);
      if (userErr) {
        handleSupabaseAuthError(userErr, serviceRoleKey);
      }
      targetAuthUser = userData?.user;
    }
  }

  // Fallback: If not found, list all admin/founder profiles to let user pick
  if (!targetProfile || !targetAuthUser) {
    console.log(`⚠️ User "${targetIdentifier}" not found. Searching for any registered admin...`);
    const { data: admins, error: adminErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .or('is_admin.eq.true,is_founder.eq.true');

    if (adminErr) {
      handleSupabaseAuthError(adminErr, serviceRoleKey);
    }

    if (admins && admins.length > 0) {
      targetProfile = admins[0];
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(targetProfile.id);
      targetAuthUser = userData?.user;
      console.log(`👉 Selected admin account: @${targetProfile.username} (${targetProfile.full_name})`);
    } else {
      // Auto-create admin account
      console.log(`\n🚀 No existing admin found. Auto-creating Founder & Super-Admin account now...`);
      const cleanUsername = isEmail ? 'hammad2006' : targetIdentifier.toLowerCase().replace(/^@+/, '');
      const email = isEmail ? targetIdentifier.toLowerCase() : 'hammad86700@gmail.com';
      const fullName = 'M Hammad';
      const newHashedPassword = hashPassword(newPassword);

      const { data: newAuthData, error: createAuthErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: newPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName, username: cleanUsername },
        app_metadata: { password_hash: newHashedPassword },
      });

      if (createAuthErr) {
        handleSupabaseAuthError(createAuthErr, serviceRoleKey);
      }

      if (newAuthData?.user) {
        targetAuthUser = newAuthData.user;
        const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(fullName)}&backgroundColor=7c3aed,6366f1,ec4899`;

        const { data: prof, error: profErr } = await supabaseAdmin
          .from('profiles')
          .upsert({
            id: targetAuthUser.id,
            username: cleanUsername,
            full_name: fullName,
            avatar_url: avatarUrl,
            is_admin: true,
            is_founder: true,
          })
          .select()
          .single();

        if (profErr) {
          console.error('❌ Failed to create profile record:', profErr.message);
          process.exit(1);
        }
        targetProfile = prof;
        console.log(`🎉 Successfully created Admin account: @${cleanUsername} (${email})!`);
      }
    }
  }

  if (!targetProfile || !targetAuthUser) {
    console.error('❌ Could not locate or create admin account.');
    process.exit(1);
  }

  console.log(`\n✅ Found Account:`);
  console.log(`   - Name: ${targetProfile.full_name}`);
  console.log(`   - Username: @${targetProfile.username}`);
  console.log(`   - Email: ${targetAuthUser.email || 'N/A'}`);
  console.log(`   - Founder Status: ${targetProfile.is_founder ? '👑 Founder' : 'No'}`);
  console.log(`   - Admin Status: ${targetProfile.is_admin ? '🛡️ Super Admin' : 'User'}`);

  console.log(`\n🔐 Updating password to: "${newPassword}"...`);

  const newHashedPassword = hashPassword(newPassword);

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
    targetProfile.id,
    {
      password: newPassword,
      app_metadata: {
        password_hash: newHashedPassword,
        password_updated_at: new Date().toISOString(),
        cli_reset_at: new Date().toISOString(),
      },
    }
  );

  if (updateErr) {
    console.error('❌ Failed to update password:', updateErr.message);
    process.exit(1);
  }

  // Invalidate any active reset tokens
  await supabaseAdmin
    .from('password_reset_tokens')
    .update({ is_used: true })
    .eq('user_id', targetProfile.id)
    .eq('is_used', false);

  console.log('\n========================================');
  console.log('🎉 SUCCESS! Password reset complete.');
  console.log('========================================');
  console.log(`\n📋 Login Credentials for Onyx:`);
  console.log(`   • Email or Username: ${targetAuthUser.email || targetProfile.username}`);
  console.log(`   • New Password: ${newPassword}`);
  console.log(`   • URL: http://localhost:3000/login\n`);
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
