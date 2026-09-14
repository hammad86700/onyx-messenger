import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { sendPushToUser } from '@/lib/web-push-server';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { recipientId, callId, type, conversationId } = body;

    if (!recipientId || !callId) {
      return NextResponse.json({ error: 'recipientId and callId are required' }, { status: 400 });
    }

    // Fetch caller profile
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('full_name, username, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    const callerName = callerProfile?.full_name || callerProfile?.username || 'Onyx User';

    // Dispatch high-priority OS Call Alert via Web Push
    await sendPushToUser(recipientId, {
      title: `📞 Incoming ${type === 'video' ? 'Video' : 'Voice'} Call`,
      body: `${callerName} is calling you on Onyx...`,
      icon: callerProfile?.avatar_url || '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'onyx-incoming-call',
      conversationId,
      type: 'call',
      isCall: true,
      callId,
      url: conversationId ? `/?conversation=${conversationId}` : '/',
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Call push notification error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
