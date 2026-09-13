const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, is_admin, is_banned');
  console.log('Profiles in DB:', profiles);

  // Set admin user is_admin = true if not already
  const adminUser = profiles?.find((p) => p.username === 'admin');
  if (adminUser && !adminUser.is_admin) {
    const { error: updErr } = await supabase
      .from('profiles')
      .update({ is_admin: true })
      .eq('id', adminUser.id);
    console.log('Updated admin user is_admin:', updErr ? updErr : 'SUCCESS');
  }
}

check().catch(console.error);
