const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkStarredTable() {
  const { data, error } = await supabase.from('starred_messages').select('*').limit(1);
  console.log('starred_messages table query result:', { data, error });
}

checkStarredTable().catch(console.error);
