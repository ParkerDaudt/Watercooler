import type { FastifyInstance } from "fastify";
import { eq, and, lt, desc, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { searchMessagesSchema } from "@watercooler/shared";
import {
  authHook,
  communityHook,
  type AuthedRequest,
} from "../auth.js";

export async function searchRoutes(app: FastifyInstance) {
  const preHandler = [authHook, communityHook];

  app.get("/api/messages/search", { preHandler }, async (request) => {
    const req = request as AuthedRequest;
    const { q, channelId, cursor, limit } = searchMessagesSchema.parse(request.query);

    // Determine accessible channel IDs
    let accessibleChannelIds: string[];

    if (channelId) {
      // Verify user can access this specific channel
      const [ch] = await db
        .select()
        .from(schema.channels)
        .where(eq(schema.channels.id, channelId))
        .limit(1);

      if (!ch) return [];

      // Check access: community channel or DM participant
      if (ch.communityId) {
        if (ch.isPrivate && !["owner", "moderator"].includes(req.membership.role)) {
          const [membership] = await db
            .select()
            .from(schema.channelMembers)
            .where(
              and(
                eq(schema.channelMembers.channelId, channelId),
                eq(schema.channelMembers.userId, req.user.id)
              )
            )
            .limit(1);
          if (!membership) return [];
        }
      } else if (ch.type === "dm") {
        const [participant] = await db
          .select()
          .from(schema.dmParticipants)
          .where(
            and(
              eq(schema.dmParticipants.channelId, channelId),
              eq(schema.dmParticipants.userId, req.user.id)
            )
          )
          .limit(1);
        if (!participant) return [];
      }

      accessibleChannelIds = [channelId];
    } else {
      // Get all accessible channels
      const communityChannels = await db
        .select({ id: schema.channels.id, isPrivate: schema.channels.isPrivate })
        .from(schema.channels)
        .where(eq(schema.channels.communityId, req.communityId));

      const dmChannels = await db
        .select({ id: schema.channels.id })
        .from(schema.channels)
        .innerJoin(schema.dmParticipants, eq(schema.channels.id, schema.dmParticipants.channelId))
        .where(
          and(
            eq(schema.channels.type, "dm"),
            eq(schema.dmParticipants.userId, req.user.id)
          )
        );

      const isMod = ["owner", "moderator"].includes(req.membership.role);
      let ids = communityChannels
        .filter((c) => !c.isPrivate || isMod)
        .map((c) => c.id);

      if (!isMod) {
        const privateIds = communityChannels.filter((c) => c.isPrivate).map((c) => c.id);
        if (privateIds.length > 0) {
          const memberships = await db
            .select({ channelId: schema.channelMembers.channelId })
            .from(schema.channelMembers)
            .where(
              and(
                eq(schema.channelMembers.userId, req.user.id),
                inArray(schema.channelMembers.channelId, privateIds)
              )
            );
          ids = [...ids, ...memberships.map((m) => m.channelId)];
        }
      }

      ids = [...ids, ...dmChannels.map((c) => c.id)];
      accessibleChannelIds = ids;
    }

    if (accessibleChannelIds.length === 0) return [];

    const conditions = [
      inArray(schema.messages.channelId, accessibleChannelIds),
      sql`${schema.messages.content} ILIKE ${"%" + q + "%"}`,
    ];

    if (cursor) {
      conditions.push(lt(schema.messages.createdAt, new Date(cursor)));
    }

    const results = await db
      .select({
        id: schema.messages.id,
        channelId: schema.messages.channelId,
        channelName: schema.channels.name,
        userId: schema.messages.userId,
        username: schema.users.username,
        content: schema.messages.content,
        createdAt: schema.messages.createdAt,
      })
      .from(schema.messages)
      .innerJoin(schema.users, eq(schema.messages.userId, schema.users.id))
      .innerJoin(schema.channels, eq(schema.messages.channelId, schema.channels.id))
      .where(and(...conditions))
      .orderBy(desc(schema.messages.createdAt))
      .limit(limit);

    return results.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}
