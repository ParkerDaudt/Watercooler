import type { FastifyInstance } from "fastify";
import { eq, and, asc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db/index.js";
import { createInviteSchema, joinViaInviteSchema } from "@watercooler/shared";
import {
  authHook,
  communityHook,
  requirePermission,
  type AuthedRequest,
} from "../auth.js";

export async function inviteRoutes(app: FastifyInstance) {
  const preHandler = [authHook, communityHook];

  app.get(
    "/api/invites",
    { preHandler: [...preHandler, requirePermission("createInvites")] },
    async (request) => {
      const req = request as AuthedRequest;
      return db
        .select()
        .from(schema.invites)
        .where(eq(schema.invites.communityId, req.communityId));
    }
  );

  app.post(
    "/api/invites",
    { preHandler: [...preHandler, requirePermission("createInvites")] },
    async (request) => {
      const req = request as AuthedRequest;
      const data = createInviteSchema.parse(request.body);

      const [invite] = await db
        .insert(schema.invites)
        .values({
          communityId: req.communityId,
          code: nanoid(12),
          maxUses: data.maxUses,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          createdBy: req.user.id,
        })
        .returning();

      return invite;
    }
  );

  app.delete(
    "/api/invites/:inviteId",
    { preHandler: [...preHandler, requirePermission("createInvites")] },
    async (request, reply) => {
      const req = request as AuthedRequest;
      const { inviteId } = request.params as { inviteId: string };
      const [deleted] = await db.delete(schema.invites)
        .where(and(eq(schema.invites.id, inviteId), eq(schema.invites.communityId, req.communityId)))
        .returning({ id: schema.invites.id });
      if (!deleted) return reply.code(404).send({ error: "Invite not found" });
      return { ok: true };
    }
  );

  // Join via invite code (requires auth but not community membership)
  app.post("/api/invites/join", { preHandler: [authHook] }, async (request, reply) => {
    const req = request as AuthedRequest;
    const data = joinViaInviteSchema.parse(request.body);

    const [invite] = await db
      .select()
      .from(schema.invites)
      .where(eq(schema.invites.code, data.code))
      .limit(1);

    if (!invite) {
      return reply.code(404).send({ error: "Invalid invite code" });
    }

    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return reply.code(410).send({ error: "Invite has expired" });
    }

    if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
      return reply.code(410).send({ error: "Invite has reached max uses" });
    }

    // Check if already a member
    const [existing] = await db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, req.user.id),
          eq(schema.memberships.communityId, invite.communityId)
        )
      )
      .limit(1);

    if (existing) {
      return reply.code(409).send({ error: "Already a member" });
    }

    const [newMembership] = await db.insert(schema.memberships).values({
      userId: req.user.id,
      communityId: invite.communityId,
      role: "member",
    }).returning();

    // Assign default (@everyone) role
    const [everyoneRole] = await db.select().from(schema.roles)
      .where(and(eq(schema.roles.communityId, invite.communityId), eq(schema.roles.isEveryone, true)))
      .limit(1);
    if (everyoneRole) {
      await db.insert(schema.userRoles).values({ membershipId: newMembership.id, roleId: everyoneRole.id }).onConflictDoNothing();
    }

    await db
      .update(schema.invites)
      .set({ uses: sql`${schema.invites.uses} + 1` })
      .where(eq(schema.invites.id, invite.id));

    return { ok: true, communityId: invite.communityId };
  });
}
