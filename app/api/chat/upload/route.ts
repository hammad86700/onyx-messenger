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
      return NextResponse.json({ error: 'Unauthorized: Please log in' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const conversationId = formData.get('conversation_id') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!conversationId) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
    }

    // Determine clean file path and exact media_type
    const originalName = file.name || 'attachment';
    const cleanName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${conversationId}/${Date.now()}_${cleanName}`;

    const mimeType = file.type?.toLowerCase() || '';
    const extension = originalName.split('.').pop()?.toLowerCase() || '';

    let mediaType: 'image' | 'pdf' | 'file' | 'voice' = 'file';
    if (mimeType.startsWith('audio/') || ['webm', 'mp3', 'wav', 'ogg', 'm4a'].includes(extension) || originalName.includes('voice_note')) {
      mediaType = 'voice';
    } else if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension)) {
      mediaType = 'image';
    } else if (mimeType === 'application/pdf' || extension === 'pdf') {
      mediaType = 'pdf';
    }

    // Convert file to Buffer for reliable server-side upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Ensure explicit audio/media contentType for smooth streaming from Supabase
    let effectiveContentType = file.type;
    if (!effectiveContentType || effectiveContentType === 'application/octet-stream') {
      if (mediaType === 'voice') {
        effectiveContentType = extension === 'mp3' ? 'audio/mpeg' : extension === 'ogg' ? 'audio/ogg' : extension === 'wav' ? 'audio/wav' : 'audio/webm';
      } else if (mediaType === 'image') {
        effectiveContentType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
      } else if (mediaType === 'pdf') {
        effectiveContentType = 'application/pdf';
      } else {
        effectiveContentType = 'application/octet-stream';
      }
    }

    // Upload directly to 'chat-attachments' bucket
    const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
      .from('chat-attachments')
      .upload(filePath, buffer, {
        contentType: effectiveContentType,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadErr) {
      console.error('Storage upload error in /api/chat/upload:', uploadErr);
      return NextResponse.json(
        { error: uploadErr.message || 'Failed to upload attachment to storage' },
        { status: 500 }
      );
    }

    // Retrieve public URL from bucket
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('chat-attachments')
      .getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      public_url: publicUrlData.publicUrl,
      media_type: mediaType,
      file_name: originalName,
      file_size: file.size,
    });
  } catch (err: any) {
    console.error('Upload API route error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error during upload' },
      { status: 500 }
    );
  }
}
