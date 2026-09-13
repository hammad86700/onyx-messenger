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

async function main() {
  const args = process.argv.slice(2);
  let targetIdentifier = args[0] || 'hammad2006';
  let newPassword = args[1] || args[0];

  // If only 1 arg provided, check if it's a password or identifier
  if (args.length === 1) {
    if (args[0].includes('@') || args[0].toLowerCase() === 'hammad2006') {
      targetIdentifier = args[0];
      newPassword = 'OnyxAdmin@2026!';
    } else {
      targetIdentifier = 'hammad2006';
      newPassword = args[0];
    }
  } else if (args.length === 0) {
    targetIdentifier = 'hammad2006';
    newPassword = 'OnyxAdmin@2026!';
  }

  console.log('\n========================================');
  console.log('   👑 ONYX ADMIN RECOVERY CLI TOOL');
  console.log('========================================\n');
  console.log(`🔍 Searching for admin/founder account: "${targetIdentifier}"...`);

  let targetProfile = null;
  let targetAuthUser = null;

  // Search in profiles
  const isEmail = targetIdentifier.includes('@') && targetIdentifier.includes('.');

  if (isEmail) {
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
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

  // Fallback: If not found, list all admin/founder profiles to let user pick
  if (!targetProfile || !targetAuthUser) {
    console.log(`⚠️ User "${targetIdentifier}" not found. Searching for any registered admin...`);
    const { data: admins } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .or('is_admin.eq.true,is_founder.eq.true');

    if (admins && admins.length > 0) {
      targetProfile = admins[0];
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(targetProfile.id);
      targetAuthUser = userData?.user;
      console.log(`👉 Selected admin account: @${targetProfile.username} (${targetProfile.full_name})`);
    } else {
      console.error('❌ No admin account found in database.');
      process.exit(1);
    }
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
