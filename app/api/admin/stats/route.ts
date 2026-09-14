import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // 1. Total Registered Profiles
    const { count: usersCount } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    // 2. Total Conversations
    const { count: convsCount } = await supabaseAdmin
      .from('conversations')
      .select('id', { count: 'exact', head: true });

    // 3. Total Messages
    const { count: msgsCount } = await supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true });

    // 4. Storage Files count in 'chat-attachments'
    let filesCount = 0;
    try {
      const { data: storageFiles } = await supabaseAdmin.storage
        .from('chat-attachments')
        .list('', { limit: 100 });

      filesCount = storageFiles?.length || 0;
    } catch {
      filesCount = 0;
    }

    return NextResponse.json({
      success: true,
      stats: {
        users: usersCount || 0,
        conversations: convsCount || 0,
        messages: msgsCount || 0,
        storage_files: filesCount,
      },
    });
  } catch (err: any) {
    console.error('Admin stats error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
