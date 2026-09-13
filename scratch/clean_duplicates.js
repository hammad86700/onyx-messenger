const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function clean() {
  const { data: convs } = await supabase
    .from('conversations')
    .select('id, name, type, created_by, updated_at');
  console.log('Current conversations in DB:', convs);
}

clean().catch(console.error);
