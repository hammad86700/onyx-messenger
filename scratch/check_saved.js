const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDirectSaved() {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      type: 'direct',
      name: 'Saved Messages',
    })
    .select();

  console.log('Insert direct Saved Messages result:', { data, error });

  if (data?.[0]?.id) {
    // clean up test row
    await supabase.from('conversations').delete().eq('id', data[0].id);
  }
}

testDirectSaved().catch(console.error);
