import type { FastifyInstance } from "fastify";
import { eq, and, inArray, or, desc, gt, count } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { createChannelSchema, updateChannelSchema, createDmSchema } from "@watercooler/shared";
import {
  authHook,
  communityHook,
  requirePermission,
  requireNotTimedOut,
  type AuthedRequest,
} from "../auth.js";

export async function channelRoutes(app: FastifyInstance) {
  const preHandler = [authHook, communityHook];

  app.get("/api/channels", { preHandler }, async (request) => {
    const req = request as AuthedRequest;

    // Get community channels
    const communityChannels = await db
      .select()
      .from(schema.channels)
      .where(eq(schema.channels.communityId, req.communityId));

    // Get DM channels for the user
    const dmChannels = await db
      .select({
        id: schema.channels.id,
        communityId: schema.channels.communityId,
        name: schema.channels.name,
        type: schema.channels.type,
        isPrivate: schema.channels.isPrivate,
        isAnnouncement: schema.channels.isAnnouncement,
        categoryId: schema.channels.categoryId,
        sortOrder: schema.channels.sortOrder,
        createdAt: schema.channels.createdAt,
      })
      .from(schema.channels)
      .innerJoin(schema.dmParticipants, eq(schema.channels.id, schema.dmParticipants.channelId))
      .where(
        and(
          eq(schema.channels.type, "dm"),
          eq(schema.dmParticipants.userId, req.user.id)
        )
      );

    const allChannels = [...communityChannels, ...dmChannels];

    if (req.permissions.manageChannels) {
      return allChannels;
    }

    // For members, filter out private channels they don't belong to
    const privateChannels = allChannels.filter((c) => c.isPrivate && c.communityId);
    const publicChannels = allChannels.filter((c) => !c.isPrivate || !c.communityId);

    if (privateChannels.length === 0) return publicChannels;

    const memberships = await db
      .select()
      .from(schema.channelMembers)
      .where(
        and(
          eq(schema.channelMembers.userId, req.user.id),
          inArray(
            schema.channelMembers.channelId,
            privateChannels.map((c) => c.id)
          )
        )
      );

    const allowedIds = new Set(memberships.map((m) => m.channelId));
    return [
      ...publicChannels,
      ...privateChannels.filter((c) => allowedIds.has(c.id)),
    ];
  });

  app.post(
    "/api/channels",
    { preHandler: [...preHandler, requirePermission("manageChannels"), requireNotTimedOut] },
    async (request, reply) => {
      const req = request as AuthedRequest;
      const data = createChannelSchema.parse(request.body);

      const [existing] = await db
        .select()
        .from(schema.channels)
        .where(
          and(
            eq(schema.channels.communityId, req.communityId),
            eq(schema.channels.name, data.name)
          )
        )
        .limit(1);
      if (existing) {
        return reply.code(409).send({ error: "Channel name already exists" });
      }

      const [channel] = await db
        .insert(schema.channels)
        .values({
          communityId: req.communityId,
          name: data.name,
          type: data.type,
          isPrivate: data.isPrivate,
          isAnnouncement: data.type === "voice" ? false : (data.isAnnouncement ?? false),
        })
        .returning();

      await db.insert(schema.auditLogs).values({
        communityId: req.communityId,
        actorId: req.user.id,
        action: "channel_create",
        targetType: "channel",
        targetId: channel.id,
        metadata: { name: data.name },
      });

      return channel;
    }
  );

  app.post(
    "/api/dms",
    { preHandler },
    async (request, reply) => {
      const req = request as AuthedRequest;
      const data = createDmSchema.parse(request.body);

      // Check if DM already exists between these users
      const existingDm = await db
        .select({
          channelId: schema.dmParticipants.channelId,
        })
        .from(schema.dmParticipants)
        .where(eq(schema.dmParticipants.userId, req.user.id))
        .then((participants) => {
          const channelIds = participants.map(p => p.channelId);
          return db
            .select()
            .from(schema.dmParticipants)
            .where(
              and(
                inArray(schema.dmParticipants.channelId, channelIds),
                eq(schema.dmParticipants.userId, data.userId)
              )
            );
        });

      if (existingDm.length > 0) {
        // Return existing DM channel
        const [channel] = await db
          .select()
          .from(schema.channels)
          .where(eq(schema.channels.id, existingDm[0].channelId));
        return channel;
      }

      // Verify target user exists and is an active community member
      const [otherUser] = await db
        .select({ username: schema.users.username })
        .from(schema.users)
        .where(eq(schema.users.id, data.userId))
        .limit(1);

      if (!otherUser) {
        return reply.code(404).send({ error: "User not found" });
      }

      const [targetMembership] = await db
        .select({ status: schema.memberships.status })
        .from(schema.memberships)
        .where(and(eq(schema.memberships.userId, data.userId), eq(schema.memberships.communityId, req.communityId)))
        .limit(1);

      if (!targetMembership || targetMembership.status === "banned") {
        return reply.code(400).send({ error: "Cannot message this user" });
      }

      // Create DM channel
      const [channel] = await db
        .insert(schema.channels)
        .values({
          name: otherUser.username,
          type: "dm",
          isPrivate: true
        })
        .returning();

      // Add participants
      await db.insert(schema.dmParticipants).values([
        { channelId: channel.id, userId: req.user.id },
        { channelId: channel.id, userId: data.userId }
      ]);

      return channel;
    }
  );

  app.patch(
    "/api/channels/:channelId",
    { preHandler: [...preHandler, requirePermission("manageChannels")] },
    async (request, reply) => {
      const req = request as AuthedRequest;
      const { channelId } = request.params as { channelId: string };
      const data = updateChannelSchema.parse(request.body);

      const [channel] = await db
        .update(schema.channels)
        .set(data)
        .where(and(eq(schema.channels.id, channelId), eq(schema.channels.communityId, req.communityId)))
        .returning();
      if (!channel) return reply.code(404).send({ error: "Channel not found" });
      return channel;
    }
  );

  app.delete(
    "/api/channels/:channelId",
    { preHandler: [...preHandler, requirePermission("manageChannels")] },
    async (request, reply) => {
      const req = request as AuthedRequest;
      const { channelId } = request.params as { channelId: string };

      const [deleted] = await db.delete(schema.channels)
        .where(and(eq(schema.channels.id, channelId), eq(schema.channels.communityId, req.communityId)))
        .returning({ id: schema.channels.id });
      if (!deleted) return reply.code(404).send({ error: "Channel not found" });

      await db.insert(schema.auditLogs).values({
        communityId: req.communityId,
        actorId: req.user.id,
        action: "channel_delete",
        targetType: "channel",
        targetId: channelId,
      });

      return { ok: true };
    }
  );

  // Add user to private channel
  app.post(
    "/api/channels/:channelId/members",
    { preHandler: [...preHandler, requirePermission("manageChannels")] },
    async (request) => {
      const { channelId } = request.params as { channelId: string };
      const { userId } = request.body as { userId: string };

      await db.insert(schema.channelMembers).values({ channelId, userId });
      return { ok: true };
    }
  );

  // Mark channel as read
  app.post(
    "/api/channels/:channelId/read",
    { preHandler },
    async (request) => {
      const req = request as AuthedRequest;
      const { channelId } = request.params as { channelId: string };

      // Get the latest message in the channel
      const [latestMessage] = await db
        .select({ id: schema.messages.id })
        .from(schema.messages)
        .where(eq(schema.messages.channelId, channelId))
        .orderBy(desc(schema.messages.createdAt))
        .limit(1);

      await db
        .insert(schema.channelReadStates)
        .values({
          channelId,
          userId: req.user.id,
          lastReadMessageId: latestMessage?.id || null,
        })
        .onConflictDoUpdate({
          target: [schema.channelReadStates.channelId, schema.channelReadStates.userId],
          set: {
            lastReadMessageId: latestMessage?.id || null,
            lastReadAt: new Date(),
          },
        });

      return { ok: true };
    }
  );

  // Get unread counts for all channels
  app.get("/api/channels/unread", { preHandler }, async (request) => {
    const req = request as AuthedRequest;

    // Get all channels the user has access to
    const channels = await db
      .select({
        id: schema.channels.id,
        type: schema.channels.type,
        communityId: schema.channels.communityId,
        isPrivate: schema.channels.isPrivate,
      })
      .from(schema.channels)
      .leftJoin(schema.dmParticipants, eq(schema.channels.id, schema.dmParticipants.channelId))
      .where(
        or(
          eq(schema.channels.communityId, req.communityId),
          and(
            eq(schema.channels.type, "dm"),
            eq(schema.dmParticipants.userId, req.user.id)
          )
        )
      );

    const unreadCounts: Record<string, number> = {};

    for (const channel of channels) {
      // Get user's read state
      const [readState] = await db
        .select()
        .from(schema.channelReadStates)
        .where(
          and(
            eq(schema.channelReadStates.channelId, channel.id),
            eq(schema.channelReadStates.userId, req.user.id)
          )
        );

      if (!readState?.lastReadMessageId) {
        // Count all messages if never read
        const [{ total }] = await db
          .select({ total: count() })
          .from(schema.messages)
          .where(eq(schema.messages.channelId, channel.id));
        unreadCounts[channel.id] = Number(total);
      } else {
        // Count messages after last read
        const [{ total }] = await db
          .select({ total: count() })
          .from(schema.messages)
          .where(
            and(
              eq(schema.messages.channelId, channel.id),
              gt(schema.messages.createdAt, readState.lastReadAt)
            )
          );
        unreadCounts[channel.id] = Number(total);
      }
    }

    return unreadCounts;
  });
}
