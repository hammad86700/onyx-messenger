import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

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
    const { subscription } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json({ error: 'Invalid push subscription payload' }, { status: 400 });
    }

    // Fetch user current metadata
    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(user.id);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentMeta = userData.user.user_metadata || {};
    const existingSubs: any[] = currentMeta.push_subscriptions || [];

    // Deduplicate by endpoint
    const updatedSubs = [
      ...existingSubs.filter((s) => s.endpoint !== subscription.endpoint),
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        device: request.headers.get('user-agent') || 'Unknown Device',
        updated_at: new Date().toISOString(),
      },
    ];

    // Save updated subscriptions in user_metadata
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...currentMeta,
        push_subscriptions: updatedSubs,
      },
    });

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true, count: updatedSubs.length });
  } catch (err: any) {
    console.error('Save push subscription error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint is required' }, { status: 400 });
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(user.id);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentMeta = userData.user.user_metadata || {};
    const existingSubs: any[] = currentMeta.push_subscriptions || [];
    const filteredSubs = existingSubs.filter((s) => s.endpoint !== endpoint);

    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...currentMeta,
        push_subscriptions: filteredSubs,
      },
    });

    return NextResponse.json({ success: true, count: filteredSubs.length });
  } catch (err: any) {
    console.error('Delete push subscription error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
