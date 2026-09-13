const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setFounder() {
  const { data: user } = await supabase.from('profiles').select('*').eq('username', 'hammad2006').single();
  console.log('hammad2006 user before:', user);
  if (user && !user.is_founder) {
    const { error } = await supabase.from('profiles').update({ is_founder: true }).eq('username', 'hammad2006');
    console.log('Updated is_founder for hammad2006:', error ? error : 'SUCCESS');
  }
}

setFounder().catch(console.error);
