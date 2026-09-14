export interface Profile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  is_admin: boolean;
  is_founder?: boolean;
  created_at: string;
  status_emoji?: string | null;
  status_text?: string | null;
  bio?: string | null;
  custom_status?: string | null;
  is_banned?: boolean;
  last_seen?: string | null;
}

export function isFounder(user?: { is_founder?: boolean; username?: string } | null): boolean {
  if (!user) return false;
  const uname = user.username?.toLowerCase().replace(/^@+/, '');
  return Boolean(
    user.is_founder ||
    uname === 'hammad2006' ||
    uname === 'not_urs_hammi'
  );
}

export type OnyxTheme = 'onyx-pure' | 'midnight-violet' | 'emerald-stealth' | 'sunset-horizon';

export interface Conversation {
  id: string;
  type: 'direct' | 'group' | 'saved';
  name: string | null;
  avatar_url: string | null;
  created_by: string | null;
  updated_at: string;
  // Augmented client-side fields
  participants?: ConversationParticipantWithProfile[];
  last_message?: Message | null;
  unread_count?: number;
  is_pinned?: boolean;
  is_request?: boolean;
  is_incoming_request?: boolean;
  is_outgoing_request?: boolean;
  request_status?: 'pending' | 'accepted' | 'declined';
}

export interface ConversationParticipant {
  conversation_id: string;
  user_id: string;
  is_group_admin: boolean;
  joined_at: string;
  is_pinned?: boolean;
  last_read_at?: string | null;
}

export interface ConversationParticipantWithProfile extends ConversationParticipant {
  profile: Profile;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  user_ids: string[];
  has_reacted: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  media_type: 'text' | 'image' | 'pdf' | 'file' | 'voice';
  is_read: boolean;
  created_at: string;
  reply_to_id?: string | null;
  reply_to?: Message | null;
  is_edited?: boolean;
  is_deleted?: boolean;
  deleted_for_me?: boolean;
  file_name?: string | null;
  file_size?: number | null;
  view_once_viewed?: boolean | null;
  is_view_once?: boolean;
  reactions?: MessageReactionSummary[];
  is_starred?: boolean;
  // Augmented sender profile & Optimistic UI fields
  sender?: Profile;
  status?: 'sending' | 'sent' | 'error';
  temp_id?: string;
}

export interface StarredMessage {
  id: string;
  user_id: string;
  message_id: string;
  created_at: string;
  message?: Message;
}

export interface PasswordResetToken {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  is_used: boolean;
  created_at: string;
}

export interface GlobalAnnouncement {
  id: string;
  message: string;
  type?: 'info' | 'warning' | 'emergency';
  created_by: string;
  created_at: string;
}
