const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*');
  console.log('Profiles in DB:', profiles);
  console.log('Profiles Error:', error);

  const { data: usersData, error: authErr } = await supabase.auth.admin.listUsers();
  console.log('Auth Users:', usersData?.users?.map(u => ({ id: u.id, email: u.email })));
  console.log('Auth Error:', authErr);
}

check().catch(console.error);
