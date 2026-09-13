const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1].trim();
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)[1].trim();

const supabaseAnon = createClient(url, anonKey);
const supabaseAdmin = createClient(url, serviceKey);

async function testAll() {
  console.log('=== 1. Testing Dual Authentication RPC ===');
  // Test valid username
  const { data: email1, error: err1 } = await supabaseAnon.rpc('get_email_by_username', {
    lookup_username: 'hammad2006',
  });
  console.log('Lookup "hammad2006":', { email1, err1 });

  // Test non-existent username
  const { data: email2, error: err2 } = await supabaseAnon.rpc('get_email_by_username', {
    lookup_username: 'non_existent_user_99999',
  });
  console.log('Lookup non-existent user:', { email2, err2 });

  console.log('\n=== 2. Testing Manifest.json ===');
  const manifestRes = await fetch('http://localhost:3000/manifest.json');
  const manifest = await manifestRes.json();
  console.log('Manifest:', {
    name: manifest.name,
    short_name: manifest.short_name,
    display: manifest.display,
    theme_color: manifest.theme_color,
    background_color: manifest.background_color,
  });

  console.log('\n=== 3. Testing Profiles Table Columns ===');
  const { data: profile, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('id, username, full_name, bio, custom_status, avatar_url, is_founder')
    .eq('username', 'hammad2006')
    .single();
  console.log('Founder Profile:', profile);

  console.log('\n=== 4. Testing Login Page Content ===');
  const loginRes = await fetch('http://localhost:3000/login');
  const loginHtml = await loginRes.text();
  console.log('Login HTML has "Username or Email":', loginHtml.includes('Username or Email'));

  console.log('\n=== Tests Complete ===');
}

testAll().catch(console.error);
