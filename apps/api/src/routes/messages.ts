import type { FastifyInstance } from "fastify";
import { eq, lt, desc, asc, and, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { sendMessageSchema, paginationSchema } from "@watercooler/shared";
import { getIO } from "../socket.js";
import { processLinkPreviews } from "../services/linkPreviews.js";
import {
  authHook,
  communityHook,
  requireRole,
  requireNotTimedOut,
  verifyChannelAccess,
  type AuthedRequest,
} from "../auth.js";

function sanitizeContent(text: string): string {
  return text.replace(/<\/?[^>]+(>|$)/g, "");
}

export async function messageRoutes(app: FastifyInstance) {
  const preHandler = [authHook, communityHook];

  // Paginated message history
  app.get("/api/channels/:channelId/messages", { preHandler }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { channelId } = request.params as { channelId: string };
    const access = await verifyChannelAccess(channelId, req.user.id, req.communityId);
    if (!access.ok) return reply.code(access.code).send({ error: access.error });
    const { cursor, limit } = paginationSchema.parse(request.query);

    const conditions = [eq(schema.messages.channelId, channelId)];
    if (cursor) {
      conditions.push(lt(schema.messages.createdAt, new Date(cursor)));
    }

    const msgs = await db
      .select({
        id: schema.messages.id,
        channelId: schema.messages.channelId,
        userId: schema.messages.userId,
        content: schema.messages.content,
        replyToId: schema.messages.replyToId,
        isPinned: schema.messages.isPinned,
        pinnedAt: schema.messages.pinnedAt,
        pinnedBy: schema.messages.pinnedBy,
        replyCount: schema.messages.replyCount,
        createdAt: schema.messages.createdAt,
        editedAt: schema.messages.editedAt,
        linkPreviews: schema.messages.linkPreviews,
        username: schema.users.username,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.messages)
      .innerJoin(schema.users, eq(schema.messages.userId, schema.users.id))
      .where(and(...conditions))
      .orderBy(desc(schema.messages.createdAt))
      .limit(limit);

    const messageIds = msgs.map((m) => m.id);
    let attachmentMap: Record<string, any[]> = {};
    let reactionMap: Record<string, any[]> = {};
    let replyToMap: Record<string, any> = {};

    if (messageIds.length > 0) {
      // Fetch attachments
      const attachments = await db
        .select()
        .from(schema.attachments)
        .where(inArray(schema.attachments.messageId, messageIds));
      for (const a of attachments) {
        if (!attachmentMap[a.messageId]) attachmentMap[a.messageId] = [];
        attachmentMap[a.messageId].push(a);
      }

      // Fetch reactions with user info
      const reactions = await db
        .select({
          id: schema.reactions.id,
          messageId: schema.reactions.messageId,
          userId: schema.reactions.userId,
          emoji: schema.reactions.emoji,
          username: schema.users.username,
        })
        .from(schema.reactions)
        .innerJoin(schema.users, eq(schema.reactions.userId, schema.users.id))
        .where(inArray(schema.reactions.messageId, messageIds));
      for (const r of reactions) {
        if (!reactionMap[r.messageId]) reactionMap[r.messageId] = [];
        reactionMap[r.messageId].push({
          id: r.id,
          messageId: r.messageId,
          userId: r.userId,
          emoji: r.emoji,
          user: { id: r.userId, username: r.username },
        });
      }

      // Fetch reply-to snippets
      const replyToIds = msgs.map((m) => m.replyToId).filter(Boolean) as string[];
      if (replyToIds.length > 0) {
        const replyMsgs = await db
          .select({
            id: schema.messages.id,
            content: schema.messages.content,
            userId: schema.messages.userId,
            username: schema.users.username,
          })
          .from(schema.messages)
          .innerJoin(schema.users, eq(schema.messages.userId, schema.users.id))
          .where(inArray(schema.messages.id, replyToIds));
        for (const r of replyMsgs) {
          replyToMap[r.id] = {
            id: r.id,
            content: r.content.slice(0, 200),
            user: { id: r.userId, username: r.username },
          };
        }
      }
    }

    return msgs.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      userId: m.userId,
      content: m.content,
      replyToId: m.replyToId ?? null,
      replyTo: m.replyToId ? replyToMap[m.replyToId] ?? null : null,
      isPinned: m.isPinned,
      pinnedAt: m.pinnedAt?.toISOString() ?? null,
      pinnedBy: m.pinnedBy ?? null,
      replyCount: m.replyCount,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt?.toISOString() ?? null,
      user: { id: m.userId, username: m.username, avatarUrl: m.avatarUrl },
      attachments: attachmentMap[m.id] ?? [],
      reactions: reactionMap[m.id] ?? [],
      linkPreviews: (m.linkPreviews as any[]) ?? [],
    }));
  });

  // Fallback REST message send
  app.post(
    "/api/channels/:channelId/messages",
    { preHandler: [...preHandler, requireNotTimedOut] },
    async (request, reply) => {
      const req = request as AuthedRequest;
      const { channelId } = request.params as { channelId: string };
      const access = await verifyChannelAccess(channelId, req.user.id, req.communityId);
      if (!access.ok) return reply.code(access.code).send({ error: access.error });
      const data = sendMessageSchema.parse(request.body);
      data.content = sanitizeContent(data.content);

      if (
        access.channel.type === "channel" &&
        access.channel.isAnnouncement &&
        !["owner", "moderator"].includes(req.membership.role)
      ) {
        return reply.code(403).send({ error: "This channel is read-only. Only staff can post." });
      }

      const [message] = await db
        .insert(schema.messages)
        .values({ channelId, userId: req.user.id, content: data.content })
        .returning();

      // Extract @mentions and create notifications (capped to prevent abuse)
      const mentionRegex = /@(\w+)/g;
      let match;
      let mentionCount = 0;
      while ((match = mentionRegex.exec(data.content)) !== null && mentionCount < 10) {
        mentionCount++;
        const [mentioned] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.username, match[1]))
          .limit(1);
        if (mentioned && mentioned.id !== req.user.id) {
          await db.insert(schema.notifications).values({
            userId: mentioned.id,
            communityId: req.communityId,
            type: "mention",
            payload: {
              channelId,
              messageId: message.id,
              mentionedBy: req.user.username,
              content: data.content.slice(0, 100),
            },
          });
        }
      }

      processLinkPreviews(message.id, channelId, data.content);

      return {
        ...message,
        createdAt: message.createdAt.toISOString(),
        editedAt: null,
        user: { id: req.user.id, username: req.user.username, avatarUrl: req.user.avatarUrl },
        attachments: [],
        reactions: [],
        linkPreviews: [],
      };
    }
  );

  // Get pinned messages for a channel
  app.get("/api/channels/:channelId/pins", { preHandler }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { channelId } = request.params as { channelId: string };
    const access = await verifyChannelAccess(channelId, req.user.id, req.communityId);
    if (!access.ok) return reply.code(access.code).send({ error: access.error });

    const msgs = await db
      .select({
        id: schema.messages.id,
        channelId: schema.messages.channelId,
        userId: schema.messages.userId,
        content: schema.messages.content,
        replyToId: schema.messages.replyToId,
        isPinned: schema.messages.isPinned,
        pinnedAt: schema.messages.pinnedAt,
        pinnedBy: schema.messages.pinnedBy,
        replyCount: schema.messages.replyCount,
        createdAt: schema.messages.createdAt,
        editedAt: schema.messages.editedAt,
        linkPreviews: schema.messages.linkPreviews,
        username: schema.users.username,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.messages)
      .innerJoin(schema.users, eq(schema.messages.userId, schema.users.id))
      .where(and(eq(schema.messages.channelId, channelId), eq(schema.messages.isPinned, true)))
      .orderBy(desc(schema.messages.pinnedAt));

    return msgs.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      userId: m.userId,
      content: m.content,
      replyToId: m.replyToId ?? null,
      isPinned: m.isPinned,
      pinnedAt: m.pinnedAt?.toISOString() ?? null,
      pinnedBy: m.pinnedBy ?? null,
      replyCount: m.replyCount,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt?.toISOString() ?? null,
      user: { id: m.userId, username: m.username, avatarUrl: m.avatarUrl },
      attachments: [],
      reactions: [],
      linkPreviews: (m.linkPreviews as any[]) ?? [],
    }));
  });

  // Toggle pin on a message
  app.patch(
    "/api/channels/:channelId/pins/:messageId",
    { preHandler },
    async (request, reply) => {
      const req = request as AuthedRequest;
      const { channelId, messageId } = request.params as { channelId: string; messageId: string };

      const [msg] = await db
        .select()
        .from(schema.messages)
        .where(and(eq(schema.messages.id, messageId), eq(schema.messages.channelId, channelId)))
        .limit(1);

      if (!msg) return reply.code(404).send({ error: "Message not found" });

      // Only message owner or mods can pin
      const isMod = ["owner", "moderator"].includes(req.membership.role);
      if (msg.userId !== req.user.id && !isMod) {
        return reply.code(403).send({ error: "Not authorized to pin" });
      }

      const newPinned = !msg.isPinned;

      if (newPinned) {
        // Check max 50 pins
        const [{ pinCount }] = await db
          .select({ pinCount: sql<number>`count(*)::int` })
          .from(schema.messages)
          .where(and(eq(schema.messages.channelId, channelId), eq(schema.messages.isPinned, true)));
        if (pinCount >= 50) {
          return reply.code(400).send({ error: "Maximum 50 pinned messages per channel" });
        }
      }

      await db
        .update(schema.messages)
        .set({
          isPinned: newPinned,
          pinnedAt: newPinned ? new Date() : null,
          pinnedBy: newPinned ? req.user.id : null,
        })
        .where(eq(schema.messages.id, messageId));

      // Emit socket event
      const io = getIO();
      io.to(`channel:${channelId}`).emit("message_pinned", {
        channelId,
        messageId,
        isPinned: newPinned,
        pinnedBy: newPinned ? req.user.id : null,
        pinnedAt: newPinned ? new Date().toISOString() : null,
      });

      // Audit log
      await db.insert(schema.auditLogs).values({
        communityId: req.communityId,
        actorId: req.user.id,
        action: newPinned ? "message_pin" : "message_unpin",
        targetType: "message",
        targetId: messageId,
      });

      return { ok: true, isPinned: newPinned };
    }
  );

  // Get thread (root message + all replies)
  app.get("/api/messages/:messageId/thread", { preHandler }, async (request) => {
    const { messageId } = request.params as { messageId: string };

    // Find the message
    const [msg] = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, messageId))
      .limit(1);

    if (!msg) return { root: null, replies: [] };

    // Determine the root: if this message has a replyToId, go up one level
    const rootId = msg.replyToId || msg.id;

    // Fetch root message
    const [rootRow] = await db
      .select({
        id: schema.messages.id,
        channelId: schema.messages.channelId,
        userId: schema.messages.userId,
        content: schema.messages.content,
        replyToId: schema.messages.replyToId,
        isPinned: schema.messages.isPinned,
        pinnedAt: schema.messages.pinnedAt,
        pinnedBy: schema.messages.pinnedBy,
        replyCount: schema.messages.replyCount,
        createdAt: schema.messages.createdAt,
        editedAt: schema.messages.editedAt,
        linkPreviews: schema.messages.linkPreviews,
        username: schema.users.username,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.messages)
      .innerJoin(schema.users, eq(schema.messages.userId, schema.users.id))
      .where(eq(schema.messages.id, rootId))
      .limit(1);

    if (!rootRow) return { root: null, replies: [] };

    // Fetch all replies to the root
    const replyRows = await db
      .select({
        id: schema.messages.id,
        channelId: schema.messages.channelId,
        userId: schema.messages.userId,
        content: schema.messages.content,
        replyToId: schema.messages.replyToId,
        isPinned: schema.messages.isPinned,
        pinnedAt: schema.messages.pinnedAt,
        pinnedBy: schema.messages.pinnedBy,
        replyCount: schema.messages.replyCount,
        createdAt: schema.messages.createdAt,
        editedAt: schema.messages.editedAt,
        linkPreviews: schema.messages.linkPreviews,
        username: schema.users.username,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.messages)
      .innerJoin(schema.users, eq(schema.messages.userId, schema.users.id))
      .where(eq(schema.messages.replyToId, rootId))
      .orderBy(asc(schema.messages.createdAt));

    const formatMsg = (m: typeof rootRow) => ({
      id: m.id,
      channelId: m.channelId,
      userId: m.userId,
      content: m.content,
      replyToId: m.replyToId ?? null,
      isPinned: m.isPinned,
      pinnedAt: m.pinnedAt?.toISOString() ?? null,
      pinnedBy: m.pinnedBy ?? null,
      replyCount: m.replyCount,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt?.toISOString() ?? null,
      user: { id: m.userId, username: m.username, avatarUrl: m.avatarUrl },
      attachments: [],
      reactions: [],
      linkPreviews: (m.linkPreviews as any[]) ?? [],
    });

    return {
      root: formatMsg(rootRow),
      replies: replyRows.map(formatMsg),
    };
  });
}
