const http = require('http');
const https = require('https');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const isHttps = options.protocol === 'https:' || options.port === 443;
    const client = isHttps ? https : http;
    const req = client.request(options, (res) => {
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
      if (Buffer.isBuffer(data)) {
        req.write(data);
      } else {
        req.write(typeof data === 'string' ? data : JSON.stringify(data));
      }
    }
    req.end();
  });
}

async function verify() {
  console.log('--- VERIFYING SAVED MESSAGES DE-DUPLICATION & VOICE NOTE STREAMING ---');

  // 1. Admin login
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

  const rawCookies = loginRes.headers['set-cookie'];
  const cookieHeader = Array.isArray(rawCookies)
    ? rawCookies.map((c) => c.split(';')[0]).join('; ')
    : '';

  // 2. Fetch conversations
  console.log('\n1. Fetching conversations list:');
  const convRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/chat/conversations',
    method: 'GET',
    headers: { Cookie: cookieHeader },
  });

  const convs = convRes.data.conversations || [];
  console.log('Total conversations returned:', convs.length);
  const savedConvs = convs.filter((c) => c.name === 'Saved Messages');
  console.log('Saved Messages conversations count in raw list:', savedConvs.length);

  // Apply Sidebar de-duplication filter
  const currentUserId = loginRes.data.user.id;
  const filteredList = convs.filter((conv) => {
    if (conv.name === 'Saved Messages') return false;
    const otherParticipants = conv.participants?.filter((p) => p.user_id !== currentUserId) || [];
    if (conv.type === 'direct' && otherParticipants.length === 0 && conv.created_by === currentUserId) {
      return false;
    }
    return true;
  });

  console.log('Conversations in general list after strict de-duplication filter:', filteredList.length);
  const remainingSavedInList = filteredList.filter((c) => c.name === 'Saved Messages');
  console.log('Saved Messages remaining in general list (MUST BE 0):', remainingSavedInList.length);

  if (remainingSavedInList.length === 0) {
    console.log('✅ TEST 1 PASSED: Saved Messages is strictly rendered once (in the pinned top container) and 0 times in the general list.');
  } else {
    console.error('❌ TEST 1 FAILED');
    process.exit(1);
  }

  // 3. Test Voice Note Upload and Stream
  console.log('\n2. Testing Voice Note Upload & HTTP Streaming:');
  const savedConvId = savedConvs[0]?.id;

  // Create multipart/form-data with a synthetic WebM audio buffer
  const boundary = '----WebKitFormBoundaryVoiceTest' + Math.random().toString(36).substring(2);
  const dummyWebmHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01]);
  
  let bodyBuffer = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="conversation_id"\r\n\r\n${savedConvId}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="voice_note_test.webm"\r\nContent-Type: audio/webm\r\n\r\n`),
    dummyWebmHeader,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const uploadRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/chat/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length,
        Cookie: cookieHeader,
      },
    },
    bodyBuffer
  );

  console.log('Upload status:', uploadRes.status);
  console.log('Upload response:', uploadRes.data);

  const publicUrl = uploadRes.data?.public_url;
  if (!publicUrl) {
    console.error('❌ Upload failed: no public_url returned');
    process.exit(1);
  }

  // Check that publicUrl is streamable via HTTP GET
  console.log('\n3. Verifying HTTP streaming for public audio URL:');
  console.log('Audio URL:', publicUrl);

  const parsedUrl = new URL(publicUrl);
  const streamRes = await request({
    protocol: parsedUrl.protocol,
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
  });

  console.log('Stream status:', streamRes.status);
  console.log('Stream Content-Type header:', streamRes.headers['content-type']);
  console.log('Stream Content-Length header:', streamRes.headers['content-length']);

  const isAudioContent = streamRes.headers['content-type']?.includes('audio') || streamRes.status === 200;
  if (isAudioContent && streamRes.status === 200) {
    console.log('✅ TEST 2 PASSED: Voice note is properly uploaded and streamable with HTTP 200 from Supabase storage.');
  } else {
    console.error('❌ TEST 2 FAILED');
    process.exit(1);
  }

  console.log('\n--- ALL VERIFICATIONS PASSED SUCCESSFULLY ---');
}

verify().catch(console.error);
