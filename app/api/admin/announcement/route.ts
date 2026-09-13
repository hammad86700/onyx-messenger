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

    // Verify admin
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, full_name')
      .eq('id', user.id)
      .single();

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { message, type = 'emergency' } = await request.json();

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    const payload = {
      id: `announce-${Date.now()}`,
      message: message.trim(),
      type,
      created_by: adminProfile.full_name || 'Super Admin',
      created_at: new Date().toISOString(),
    };

    // Broadcast across global Supabase realtime channel 'system-announcements'
    const channel = supabaseAdmin.channel('system-announcements');
    await channel.send({
      type: 'broadcast',
      event: 'global_banner',
      payload,
    });

    return NextResponse.json({ success: true, announcement: payload });
  } catch (err: any) {
    console.error('Publish announcement error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
