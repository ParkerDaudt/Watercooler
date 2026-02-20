import type { FastifyInstance } from "fastify";
import { eq, and, ilike, sql, desc, inArray } from "drizzle-orm";
import { hash, verify } from "argon2";
import { db, schema } from "../db/index.js";
import { updateUserProfileSchema, changePasswordSchema, updateStatusSchema, userNoteSchema } from "@watercooler/shared";
import {
  authHook,
  communityHook,
  createToken,
  setAuthCookie,
  type AuthedRequest,
} from "../auth.js";
import { env } from "../env.js";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join, extname } from "path";

// Magic byte signatures for avatar image validation
const IMAGE_MAGIC: Array<{ mime: string; bytes: number[] }> = [
  { mime: "image/jpeg", bytes: [0xFF, 0xD8, 0xFF] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
];

function detectImageMime(buffer: Buffer): string | null {
  // WebP: RIFF at 0, WEBP at 8
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return "image/webp";
  }
  for (const sig of IMAGE_MAGIC) {
    if (buffer.length < sig.bytes.length) continue;
    if (sig.bytes.every((b, i) => buffer[i] === b)) return sig.mime;
  }
  return null;
}

export async function userRoutes(app: FastifyInstance) {
  const preHandler = [authHook, communityHook];

  // Get user profile (bio, join date, role in community)
  app.get("/api/users/:userId/profile", { preHandler }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { userId } = request.params as { userId: string };

    const [user] = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        avatarUrl: schema.users.avatarUrl,
        bannerUrl: schema.users.bannerUrl,
        pronouns: schema.users.pronouns,
        connectedLinks: schema.users.connectedLinks,
        bio: schema.users.bio,
        status: schema.users.status,
        customStatus: schema.users.customStatus,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) return reply.code(404).send({ error: "User not found" });

    const [membership] = await db
      .select({
        id: schema.memberships.id,
        role: schema.memberships.role,
        joinedAt: schema.memberships.joinedAt,
      })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.communityId, req.communityId)
        )
      )
      .limit(1);

    // Fetch custom roles if member
    let userRoles: Array<{ id: string; name: string; color: string }> = [];
    if (membership) {
      userRoles = await db
        .select({
          id: schema.roles.id,
          name: schema.roles.name,
          color: schema.roles.color,
        })
        .from(schema.userRoles)
        .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
        .where(eq(schema.userRoles.membershipId, membership.id));
    }

    // Parallel fetches for badges, activity stats, mutual channels, note
    const isOwnProfile = userId === req.user.id;

    const [userBadgesList, msgCountResult, lastMessage, noteResult, myChannelIds, theirChannelIds] = await Promise.all([
      // Badges
      db.select({
        id: schema.badges.id,
        name: schema.badges.name,
        description: schema.badges.description,
        icon: schema.badges.icon,
        color: schema.badges.color,
      }).from(schema.userBadges)
        .innerJoin(schema.badges, eq(schema.userBadges.badgeId, schema.badges.id))
        .where(eq(schema.userBadges.userId, userId)),

      // Message count
      db.select({ count: sql<number>`count(*)::int` })
        .from(schema.messages)
        .where(eq(schema.messages.userId, userId)),

      // Last message
      db.select({ createdAt: schema.messages.createdAt })
        .from(schema.messages)
        .where(eq(schema.messages.userId, userId))
        .orderBy(desc(schema.messages.createdAt))
        .limit(1),

      // Note (only for other users)
      isOwnProfile
        ? Promise.resolve([])
        : db.select({ content: schema.userNotes.content, updatedAt: schema.userNotes.updatedAt })
            .from(schema.userNotes)
            .where(and(eq(schema.userNotes.authorId, req.user.id), eq(schema.userNotes.targetUserId, userId)))
            .limit(1),

      // My private channel memberships
      isOwnProfile
        ? Promise.resolve([])
        : db.select({ channelId: schema.channelMembers.channelId })
            .from(schema.channelMembers)
            .where(eq(schema.channelMembers.userId, req.user.id)),

      // Their private channel memberships
      isOwnProfile
        ? Promise.resolve([])
        : db.select({ channelId: schema.channelMembers.channelId })
            .from(schema.channelMembers)
            .where(eq(schema.channelMembers.userId, userId)),
    ]);

    const activityStats = {
      messageCount: msgCountResult[0]?.count ?? 0,
      lastActiveAt: lastMessage[0]?.createdAt?.toISOString() ?? null,
    };

    // Mutual private channels
    let mutualChannels: Array<{ id: string; name: string; type: string }> = [];
    if (!isOwnProfile) {
      const mySet = new Set(myChannelIds.map((c) => c.channelId));
      const sharedIds = theirChannelIds.map((c) => c.channelId).filter((id) => mySet.has(id));
      if (sharedIds.length > 0) {
        mutualChannels = await db
          .select({ id: schema.channels.id, name: schema.channels.name, type: schema.channels.type })
          .from(schema.channels)
          .where(and(inArray(schema.channels.id, sharedIds), eq(schema.channels.type, "channel")));
      }
    }

    const note = noteResult[0]
      ? { content: noteResult[0].content, updatedAt: noteResult[0].updatedAt.toISOString() }
      : null;

    return {
      ...user,
      connectedLinks: user.connectedLinks ?? {},
      createdAt: user.createdAt.toISOString(),
      membership: membership
        ? {
            role: membership.role,
            joinedAt: membership.joinedAt.toISOString(),
            roles: userRoles,
          }
        : null,
      badges: userBadgesList,
      activityStats,
      mutualChannels,
      note,
    };
  });

  // Update own profile (username, bio, email)
  app.patch("/api/users/me", { preHandler }, async (request, reply) => {
    const req = request as AuthedRequest;
    const data = updateUserProfileSchema.parse(request.body);

    // Check username uniqueness if changing
    if (data.username) {
      const [existing] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.username, data.username)))
        .limit(1);
      if (existing && existing.id !== req.user.id) {
        return reply.code(409).send({ error: "Username already taken" });
      }
    }

    // Check email uniqueness if changing
    if (data.email) {
      const [existing] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.email, data.email)))
        .limit(1);
      if (existing && existing.id !== req.user.id) {
        return reply.code(409).send({ error: "Email already in use" });
      }
    }

    const updates: Record<string, unknown> = {};
    if (data.username !== undefined) updates.username = data.username;
    if (data.bio !== undefined) updates.bio = data.bio;
    if (data.email !== undefined) updates.email = data.email;
    if (data.pronouns !== undefined) updates.pronouns = data.pronouns;
    if (data.connectedLinks !== undefined) updates.connectedLinks = data.connectedLinks;

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({ error: "No fields to update" });
    }

    const [updated] = await db
      .update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, req.user.id))
      .returning({
        id: schema.users.id,
        username: schema.users.username,
        email: schema.users.email,
        bio: schema.users.bio,
        pronouns: schema.users.pronouns,
        connectedLinks: schema.users.connectedLinks,
        bannerUrl: schema.users.bannerUrl,
        createdAt: schema.users.createdAt,
      });

    if (!updated) return reply.code(404).send({ error: "User not found" });

    return {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
    };
  });

  // Change password
  app.post("/api/users/me/password", { preHandler }, async (request, reply) => {
    const req = request as AuthedRequest;
    const data = changePasswordSchema.parse(request.body);

    // Fetch current password hash
    const [user] = await db
      .select({ passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.id, req.user.id))
      .limit(1);

    if (!user) return reply.code(404).send({ error: "User not found" });

    // Verify current password
    const valid = await verify(user.passwordHash, data.currentPassword);
    if (!valid) {
      return reply.code(401).send({ error: "Current password is incorrect" });
    }

    // Hash and save new password, increment token version to invalidate old sessions
    const passwordHash = await hash(data.newPassword);
    const [updated] = await db
      .update(schema.users)
      .set({ passwordHash, tokenVersion: sql`token_version + 1` })
      .where(eq(schema.users.id, req.user.id))
      .returning({ tokenVersion: schema.users.tokenVersion });

    // Issue new token so the current session stays valid
    const newToken = await createToken(req.user.id, updated.tokenVersion);
    setAuthCookie(reply, newToken);

    return { ok: true };
  });

  // Update own status
  app.patch("/api/users/me/status", { preHandler }, async (request, reply) => {
    const req = request as AuthedRequest;
    const data = updateStatusSchema.parse(request.body);

    const [updated] = await db
      .update(schema.users)
      .set({ status: data.status, customStatus: data.customStatus ?? "" })
      .where(eq(schema.users.id, req.user.id))
      .returning({ id: schema.users.id, status: schema.users.status, customStatus: schema.users.customStatus });

    if (!updated) return reply.code(404).send({ error: "User not found" });

    return { ok: true, status: updated.status, customStatus: updated.customStatus };
  });

  // Upload avatar
  app.post("/api/users/me/avatar", { preHandler }, async (request, reply) => {
    const req = request as AuthedRequest;
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: "No file provided" });

    const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedMimes.includes(data.mimetype)) {
      return reply.code(400).send({ error: "Only image files allowed" });
    }

    const buffer = await data.toBuffer();
    const maxBytes = 2 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return reply.code(413).send({ error: "Avatar must be under 2MB" });
    }

    // Verify actual file content matches claimed MIME type
    const detectedMime = detectImageMime(buffer);
    if (!detectedMime || !allowedMimes.includes(detectedMime)) {
      return reply.code(400).send({ error: "File content does not match an allowed image type" });
    }

    const fileId = randomUUID();
    const ext = extname(data.filename).replace(/[^a-zA-Z0-9.]/g, "") || ".png";
    const filename = `${fileId}${ext}`;
    const avatarDir = join(env.UPLOAD_DIR, "avatars");
    await mkdir(avatarDir, { recursive: true });
    await writeFile(join(avatarDir, filename), buffer);

    const avatarUrl = `/uploads/avatars/${filename}`;
    await db.update(schema.users)
      .set({ avatarUrl })
      .where(eq(schema.users.id, req.user.id));

    return { avatarUrl };
  });

  // Upload banner
  app.post("/api/users/me/banner", { preHandler }, async (request, reply) => {
    const req = request as AuthedRequest;
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: "No file provided" });

    const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedMimes.includes(data.mimetype)) {
      return reply.code(400).send({ error: "Only image files allowed" });
    }

    const buffer = await data.toBuffer();
    const maxBytes = 4 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return reply.code(413).send({ error: "Banner must be under 4MB" });
    }

    const detectedMime = detectImageMime(buffer);
    if (!detectedMime || !allowedMimes.includes(detectedMime)) {
      return reply.code(400).send({ error: "File content does not match an allowed image type" });
    }

    const fileId = randomUUID();
    const ext = extname(data.filename).replace(/[^a-zA-Z0-9.]/g, "") || ".png";
    const filename = `${fileId}${ext}`;
    const bannerDir = join(env.UPLOAD_DIR, "banners");
    await mkdir(bannerDir, { recursive: true });
    await writeFile(join(bannerDir, filename), buffer);

    const bannerUrl = `/uploads/banners/${filename}`;
    await db.update(schema.users).set({ bannerUrl }).where(eq(schema.users.id, req.user.id));

    return { bannerUrl };
  });

  // Upsert private note about a user
  app.put("/api/users/:userId/note", { preHandler }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { userId } = request.params as { userId: string };
    const { content } = userNoteSchema.parse(request.body);

    if (userId === req.user.id) {
      return reply.code(400).send({ error: "Cannot write a note about yourself" });
    }

    const [target] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!target) return reply.code(404).send({ error: "User not found" });

    const [note] = await db
      .insert(schema.userNotes)
      .values({ authorId: req.user.id, targetUserId: userId, content })
      .onConflictDoUpdate({
        target: [schema.userNotes.authorId, schema.userNotes.targetUserId],
        set: { content, updatedAt: new Date() },
      })
      .returning();

    return { content: note.content, updatedAt: note.updatedAt.toISOString() };
  });

  // Delete private note about a user
  app.delete("/api/users/:userId/note", { preHandler }, async (request) => {
    const req = request as AuthedRequest;
    const { userId } = request.params as { userId: string };

    await db
      .delete(schema.userNotes)
      .where(and(eq(schema.userNotes.authorId, req.user.id), eq(schema.userNotes.targetUserId, userId)));

    return { ok: true };
  });

  // Search users for mentions
  app.get("/api/users/search", { preHandler }, async (request) => {
    const req = request as AuthedRequest;
    const { q } = request.query as { q: string };

    if (!q || q.length < 2) {
      return [];
    }

    // Search users in the same community
    const users = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
      })
      .from(schema.users)
      .innerJoin(schema.memberships, eq(schema.users.id, schema.memberships.userId))
      .where(
        and(
          eq(schema.memberships.communityId, req.communityId),
          eq(schema.memberships.status, "active"),
          ilike(schema.users.username, `${q}%`)
        )
      )
      .limit(10);

    return users;
  });
}