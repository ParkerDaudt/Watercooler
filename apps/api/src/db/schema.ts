import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 32 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  recoveryKeyHash: text("recovery_key_hash"),
  tokenVersion: integer("token_version").notNull().default(0),
  bio: text("bio").default(""),
  status: varchar("status", { length: 20 }).notNull().default("online"),
  customStatus: text("custom_status").default(""),
  avatarUrl: text("avatar_url").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const communities = pgTable("communities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  inviteOnly: boolean("invite_only").notNull().default(true),
  requestToJoin: boolean("request_to_join").notNull().default(false),
  logoUrl: text("logo_url"),
  accentColor: varchar("accent_color", { length: 20 }).default("#6366f1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull().default("member"),
    displayName: varchar("display_name", { length: 64 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    timeoutUntil: timestamp("timeout_until", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCommunityIdx: index("memberships_user_community_idx").on(t.userId, t.communityId),
  })
);

export const channelCategories = pgTable(
  "channel_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    communityIdx: index("channel_categories_community_idx").on(t.communityId, t.sortOrder),
  })
);

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .references(() => communities.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    type: varchar("type", { length: 20 }).notNull().default("channel"),
    isPrivate: boolean("is_private").notNull().default(false),
    isAnnouncement: boolean("is_announcement").notNull().default(false),
    categoryId: uuid("category_id")
      .references(() => channelCategories.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    communityIdx: index("channels_community_idx").on(t.communityId),
  })
);

export const channelMembers = pgTable(
  "channel_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({
    channelIdx: index("channel_members_channel_idx").on(t.channelId),
  })
);

export const dmParticipants = pgTable(
  "dm_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({
    channelUserIdx: index("dm_participants_channel_user_idx").on(t.channelId, t.userId),
    uniqueChannelUser: unique("dm_participants_channel_user_unique").on(t.channelId, t.userId),
  })
);

export const channelReadStates = pgTable(
  "channel_read_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadMessageId: uuid("last_read_message_id")
      .references(() => messages.id, { onDelete: "set null" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    channelUserIdx: index("channel_read_states_channel_user_idx").on(t.channelId, t.userId),
  })
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    replyToId: uuid("reply_to_id"),
    isPinned: boolean("is_pinned").notNull().default(false),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    pinnedBy: uuid("pinned_by").references(() => users.id, { onDelete: "set null" }),
    replyCount: integer("reply_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    linkPreviews: jsonb("link_previews").default([]),
  },
  (t) => ({
    channelCreatedIdx: index("messages_channel_created_idx").on(t.channelId, t.createdAt),
  })
);

export const linkPreviewCache = pgTable("link_preview_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull().unique(),
  title: text("title"),
  description: text("description"),
  image: text("image"),
  siteName: text("site_name"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reactions = pgTable(
  "reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: varchar("emoji", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    messageIdx: index("reactions_message_idx").on(t.messageId),
  })
);

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mime: varchar("mime", { length: 128 }).notNull(),
  size: integer("size").notNull(),
});

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    locationText: varchar("location_text", { length: 500 }).notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    communityIdx: index("events_community_idx").on(t.communityId),
  })
);

export const eventRsvps = pgTable(
  "event_rsvps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull(),
  },
  (t) => ({
    eventIdx: index("event_rsvps_event_idx").on(t.eventId),
  })
);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 32 }).notNull().unique(),
  maxUses: integer("max_uses").notNull().default(0),
  uses: integer("uses").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const joinRequests = pgTable(
  "join_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    communityIdx: index("join_requests_community_idx").on(t.communityId),
  })
);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  reporterId: uuid("reporter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 32 }).notNull(),
    targetId: uuid("target_id").notNull(),
    metadata: jsonb("metadata_json").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    communityIdx: index("audit_logs_community_idx").on(t.communityId, t.createdAt),
  })
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    payload: jsonb("payload_json").default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("notifications_user_idx").on(t.userId, t.readAt),
  })
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    color: varchar("color", { length: 20 }).notNull().default("#99aab5"),
    position: integer("position").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    isEveryone: boolean("is_everyone").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    communityIdx: index("roles_community_idx").on(t.communityId, t.position),
  })
);

export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id")
    .primaryKey()
    .references(() => roles.id, { onDelete: "cascade" }),
  manageCommunity: boolean("manage_community").notNull().default(false),
  manageRoles: boolean("manage_roles").notNull().default(false),
  manageChannels: boolean("manage_channels").notNull().default(false),
  manageMembers: boolean("manage_members").notNull().default(false),
  createInvites: boolean("create_invites").notNull().default(false),
  sendMessages: boolean("send_messages").notNull().default(true),
  manageMessages: boolean("manage_messages").notNull().default(false),
  pinMessages: boolean("pin_messages").notNull().default(false),
  kickMembers: boolean("kick_members").notNull().default(false),
  banMembers: boolean("ban_members").notNull().default(false),
  timeoutMembers: boolean("timeout_members").notNull().default(false),
});

export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    membershipIdx: index("user_roles_membership_idx").on(t.membershipId),
    roleIdx: index("user_roles_role_idx").on(t.roleId),
    uniqueMembershipRole: unique("user_roles_membership_role_unique").on(t.membershipId, t.roleId),
  })
);

export const channelPermissionOverrides = pgTable(
  "channel_permission_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    sendMessages: boolean("send_messages"),
    manageMessages: boolean("manage_messages"),
    pinMessages: boolean("pin_messages"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    channelIdx: index("channel_overrides_channel_idx").on(t.channelId),
    uniqueChannelRole: unique("channel_overrides_channel_role_unique").on(t.channelId, t.roleId),
  })
);

export const warnings = pgTable(
  "warnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    moderatorId: uuid("moderator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    severity: varchar("severity", { length: 20 }).notNull().default("warning"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    communityUserIdx: index("warnings_community_user_idx").on(t.communityId, t.userId),
  })
);
