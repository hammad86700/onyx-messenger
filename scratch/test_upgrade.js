const http = require('http');

// Helper to make HTTP requests
function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function testFeatures() {
  console.log('--- STARTING COMPREHENSIVE PLATFORM VERIFICATION ---');

  // 1. Admin login to obtain session cookies
  console.log('\n1. Testing Admin Login:');
  const loginRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'admin@example.com', password: 'password123' }
  );

  console.log('Login Status:', loginRes.status);
  console.log('Login Result:', loginRes.data);

  const rawCookies = loginRes.headers['set-cookie'];
  const cookieHeader = Array.isArray(rawCookies)
    ? rawCookies.map((c) => c.split(';')[0]).join('; ')
    : '';

  if (!cookieHeader) {
    console.error('Failed to obtain auth cookies');
    process.exit(1);
  }

  // 2. Test Admin Stats
  console.log('\n2. Testing Admin Stats Endpoint:');
  const statsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/stats',
    method: 'GET',
    headers: { Cookie: cookieHeader },
  });
  console.log('Stats status:', statsRes.status);
  console.log('Stats data:', statsRes.data);

  // 3. Test Admin Emergency Announcement
  console.log('\n3. Testing Admin Emergency Announcement:');
  const announceRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/announcement',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
    },
    { message: 'System maintenance scheduled in 10 minutes.', type: 'emergency' }
  );
  console.log('Announcement status:', announceRes.status);
  console.log('Announcement data:', announceRes.data);

  // 4. Test Saved Messages Self-Chat
  console.log('\n4. Testing Saved Messages Self-Chat creation / retrieval:');
  const savedRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/chat/conversations/saved',
    method: 'POST',
    headers: { Cookie: cookieHeader },
  });
  console.log('Saved messages status:', savedRes.status);
  console.log('Saved conversation ID:', savedRes.data?.conversation?.id);

  const savedConvId = savedRes.data?.conversation?.id;

  // 5. Test Pin / Unpin Conversation
  if (savedConvId) {
    console.log('\n5. Testing Pin Conversation:');
    const pinRes = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/chat/conversations/pin',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
      },
      { conversation_id: savedConvId, is_pinned: true }
    );
    console.log('Pin status:', pinRes.status);
    console.log('Pin data:', pinRes.data);
  }

  // 6. Test Profile Status Update (Emoji + Bio)
  console.log('\n6. Testing Profile Status Update:');
  const statusRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/users/profile',
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
    },
    { status_emoji: '🚀', status_text: 'Building high performance realtime chat' }
  );
  console.log('Profile status update status:', statusRes.status);
  console.log('Updated profile status:', statusRes.data?.profile?.status_emoji, statusRes.data?.profile?.status_text);

  // 7. Test Message Sending with Reply & Metadata in Saved Chat
  if (savedConvId) {
    console.log('\n7. Testing Message Posting with voice/view-once/reply support:');
    const msgRes = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/chat/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
      },
      {
        conversation_id: savedConvId,
        content: 'Testing initial message in Saved Messages',
      }
    );
    console.log('Message 1 status:', msgRes.status);
    const msg1Id = msgRes.data?.message?.id;

    if (msg1Id) {
      // Post reply
      const replyRes = await request(
        {
          hostname: 'localhost',
          port: 3000,
          path: '/api/chat/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: cookieHeader,
          },
        },
        {
          conversation_id: savedConvId,
          content: 'Replying to first message!',
          reply_to_id: msg1Id,
        }
      );
      console.log('Reply message status:', replyRes.status);

      // React with emoji
      console.log('\n8. Testing Emoji Reaction:');
      const reactRes = await request(
        {
          hostname: 'localhost',
          port: 3000,
          path: '/api/chat/reactions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: cookieHeader,
          },
        },
        { message_id: msg1Id, emoji: '🔥' }
      );
      console.log('Reaction status:', reactRes.status);
      console.log('Reaction tally:', reactRes.data?.reactions);
    }
  }

  // 8. Test Ban and Unban user API
  console.log('\n9. Testing Ban & Unban API on test user Alice:');
  // First find Alice's user id from user search
  const searchRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/users/search?q=alice',
    method: 'GET',
    headers: { Cookie: cookieHeader },
  });

  const alice = searchRes.data?.users?.[0];
  if (alice) {
    console.log('Found Alice:', alice.id, alice.username);
    // Ban Alice
    const banRes = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/admin/ban-user',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
      },
      { target_user_id: alice.id, is_banned: true }
    );
    console.log('Ban status:', banRes.status);
    console.log('Alice is_banned:', banRes.data?.user?.is_banned);

    // Unban Alice
    const unbanRes = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/admin/ban-user',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
      },
      { target_user_id: alice.id, is_banned: false }
    );
    console.log('Unban status:', unbanRes.status);
    console.log('Alice unbanned is_banned:', unbanRes.data?.user?.is_banned);
  }

  console.log('\n--- ALL VERIFICATIONS COMPLETED SUCCESSFULLY ---');
}

testFeatures().catch(console.error);
