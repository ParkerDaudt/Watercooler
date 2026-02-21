export type Role = "owner" | "moderator" | "member";
export type MemberStatus = "active" | "banned" | "timeout";
export type RSVPStatus = "going" | "interested" | "not_going";
export type JoinRequestStatus = "pending" | "approved" | "denied";
export type ReportStatus = "open" | "reviewed" | "dismissed";
export type NotificationType = "mention" | "event_update" | "event_reminder";
export type UserStatus = "online" | "away" | "dnd" | "invisible";

// WebRTC signal types (Node-safe, no DOM dependency)
export interface RTCSessionDescriptionLike {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp?: string;
}

export interface RTCIceCandidateLike {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface VoiceParticipant {
  userId: string;
  username: string;
  avatarUrl: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isVideoOn: boolean;
}

export interface VoiceChannelState {
  channelId: string;
  participants: VoiceParticipant[];
}

export interface ConnectedLinks {
  github?: string | null;
  twitter?: string | null;
  website?: string | null;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export interface UserNote {
  content: string;
  updatedAt: string;
}

export interface ActivityStats {
  messageCount: number;
  lastActiveAt: string | null;
}

export interface MutualChannel {
  id: string;
  name: string;
  type: string;
}

export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  pronouns?: string | null;
  connectedLinks?: ConnectedLinks | null;
  bio?: string | null;
  status?: UserStatus;
  customStatus?: string | null;
  createdAt: string;
}

export interface UserProfile extends User {
  membership?: {
    role: string;
    joinedAt: string;
    roles?: Array<{ id: string; name: string; color: string }>;
  } | null;
  badges?: Badge[];
  activityStats?: ActivityStats;
  mutualChannels?: MutualChannel[];
  note?: UserNote | null;
}

export interface Community {
  id: string;
  name: string;
  inviteOnly: boolean;
  requestToJoin: boolean;
  logoUrl?: string | null;
  accentColor?: string | null;
  createdAt: string;
}

export interface Membership {
  id: string;
  userId: string;
  communityId: string;
  role: Role;
  displayName: string | null;
  status: MemberStatus;
  timeoutUntil: string | null;
  joinedAt: string;
}

export interface ChannelCategory {
  id: string;
  communityId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface Channel {
  id: string;
  communityId: string | null;
  name: string;
  type: string;
  isPrivate: boolean;
  isAnnouncement?: boolean;
  categoryId?: string | null;
  sortOrder?: number;
  createdAt: string;
}

export interface Reaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  user?: Pick<User, "id" | "username" | "avatarUrl">;
}

export interface MessageSearchResult {
  id: string;
  channelId: string;
  channelName: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
}

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  replyToId?: string | null;
  replyTo?: Pick<Message, "id" | "content" | "user"> | null;
  isPinned?: boolean;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
  replyCount?: number;
  createdAt: string;
  editedAt: string | null;
  user?: Pick<User, "id" | "username" | "avatarUrl">;
  attachments?: Attachment[];
  reactions?: Reaction[];
  linkPreviews?: LinkPreview[];
}

export interface Attachment {
  id: string;
  messageId: string;
  url: string;
  filename: string;
  mime: string;
  size: number;
}

export interface Event {
  id: string;
  communityId: string;
  createdBy: string;
  title: string;
  description: string;
  locationText: string;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  creator?: Pick<User, "id" | "username">;
  rsvpCounts?: { going: number; interested: number; not_going: number };
  myRsvp?: RSVPStatus | null;
}

