import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { verifyToken } from "./auth.js";
import { db, schema } from "./db/index.js";
import { eq, and, sql } from "drizzle-orm";
import { computeEffectivePermissions } from "./services/permissions.js";
import { processLinkPreviews } from "./services/linkPreviews.js";
import type { ServerToClientEvents, ClientToServerEvents, UserStatus, VoiceParticipant, VoiceChannelState } from "@watercooler/shared";

/** Strip HTML/script tags from user content to prevent stored XSS. */
function sanitizeContent(text: string): string {
  return text.replace(/<\/?[^>]+(>|$)/g, "");
}

/** Parse a cookie header string into key-value pairs. */
function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

/** Maximum number of @mentions processed per message. */
const MAX_MENTIONS_PER_MESSAGE = 10;

interface SocketData {
  userId: string;
  username: string;
  avatarUrl: string;
  userStatus: UserStatus;
  customStatus: string;
}

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

// Track online users in memory: userId -> { status, customStatus }
const onlineUsers = new Map<string, { status: UserStatus; customStatus: string }>();

// Track voice channel participants: channelId -> Map<userId, VoiceParticipant>
const voiceChannels = new Map<string, Map<string, VoiceParticipant>>();
// Track which voice channel each user is in: userId -> channelId
const userVoiceChannel = new Map<string, string>();

function removeUserFromVoice(userId: string) {
  const channelId = userVoiceChannel.get(userId);
  if (!channelId) return;

  userVoiceChannel.delete(userId);
  const participants = voiceChannels.get(channelId);
  if (participants) {
    participants.delete(userId);
    if (participants.size === 0) {
      voiceChannels.delete(channelId);
    }
  }

  // Broadcast to everyone so sidebars update
  io.emit("voice_user_left", { channelId, userId });
}

export function getIO() {
  return io;
}

export function getOnlineUsers() {
  return onlineUsers;
}

