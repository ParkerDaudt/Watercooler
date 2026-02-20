import { z } from "zod";

// Auth
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a digit");

export const signupSchema = z.object({
  email: z.string().email().max(255),
  password: passwordSchema,
  username: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, "Only letters, numbers, underscores, hyphens"),
  inviteCode: z.string().min(1).max(32),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const bootstrapSchema = z.object({
  email: z.string().email().max(255),
  password: passwordSchema,
  username: z.string().min(2).max(32),
  communityName: z.string().min(1).max(100),
});

// Community
export const updateCommunitySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  inviteOnly: z.boolean().optional(),
  requestToJoin: z.boolean().optional(),
  logoUrl: z.string().max(500).nullable().optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

// User profile
export const updateUserBioSchema = z.object({
  bio: z.string().max(500).optional(),
});

export const connectedLinksSchema = z.object({
  github: z.string().url().max(200).nullable().optional(),
  twitter: z.string().url().max(200).nullable().optional(),
  website: z.string().url().max(200).nullable().optional(),
});

export const updateUserProfileSchema = z.object({
  username: z.string().min(2).max(32).regex(/^[a-zA-Z0-9_-]+$/, "Only letters, numbers, underscores, hyphens").optional(),
  bio: z.string().max(500).optional(),
  email: z.string().email().max(255).optional(),
  pronouns: z.string().max(50).optional(),
  connectedLinks: connectedLinksSchema.optional(),
});

export const userNoteSchema = z.object({
  content: z.string().max(1000),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

// User status
export const updateStatusSchema = z.object({
  status: z.enum(["online", "away", "dnd", "invisible"]),
  customStatus: z.string().max(128).optional(),
});

// Channels
export const createChannelSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, hyphens only"),
  type: z.enum(["channel", "voice"]).default("channel"),
  isPrivate: z.boolean().default(false),
  isAnnouncement: z.boolean().default(false),
});

export const createDmSchema = z.object({
  userId: z.string().uuid(),
});

export const updateChannelSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  isPrivate: z.boolean().optional(),
  isAnnouncement: z.boolean().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// Messages
export const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export const editMessageSchema = z.object({
  messageId: z.string().uuid(),
  content: z.string().min(1).max(4000),
});

export const reactionSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z.string().min(1).max(32),
});

// Events
export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).default(""),
  locationText: z.string().max(500).default(""),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
});

export const updateEventSchema = createEventSchema.partial();

export const rsvpSchema = z.object({
  status: z.enum(["going", "interested", "not_going"]),
});

// Invites
export const createInviteSchema = z.object({
  maxUses: z.number().int().min(0).max(10000).default(0),
  expiresAt: z.string().datetime().nullable().optional(),
}).refine(
  (data) => !data.expiresAt || new Date(data.expiresAt) > new Date(),
  { message: "Expiration date must be in the future", path: ["expiresAt"] }
);

export const joinViaInviteSchema = z.object({
  code: z.string().min(1).max(32),
});

// Join Requests
export const handleJoinRequestSchema = z.object({
  status: z.enum(["approved", "denied"]),
});

// Reports
export const createReportSchema = z.object({
  messageId: z.string().uuid(),
  reason: z.string().min(1).max(1000),
});

export const updateReportSchema = z.object({
  status: z.enum(["reviewed", "dismissed"]),
});

// Moderation
export const kickSchema = z.object({
  userId: z.string().uuid(),
});

export const banSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().max(500).default(""),
});

export const timeoutSchema = z.object({
  userId: z.string().uuid(),
  until: z.string().datetime(),
});

export const deleteMessageSchema = z.object({
  messageId: z.string().uuid(),
});

export const warnSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().min(1).max(1000),
  severity: z.enum(["warning", "strike"]),
});

export const reportActionSchema = z.object({
  action: z.enum(["warn", "timeout", "kick", "ban"]),
  reason: z.string().max(500).optional(),
  timeoutHours: z.number().int().min(1).max(8760).optional(),
});

// Password Reset
export const resetPasswordSchema = z.object({
  email: z.string().email(),
  recoveryKey: z.string().min(1),
  newPassword: passwordSchema,
});

// Message Search
export const searchMessagesSchema = z.object({
  q: z.string().min(1).max(200),
  channelId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Channel Categories
export const createCategorySchema = z.object({
  name: z.string().min(1).max(64),
  sortOrder: z.number().int().min(0).default(0),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(64).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// Pagination
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