export interface Invite {
  id: string;
  communityId: string;
  code: string;
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface JoinRequest {
  id: string;
  communityId: string;
  userId: string;
  status: JoinRequestStatus;
  createdAt: string;
  user?: Pick<User, "id" | "username">;
}

export interface Report {
  id: string;
  communityId: string;
  channelId: string;
  messageId: string;
  reporterId: string;
  reason: string;
  status: ReportStatus;
  createdAt: string;
  reporter?: Pick<User, "id" | "username">;
  message?: Message;
}

export interface Warning {
  id: string;
  communityId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  severity: "warning" | "strike";
  createdAt: string;
  moderator?: Pick<User, "id" | "username">;
}

export interface AuditLog {
  id: string;
  communityId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actor?: Pick<User, "id" | "username">;
}

export interface Notification {
  id: string;
  userId: string;
  communityId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface RolePermissions {
  manageCommunity: boolean;
  manageRoles: boolean;
  manageChannels: boolean;
  manageMembers: boolean;
  createInvites: boolean;
  sendMessages: boolean;
  manageMessages: boolean;
  pinMessages: boolean;
  kickMembers: boolean;
  banMembers: boolean;
  timeoutMembers: boolean;
}

export interface ServerRole {
  id: string;
  communityId: string;
  name: string;
  color: string;
  position: number;
  isDefault: boolean;
  isEveryone: boolean;
  createdAt: string;
  updatedAt: string;
  permissions?: RolePermissions;
}

// Socket.IO events
export interface ServerToClientEvents {
  new_message: (message: Message) => void;
  message_updated: (message: Message) => void;
  message_deleted: (data: { channelId: string; messageId: string }) => void;
  typing: (data: { channelId: string; userId: string; username: string }) => void;
  stop_typing: (data: { channelId: string; userId: string }) => void;
  reaction_added: (data: { channelId: string; messageId: string; reaction: Reaction }) => void;
  reaction_removed: (data: { channelId: string; messageId: string; userId: string; emoji: string }) => void;
  presence_update: (data: { userId: string; status: UserStatus | "offline"; customStatus?: string }) => void;
  status_changed: (data: { userId: string; status: UserStatus; customStatus: string }) => void;
  user_banned: (data: { userId: string }) => void;
  user_timeout: (data: { userId: string; until: string }) => void;
  user_kicked: (data: { userId: string }) => void;
  channel_created: (channel: Channel) => void;
  channel_updated: (channel: Channel) => void;
  channel_deleted: (data: { channelId: string }) => void;
  notification: (notification: Notification) => void;
  message_pinned: (data: { channelId: string; messageId: string; isPinned: boolean; pinnedBy: string | null; pinnedAt: string | null }) => void;
  category_created: (category: ChannelCategory) => void;
  category_updated: (category: ChannelCategory) => void;
  category_deleted: (data: { categoryId: string }) => void;
  // Voice events
  voice_user_joined: (data: { channelId: string; participant: VoiceParticipant }) => void;
  voice_user_left: (data: { channelId: string; userId: string }) => void;
  voice_state_update: (data: { channelId: string; userId: string; isMuted: boolean; isDeafened: boolean; isVideoOn: boolean }) => void;
  voice_offer: (data: { from: string; offer: RTCSessionDescriptionLike }) => void;
  voice_answer: (data: { from: string; answer: RTCSessionDescriptionLike }) => void;
  voice_ice_candidate: (data: { from: string; candidate: RTCIceCandidateLike }) => void;
}

export interface ClientToServerEvents {
  join_channel: (channelId: string) => void;
  leave_channel: (channelId: string) => void;
  send_message: (
    data: { channelId: string; content: string; replyToId?: string; attachments?: { url: string; filename: string; mime: string; size: number }[] },
    callback: (response: { ok: boolean; message?: Message; error?: string }) => void
  ) => void;
  edit_message: (
    data: { messageId: string; content: string },
    callback: (response: { ok: boolean; error?: string }) => void
  ) => void;
  delete_message: (
    data: { messageId: string },
    callback: (response: { ok: boolean; error?: string }) => void
  ) => void;
  typing: (channelId: string) => void;
  add_reaction: (
    data: { messageId: string; emoji: string },
    callback: (response: { ok: boolean; error?: string }) => void
  ) => void;
  remove_reaction: (
    data: { messageId: string; emoji: string },
    callback: (response: { ok: boolean; error?: string }) => void
  ) => void;
  get_online_users: (
    callback: (users: Array<{ userId: string; status: string; customStatus: string }>) => void
  ) => void;
  set_status: (
    data: { status: UserStatus; customStatus?: string },
    callback: (response: { ok: boolean; error?: string }) => void
  ) => void;
  // Voice events
  voice_join: (
    channelId: string,
    callback: (response: { ok: boolean; participants?: VoiceParticipant[]; error?: string }) => void
  ) => void;
  voice_leave: (
    callback: (response: { ok: boolean; error?: string }) => void
  ) => void;
  voice_offer: (data: { to: string; offer: RTCSessionDescriptionLike }) => void;
  voice_answer: (data: { to: string; answer: RTCSessionDescriptionLike }) => void;
  voice_ice_candidate: (data: { to: string; candidate: RTCIceCandidateLike }) => void;
  voice_state_update: (
    data: { isMuted: boolean; isDeafened: boolean; isVideoOn: boolean },
    callback: (response: { ok: boolean; error?: string }) => void
  ) => void;
  get_voice_states: (
    callback: (states: VoiceChannelState[]) => void
  ) => void;
}
