const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testValidInsert() {
  const { data: msg } = await supabase.from('messages').select('id').limit(1).single();
  if (msg) {
    const { data, error } = await supabase
      .from('starred_messages')
      .insert({
        user_id: '332a903c-521f-48a4-ba9d-80bb205ef799',
        message_id: msg.id,
      })
      .select();
    console.log('Insert result:', { data, error });
    if (data?.[0]?.id) {
      await supabase.from('starred_messages').delete().eq('id', data[0].id);
    }
  }
}

testValidInsert().catch(console.error);
