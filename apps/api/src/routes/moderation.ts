import type { FastifyInstance } from "fastify";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "../db/index.js";
import {
  kickSchema,
  banSchema,
  timeoutSchema,
  deleteMessageSchema,
  createReportSchema,
  updateReportSchema,
  warnSchema,
  reportActionSchema,
} from "@watercooler/shared";
import {
  authHook,
  communityHook,
  requirePermission,
  type AuthedRequest,
} from "../auth.js";

export async function moderationRoutes(app: FastifyInstance) {
  const preHandler = [authHook, communityHook];
  // Kick
  app.post("/api/mod/kick", { preHandler: [...preHandler, requirePermission("kickMembers")] }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { userId } = kickSchema.parse(request.body);

    const [target] = await db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.communityId, req.communityId)
        )
      )
      .limit(1);

    if (!target) return reply.code(404).send({ error: "User not found" });
    if (target.role === "owner") return reply.code(403).send({ error: "Cannot kick owner" });

    await db.delete(schema.memberships).where(eq(schema.memberships.id, target.id));

    await db.insert(schema.auditLogs).values({
      communityId: req.communityId,
      actorId: req.user.id,
      action: "kick",
      targetType: "user",
      targetId: userId,
    });

    return { ok: true };
  });

  // Ban
  app.post("/api/mod/ban", { preHandler: [...preHandler, requirePermission("banMembers")] }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { userId, reason } = banSchema.parse(request.body);

    const [target] = await db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.communityId, req.communityId)
        )
      )
      .limit(1);

    if (!target) return reply.code(404).send({ error: "User not found" });
    if (target.role === "owner") return reply.code(403).send({ error: "Cannot ban owner" });

    await db
      .update(schema.memberships)
      .set({ status: "banned" })
      .where(eq(schema.memberships.id, target.id));

    await db.insert(schema.auditLogs).values({
      communityId: req.communityId,
      actorId: req.user.id,
      action: "ban",
      targetType: "user",
      targetId: userId,
      metadata: { reason },
    });

    return { ok: true };
  });

  // Timeout
  app.post("/api/mod/timeout", { preHandler: [...preHandler, requirePermission("timeoutMembers")] }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { userId, until } = timeoutSchema.parse(request.body);

    const [target] = await db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.communityId, req.communityId)
        )
      )
      .limit(1);

    if (!target) return reply.code(404).send({ error: "User not found" });
    if (target.role === "owner") return reply.code(403).send({ error: "Cannot timeout owner" });

    await db
      .update(schema.memberships)
      .set({ status: "timeout", timeoutUntil: new Date(until) })
      .where(eq(schema.memberships.id, target.id));

    await db.insert(schema.auditLogs).values({
      communityId: req.communityId,
      actorId: req.user.id,
      action: "timeout",
      targetType: "user",
      targetId: userId,
      metadata: { until },
    });

    return { ok: true };
  });

  // Delete message
  app.post("/api/mod/delete-message", { preHandler: [...preHandler, requirePermission("manageMessages")] }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { messageId } = deleteMessageSchema.parse(request.body);

    const [msg] = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, messageId))
      .limit(1);

    if (!msg) return reply.code(404).send({ error: "Message not found" });

    await db.delete(schema.messages).where(eq(schema.messages.id, messageId));

    await db.insert(schema.auditLogs).values({
      communityId: req.communityId,
      actorId: req.user.id,
      action: "delete_message",
      targetType: "message",
      targetId: messageId,
    });

    return { ok: true, channelId: msg.channelId };
  });

  // Members list
  app.get("/api/members", { preHandler }, async (request) => {
    const req = request as AuthedRequest;
    return db
      .select({
        id: schema.memberships.id,
        userId: schema.memberships.userId,
        role: schema.memberships.role,
        status: schema.memberships.status,
        timeoutUntil: schema.memberships.timeoutUntil,
        joinedAt: schema.memberships.joinedAt,
        username: schema.users.username,
        email: schema.users.email,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(eq(schema.memberships.communityId, req.communityId));
  });

  // Update member role
  app.patch(
    "/api/members/:userId/role",
    { preHandler: [...preHandler, requirePermission("manageRoles")] },
    async (request, reply) => {
      const req = request as AuthedRequest;
      const { userId } = request.params as { userId: string };
      const { role } = request.body as { role: string };

      if (!["moderator", "member"].includes(role)) {
        return reply.code(400).send({ error: "Invalid role" });
      }

      await db
        .update(schema.memberships)
        .set({ role })
        .where(
          and(
            eq(schema.memberships.userId, userId),
            eq(schema.memberships.communityId, req.communityId)
          )
        );

      return { ok: true };
    }
  );

  // Unban
  app.post("/api/mod/unban", { preHandler: [...preHandler, requirePermission("banMembers")] }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { userId } = kickSchema.parse(request.body);

    const [target] = await db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.communityId, req.communityId)
        )
      )
      .limit(1);

    if (!target) return reply.code(404).send({ error: "User not found" });
    if (target.status !== "banned") return reply.code(400).send({ error: "User is not banned" });

    await db
      .update(schema.memberships)
      .set({ status: "active" })
      .where(eq(schema.memberships.id, target.id));

    await db.insert(schema.auditLogs).values({
      communityId: req.communityId,
      actorId: req.user.id,
      action: "unban",
      targetType: "user",
      targetId: userId,
    });

    return { ok: true };
  });

  // Warn / Strike
  app.post("/api/mod/warn", { preHandler: [...preHandler, requirePermission("manageMembers")] }, async (request, reply) => {
    const req = request as AuthedRequest;
    const data = warnSchema.parse(request.body);

    const [target] = await db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, data.userId),
          eq(schema.memberships.communityId, req.communityId)
        )
      )
      .limit(1);

    if (!target) return reply.code(404).send({ error: "User not found" });
    if (target.role === "owner") return reply.code(403).send({ error: "Cannot warn owner" });

    const [warning] = await db.insert(schema.warnings).values({
      communityId: req.communityId,
      userId: data.userId,
      moderatorId: req.user.id,
      reason: data.reason,
      severity: data.severity,
    }).returning();

    await db.insert(schema.auditLogs).values({
      communityId: req.communityId,
      actorId: req.user.id,
      action: data.severity === "strike" ? "strike" : "warn",
      targetType: "user",
      targetId: data.userId,
      metadata: { reason: data.reason },
    });

    // Check if 3 strikes → auto-ban
    if (data.severity === "strike") {
      const [{ strikeCount }] = await db
        .select({ strikeCount: count() })
        .from(schema.warnings)
        .where(
          and(
            eq(schema.warnings.communityId, req.communityId),
            eq(schema.warnings.userId, data.userId),
            eq(schema.warnings.severity, "strike")
          )
        );

      if (Number(strikeCount) >= 3) {
        await db
          .update(schema.memberships)
          .set({ status: "banned" })
          .where(eq(schema.memberships.id, target.id));

        await db.insert(schema.auditLogs).values({
          communityId: req.communityId,
          actorId: req.user.id,
          action: "auto_ban",
          targetType: "user",
          targetId: data.userId,
          metadata: { reason: "Automatic ban: 3 strikes reached" },
        });

        return { ...warning, autoBanned: true };
      }
    }

    return warning;
  });

  // Get warnings for a user
  app.get("/api/mod/warnings/:userId", { preHandler: [...preHandler, requirePermission("manageMembers")] }, async (request) => {
    const req = request as AuthedRequest;
    const { userId } = request.params as { userId: string };

    const moderatorAlias = alias(schema.users, "moderator");

    return db
      .select({
        id: schema.warnings.id,
        communityId: schema.warnings.communityId,
        userId: schema.warnings.userId,
        moderatorId: schema.warnings.moderatorId,
        reason: schema.warnings.reason,
        severity: schema.warnings.severity,
        createdAt: schema.warnings.createdAt,
        moderatorUsername: moderatorAlias.username,
      })
      .from(schema.warnings)
      .innerJoin(moderatorAlias, eq(schema.warnings.moderatorId, moderatorAlias.id))
      .where(
        and(
          eq(schema.warnings.communityId, req.communityId),
          eq(schema.warnings.userId, userId)
        )
      )
      .orderBy(desc(schema.warnings.createdAt));
  });

  // Delete a warning
  app.delete("/api/mod/warnings/:warningId", { preHandler: [...preHandler, requirePermission("manageMembers")] }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { warningId } = request.params as { warningId: string };

    const [warning] = await db
      .select()
      .from(schema.warnings)
      .where(
        and(
          eq(schema.warnings.id, warningId),
          eq(schema.warnings.communityId, req.communityId)
        )
      )
      .limit(1);

    if (!warning) return reply.code(404).send({ error: "Warning not found" });

    await db.delete(schema.warnings).where(eq(schema.warnings.id, warningId));

    await db.insert(schema.auditLogs).values({
      communityId: req.communityId,
      actorId: req.user.id,
      action: "remove_warning",
      targetType: "user",
      targetId: warning.userId,
      metadata: { reason: warning.reason, severity: warning.severity },
    });

    return { ok: true };
  });

  // Reports
  app.post("/api/reports", { preHandler }, async (request) => {
    const req = request as AuthedRequest;
    const data = createReportSchema.parse(request.body);

    const [msg] = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, data.messageId))
      .limit(1);

    if (!msg) return { error: "Message not found" };

    const [report] = await db
      .insert(schema.reports)
      .values({
        communityId: req.communityId,
        channelId: msg.channelId,
        messageId: data.messageId,
        reporterId: req.user.id,
        reason: data.reason,
      })
      .returning();

    return report;
  });

  app.get("/api/reports", { preHandler: [...preHandler, requirePermission("manageMembers")] }, async (request) => {
    const req = request as AuthedRequest;
    const reporterAlias = alias(schema.users, "reporter");
    const authorAlias = alias(schema.users, "author");

    return db
      .select({
        id: schema.reports.id,
        communityId: schema.reports.communityId,
        channelId: schema.reports.channelId,
        messageId: schema.reports.messageId,
        reporterId: schema.reports.reporterId,
        reason: schema.reports.reason,
        status: schema.reports.status,
        createdAt: schema.reports.createdAt,
        reporterUsername: reporterAlias.username,
        messageContent: schema.messages.content,
        messageAuthorId: schema.messages.userId,
        messageAuthorUsername: authorAlias.username,
      })
      .from(schema.reports)
      .innerJoin(reporterAlias, eq(schema.reports.reporterId, reporterAlias.id))
      .leftJoin(schema.messages, eq(schema.reports.messageId, schema.messages.id))
      .leftJoin(authorAlias, eq(schema.messages.userId, authorAlias.id))
      .where(eq(schema.reports.communityId, req.communityId))
      .orderBy(desc(schema.reports.createdAt));
  });

  app.patch("/api/reports/:reportId", { preHandler: [...preHandler, requirePermission("manageMembers")] }, async (request) => {
    const { reportId } = request.params as { reportId: string };
    const data = updateReportSchema.parse(request.body);

    const [report] = await db
      .update(schema.reports)
      .set({ status: data.status })
      .where(eq(schema.reports.id, reportId))
      .returning();

    return report;
  });

  // Take action on a report
  app.post("/api/reports/:reportId/action", { preHandler: [...preHandler, requirePermission("manageMembers")] }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { reportId } = request.params as { reportId: string };
    const data = reportActionSchema.parse(request.body);

    // Get the report with message info
    const [report] = await db
      .select({
        id: schema.reports.id,
        messageId: schema.reports.messageId,
        status: schema.reports.status,
      })
      .from(schema.reports)
      .where(
        and(
          eq(schema.reports.id, reportId),
          eq(schema.reports.communityId, req.communityId)
        )
      )
      .limit(1);

    if (!report) return reply.code(404).send({ error: "Report not found" });

    // Get the message author
    const [msg] = await db
      .select({ userId: schema.messages.userId })
      .from(schema.messages)
      .where(eq(schema.messages.id, report.messageId))
      .limit(1);

    if (!msg) return reply.code(404).send({ error: "Message no longer exists" });

    const targetUserId = msg.userId;

    // Get target membership
    const [target] = await db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, targetUserId),
          eq(schema.memberships.communityId, req.communityId)
        )
      )
      .limit(1);

    if (!target) return reply.code(404).send({ error: "User not found in community" });
    if (target.role === "owner") return reply.code(403).send({ error: "Cannot take action against owner" });

    // Execute the action
    const reason = data.reason || "Action from report review";

    if (data.action === "warn") {
      await db.insert(schema.warnings).values({
        communityId: req.communityId,
        userId: targetUserId,
        moderatorId: req.user.id,
        reason,
        severity: "warning",
      });
      await db.insert(schema.auditLogs).values({
        communityId: req.communityId, actorId: req.user.id,
        action: "warn", targetType: "user", targetId: targetUserId,
        metadata: { reason },
      });
    } else if (data.action === "timeout") {
      const hours = data.timeoutHours || 1;
      const until = new Date(Date.now() + hours * 3600000);
      await db.update(schema.memberships)
        .set({ status: "timeout", timeoutUntil: until })
        .where(eq(schema.memberships.id, target.id));
      await db.insert(schema.auditLogs).values({
        communityId: req.communityId, actorId: req.user.id,
        action: "timeout", targetType: "user", targetId: targetUserId,
        metadata: { until: until.toISOString(), reason },
      });
    } else if (data.action === "kick") {
      await db.delete(schema.memberships).where(eq(schema.memberships.id, target.id));
      await db.insert(schema.auditLogs).values({
        communityId: req.communityId, actorId: req.user.id,
        action: "kick", targetType: "user", targetId: targetUserId,
        metadata: { reason },
      });
    } else if (data.action === "ban") {
      await db.update(schema.memberships)
        .set({ status: "banned" })
        .where(eq(schema.memberships.id, target.id));
      await db.insert(schema.auditLogs).values({
        communityId: req.communityId, actorId: req.user.id,
        action: "ban", targetType: "user", targetId: targetUserId,
        metadata: { reason },
      });
    }

    // Mark report as reviewed
    await db.update(schema.reports)
      .set({ status: "reviewed" })
      .where(eq(schema.reports.id, reportId));

    return { ok: true, action: data.action };
  });

  // Audit logs
  app.get("/api/audit-logs", { preHandler: [...preHandler, requirePermission("manageMembers")] }, async (request) => {
    const req = request as AuthedRequest;
    return db
      .select({
        id: schema.auditLogs.id,
        actorId: schema.auditLogs.actorId,
        action: schema.auditLogs.action,
        targetType: schema.auditLogs.targetType,
        targetId: schema.auditLogs.targetId,
        metadata: schema.auditLogs.metadata,
        createdAt: schema.auditLogs.createdAt,
        actorUsername: schema.users.username,
      })
      .from(schema.auditLogs)
      .innerJoin(schema.users, eq(schema.auditLogs.actorId, schema.users.id))
      .where(eq(schema.auditLogs.communityId, req.communityId))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(200);
  });
}