export function setupSocketIO(httpServer: HttpServer, corsOrigin: string | string[]) {
  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
    path: "/socket.io",
  });

  io.use(async (socket, next) => {
    const clientIp = socket.handshake.address;
    try {
      // Try auth token first (passed from client), then fall back to cookie
      let token = (socket.handshake.auth as Record<string, unknown>)?.token as string | undefined;
      if (!token) {
        const cookieHeader = socket.handshake.headers.cookie;
        if (cookieHeader) {
          token = parseCookies(cookieHeader).session;
        }
      }
      if (!token) {
        console.warn(`[auth] Socket connection rejected: no session (ip=${clientIp})`);
        return next(new Error("No session"));
      }

      const result = await verifyToken(token);
      if (!result) {
        console.warn(`[auth] Socket connection rejected: invalid token (ip=${clientIp})`);
        return next(new Error("Invalid session"));
      }

      const [user] = await db
        .select({ id: schema.users.id, username: schema.users.username, avatarUrl: schema.users.avatarUrl, status: schema.users.status, customStatus: schema.users.customStatus, tokenVersion: schema.users.tokenVersion })
        .from(schema.users)
        .where(eq(schema.users.id, result.userId))
        .limit(1);
      if (!user) {
        console.warn(`[auth] Socket connection rejected: user not found (userId=${result.userId}, ip=${clientIp})`);
        return next(new Error("User not found"));
      }
      if (user.tokenVersion !== result.tokenVersion) {
        console.warn(`[auth] Socket connection rejected: expired token version (userId=${user.id}, ip=${clientIp})`);
        return next(new Error("Session expired"));
      }

      const data = socket.data as SocketData;
      data.userId = user.id;
      data.username = user.username;
      data.avatarUrl = user.avatarUrl || "";
      data.userStatus = (user.status as UserStatus) || "online";
      data.customStatus = user.customStatus || "";
      next();
    } catch {
      console.warn(`[auth] Socket connection rejected: unexpected error (ip=${clientIp})`);
      next(new Error("Auth failed"));
    }
  });

  io.on("connection", (socket) => {
    const { userId, username, avatarUrl, userStatus: savedStatus, customStatus: savedCustomStatus } = socket.data as SocketData;

    // --- Presence ---
    onlineUsers.set(userId, { status: savedStatus, customStatus: savedCustomStatus });
    // Invisible users appear offline to others
    if (savedStatus === "invisible") {
      io.emit("presence_update", { userId, status: "offline" });
    } else {
      io.emit("presence_update", { userId, status: savedStatus, customStatus: savedCustomStatus });
    }

    socket.on("disconnect", async () => {
      // Clean up voice state
      const voiceChannelId = userVoiceChannel.get(userId);
      if (voiceChannelId) {
        removeUserFromVoice(userId);
      }

      // Check if user has any other connected sockets
      const sockets = await io.fetchSockets();
      const stillConnected = sockets.some(
        (s) => (s.data as SocketData).userId === userId && s.id !== socket.id
      );
      if (!stillConnected) {
        onlineUsers.delete(userId);
        io.emit("presence_update", { userId, status: "offline" });
      }
    });

    socket.on("get_online_users", (callback) => {
      const result: Array<{ userId: string; status: string; customStatus: string }> = [];
      for (const [uid, info] of onlineUsers) {
        // Hide invisible users from the list
        if (info.status === "invisible") continue;
        result.push({ userId: uid, status: info.status, customStatus: info.customStatus });
      }
      callback(result);
    });

    // --- Set status ---
    socket.on("set_status", async (data, callback) => {
      try {
        const newStatus = data.status as UserStatus;
        const newCustomStatus = data.customStatus ?? "";

        // Update in-memory
        onlineUsers.set(userId, { status: newStatus, customStatus: newCustomStatus });

        // Persist to DB
        await db
          .update(schema.users)
          .set({ status: newStatus, customStatus: newCustomStatus })
          .where(eq(schema.users.id, userId));

        // Broadcast to others
        if (newStatus === "invisible") {
          // Appear offline to others
          io.emit("presence_update", { userId, status: "offline" });
        } else {
          io.emit("status_changed", { userId, status: newStatus, customStatus: newCustomStatus });
        }

        callback({ ok: true });
      } catch {
        callback({ ok: false, error: "Failed to update status" });
      }
    });

    // --- Channel join/leave ---
    socket.on("join_channel", (channelId) => {
      socket.join(`channel:${channelId}`);
    });

    socket.on("leave_channel", (channelId) => {
      socket.leave(`channel:${channelId}`);
    });

    // --- Typing ---
    socket.on("typing", (channelId) => {
      socket.to(`channel:${channelId}`).emit("typing", { channelId, userId, username });
      // Auto stop_typing after 3s
      setTimeout(() => {
        socket.to(`channel:${channelId}`).emit("stop_typing", { channelId, userId });
      }, 3000);
    });

    // --- Send message ---
    socket.on("send_message", async (data, callback) => {
      try {
        const hasAttachments = data.attachments && data.attachments.length > 0;
        if (!data.content && !hasAttachments) {
          return callback({ ok: false, error: "Invalid message" });
        }
        if (data.content && data.content.length > 4000) {
          return callback({ ok: false, error: "Message too long" });
        }
        data.content = data.content ? sanitizeContent(data.content) : "";

        // Check membership and timeout
        const [community] = await db.select().from(schema.communities).limit(1);
        if (!community) return callback({ ok: false, error: "No community" });

        const [membership] = await db
          .select()
          .from(schema.memberships)
          .where(
            and(
              eq(schema.memberships.userId, userId),
              eq(schema.memberships.communityId, community.id)
            )
          )
          .limit(1);

        if (!membership || membership.status === "banned") {
          return callback({ ok: false, error: "Not authorized" });
        }

        if (
          membership.status === "timeout" &&
          membership.timeoutUntil &&
          new Date(membership.timeoutUntil) > new Date()
        ) {
          return callback({ ok: false, error: "You are timed out" });
        }

        // Check channel permissions
        const channelPerms = await computeEffectivePermissions(membership.id, data.channelId);

        if (!channelPerms.sendMessages) {
          return callback({ ok: false, error: "You don't have permission to send messages here." });
        }

        // Check announcement channel: only users with manageMessages can post
        const [channel] = await db
          .select({ type: schema.channels.type, isAnnouncement: schema.channels.isAnnouncement })
          .from(schema.channels)
          .where(eq(schema.channels.id, data.channelId))
          .limit(1);

        if (channel?.type === "voice") {
          return callback({ ok: false, error: "Cannot send messages to a voice channel" });
        }

        if (
          channel?.type === "channel" &&
          channel?.isAnnouncement &&
          !channelPerms.manageMessages
        ) {
          return callback({ ok: false, error: "This channel is read-only. Only staff can post." });
        }

        const [message] = await db
          .insert(schema.messages)
          .values({
            channelId: data.channelId,
            userId,
            content: data.content,
            replyToId: data.replyToId || null,
          })
          .returning();

        // Fetch reply-to snippet if applicable
        let replyTo = null;
        if (message.replyToId) {
          const [replyMsg] = await db
            .select({
              id: schema.messages.id,
              content: schema.messages.content,
              userId: schema.messages.userId,
              username: schema.users.username,
            })
            .from(schema.messages)
            .innerJoin(schema.users, eq(schema.messages.userId, schema.users.id))
            .where(eq(schema.messages.id, message.replyToId))
            .limit(1);
          if (replyMsg) {
            replyTo = {
              id: replyMsg.id,
              content: replyMsg.content.slice(0, 200),
              user: { id: replyMsg.userId, username: replyMsg.username },
            };
          }
        }

        // Increment reply count on parent message
        if (message.replyToId) {
          await db.execute(
            sql`UPDATE messages SET reply_count = reply_count + 1 WHERE id = ${message.replyToId}`
          );
        }

        // Save attachments if provided
        const savedAttachments: Array<{ id: string; messageId: string; url: string; filename: string; mime: string; size: number }> = [];
        if (data.attachments && data.attachments.length > 0) {
          for (const att of data.attachments.slice(0, 10)) {
            const [saved] = await db
              .insert(schema.attachments)
              .values({
                messageId: message.id,
                url: att.url,
                filename: att.filename,
                mime: att.mime,
                size: att.size,
              })
              .returning();
            savedAttachments.push(saved);
          }
        }

        const fullMessage = {
          id: message.id,
          channelId: message.channelId,
          userId: message.userId,
          content: message.content,
          replyToId: message.replyToId,
          replyTo,
          isPinned: false,
          pinnedAt: null,
          pinnedBy: null,
          replyCount: 0,
          createdAt: message.createdAt.toISOString(),
          editedAt: null,
          user: { id: userId, username, avatarUrl },
          attachments: savedAttachments,
          reactions: [],
          linkPreviews: [],
        };

        io.to(`channel:${data.channelId}`).emit("new_message", fullMessage);

        // Process link previews asynchronously
        processLinkPreviews(message.id, data.channelId, data.content);

        // Handle @mentions (capped to prevent abuse)
        const mentionRegex = /@(\w+)/g;
        let match;
        let mentionCount = 0;
        while ((match = mentionRegex.exec(data.content)) !== null && mentionCount < MAX_MENTIONS_PER_MESSAGE) {
          mentionCount++;
          const [mentioned] = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.username, match[1]))
            .limit(1);
          if (mentioned && mentioned.id !== userId) {
            const [notif] = await db
              .insert(schema.notifications)
              .values({
                userId: mentioned.id,
                communityId: community.id,
                type: "mention",
                payload: {
                  channelId: data.channelId,
                  messageId: message.id,
                  mentionedBy: username,
                  content: data.content.slice(0, 100),
                },
              })
              .returning();

            // Emit notification to mentioned user's sockets
            const sockets = await io.fetchSockets();
            for (const s of sockets) {
              if ((s.data as SocketData).userId === mentioned.id) {
                s.emit("notification", {
                  ...notif,
                  type: notif.type as import("@watercooler/shared").NotificationType,
                  payload: notif.payload as Record<string, unknown>,
                  createdAt: notif.createdAt.toISOString(),
                  readAt: null,
                });
              }
            }
          }
        }

        callback({ ok: true, message: fullMessage });
      } catch (err) {
        callback({ ok: false, error: "Failed to send message" });
      }
    });

    // --- Edit message (author only) ---
    socket.on("edit_message", async (data, callback) => {
      try {
        if (!data.content || data.content.length > 4000) {
          return callback({ ok: false, error: "Invalid message" });
        }
        data.content = sanitizeContent(data.content);

        const [msg] = await db
          .select()
          .from(schema.messages)
          .where(eq(schema.messages.id, data.messageId))
          .limit(1);

        if (!msg) return callback({ ok: false, error: "Message not found" });
        if (msg.userId !== userId) return callback({ ok: false, error: "Not your message" });

        const [updated] = await db
          .update(schema.messages)
          .set({ content: data.content, editedAt: new Date() })
          .where(eq(schema.messages.id, data.messageId))
          .returning();

        const fullMessage = {
          id: updated.id,
          channelId: updated.channelId,
          userId: updated.userId,
          content: updated.content,
          replyToId: updated.replyToId,
          createdAt: updated.createdAt.toISOString(),
          editedAt: updated.editedAt?.toISOString() ?? null,
          user: { id: userId, username, avatarUrl },
        };

        io.to(`channel:${updated.channelId}`).emit("message_updated", fullMessage);
        callback({ ok: true });
      } catch {
        callback({ ok: false, error: "Failed to edit message" });
      }
    });

    // --- Delete message (author only) ---
    socket.on("delete_message", async (data, callback) => {
      try {
        const [msg] = await db
          .select()
          .from(schema.messages)
          .where(eq(schema.messages.id, data.messageId))
          .limit(1);

        if (!msg) return callback({ ok: false, error: "Message not found" });
        if (msg.userId !== userId) return callback({ ok: false, error: "Not your message" });

        await db.delete(schema.messages).where(eq(schema.messages.id, data.messageId));

        // Clean up notifications referencing this message
        await db.delete(schema.notifications).where(
          sql`payload_json->>'messageId' = ${data.messageId}`
        );

        // Decrement reply count on parent if this was a reply
        if (msg.replyToId) {
          await db.execute(
            sql`UPDATE messages SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = ${msg.replyToId}`
          );
        }

        io.to(`channel:${msg.channelId}`).emit("message_deleted", {
          channelId: msg.channelId,
          messageId: data.messageId,
        });
        callback({ ok: true });
      } catch {
        callback({ ok: false, error: "Failed to delete message" });
      }
    });

    // --- Add reaction ---
    socket.on("add_reaction", async (data, callback) => {
      try {
        const [msg] = await db
          .select()
          .from(schema.messages)
          .where(eq(schema.messages.id, data.messageId))
          .limit(1);
        if (!msg) return callback({ ok: false, error: "Message not found" });

        // Upsert: ignore if duplicate
        const [existing] = await db
          .select()
          .from(schema.reactions)
          .where(
            and(
              eq(schema.reactions.messageId, data.messageId),
              eq(schema.reactions.userId, userId),
              eq(schema.reactions.emoji, data.emoji)
            )
          )
          .limit(1);

        if (existing) return callback({ ok: true }); // Already reacted

        const [reaction] = await db
          .insert(schema.reactions)
          .values({
            messageId: data.messageId,
            userId,
            emoji: data.emoji,
          })
          .returning();

        io.to(`channel:${msg.channelId}`).emit("reaction_added", {
          channelId: msg.channelId,
          messageId: data.messageId,
          reaction: {
            id: reaction.id,
            messageId: reaction.messageId,
            userId: reaction.userId,
            emoji: reaction.emoji,
            user: { id: userId, username, avatarUrl },
          },
        });
        callback({ ok: true });
      } catch {
        callback({ ok: false, error: "Failed to add reaction" });
      }
    });

    // --- Remove reaction ---
    socket.on("remove_reaction", async (data, callback) => {
      try {
        const [msg] = await db
          .select()
          .from(schema.messages)
          .where(eq(schema.messages.id, data.messageId))
          .limit(1);
        if (!msg) return callback({ ok: false, error: "Message not found" });

        await db
          .delete(schema.reactions)
          .where(
            and(
              eq(schema.reactions.messageId, data.messageId),
              eq(schema.reactions.userId, userId),
              eq(schema.reactions.emoji, data.emoji)
            )
          );

        io.to(`channel:${msg.channelId}`).emit("reaction_removed", {
          channelId: msg.channelId,
          messageId: data.messageId,
          userId,
          emoji: data.emoji,
        });
        callback({ ok: true });
      } catch {
        callback({ ok: false, error: "Failed to remove reaction" });
      }
    });

    // --- Voice: Join ---
    socket.on("voice_join", async (channelId, callback) => {
      try {
        const [channel] = await db
          .select({ id: schema.channels.id, type: schema.channels.type })
          .from(schema.channels)
          .where(eq(schema.channels.id, channelId))
          .limit(1);

        if (!channel) return callback({ ok: false, error: "Channel not found" });
        if (channel.type !== "voice") return callback({ ok: false, error: "Not a voice channel" });

        // Leave any existing voice channel first
        const currentVoice = userVoiceChannel.get(userId);
        if (currentVoice) {
          socket.leave(`voice:${currentVoice}`);
          removeUserFromVoice(userId);
        }

        // Join the voice room
        socket.join(`voice:${channelId}`);

        const participant: VoiceParticipant = {
          userId,
          username,
          avatarUrl: avatarUrl || null,
          isMuted: false,
          isDeafened: false,
        };

        // Track state
        if (!voiceChannels.has(channelId)) {
          voiceChannels.set(channelId, new Map());
        }
        voiceChannels.get(channelId)!.set(userId, participant);
        userVoiceChannel.set(userId, channelId);

        // Get current participants for the joining user
        const currentParticipants = Array.from(voiceChannels.get(channelId)!.values());

        // Broadcast globally so all sidebars update
        io.emit("voice_user_joined", { channelId, participant });

        callback({ ok: true, participants: currentParticipants });
      } catch {
        callback({ ok: false, error: "Failed to join voice channel" });
      }
    });

    // --- Voice: Leave ---
    socket.on("voice_leave", (callback) => {
      try {
        const channelId = userVoiceChannel.get(userId);
        if (channelId) {
          socket.leave(`voice:${channelId}`);
        }
        removeUserFromVoice(userId);
        callback({ ok: true });
      } catch {
        callback({ ok: false, error: "Failed to leave voice channel" });
      }
    });

    // --- Voice: WebRTC Offer relay ---
    socket.on("voice_offer", async (data) => {
      const sockets = await io.fetchSockets();
      for (const s of sockets) {
        if ((s.data as SocketData).userId === data.to) {
          s.emit("voice_offer", { from: userId, offer: data.offer });
        }
      }
    });

    // --- Voice: WebRTC Answer relay ---
    socket.on("voice_answer", async (data) => {
      const sockets = await io.fetchSockets();
      for (const s of sockets) {
        if ((s.data as SocketData).userId === data.to) {
          s.emit("voice_answer", { from: userId, answer: data.answer });
        }
      }
    });

    // --- Voice: ICE Candidate relay ---
    socket.on("voice_ice_candidate", async (data) => {
      const sockets = await io.fetchSockets();
      for (const s of sockets) {
        if ((s.data as SocketData).userId === data.to) {
          s.emit("voice_ice_candidate", { from: userId, candidate: data.candidate });
        }
      }
    });

    // --- Voice: State Update (mute/deafen) ---
    socket.on("voice_state_update", (data, callback) => {
      try {
        const channelId = userVoiceChannel.get(userId);
        if (!channelId) return callback({ ok: false, error: "Not in a voice channel" });

        const participants = voiceChannels.get(channelId);
        if (!participants) return callback({ ok: false, error: "Voice channel not found" });

        const participant = participants.get(userId);
        if (!participant) return callback({ ok: false, error: "Participant not found" });

        participant.isMuted = data.isMuted;
        participant.isDeafened = data.isDeafened;

        // Broadcast globally for sidebar updates
        io.emit("voice_state_update", { channelId, userId, isMuted: data.isMuted, isDeafened: data.isDeafened });

        callback({ ok: true });
      } catch {
        callback({ ok: false, error: "Failed to update voice state" });
      }
    });

    // --- Voice: Get all voice channel states (for sidebar on connect) ---
    socket.on("get_voice_states", (callback) => {
      const states: VoiceChannelState[] = [];
      for (const [channelId, participants] of voiceChannels) {
        states.push({
          channelId,
          participants: Array.from(participants.values()),
        });
      }
      callback(states);
    });
  });

  return io;
}
