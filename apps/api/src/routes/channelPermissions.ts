import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { authHook, communityHook, requirePermission, type AuthedRequest } from "../auth.js";
import { clearPermissionsCache } from "../services/permissions.js";

export async function channelPermissionRoutes(app: FastifyInstance) {
  const preHandler = [authHook, communityHook, requirePermission("manageChannels")];

  // List permission overrides for a channel
  app.get("/api/channels/:channelId/permission-overrides", { preHandler }, async (request) => {
    const { channelId } = request.params as { channelId: string };

    const overrides = await db
      .select({
        id: schema.channelPermissionOverrides.id,
        channelId: schema.channelPermissionOverrides.channelId,
        roleId: schema.channelPermissionOverrides.roleId,
        sendMessages: schema.channelPermissionOverrides.sendMessages,
        manageMessages: schema.channelPermissionOverrides.manageMessages,
        pinMessages: schema.channelPermissionOverrides.pinMessages,
        roleName: schema.roles.name,
        roleColor: schema.roles.color,
      })
      .from(schema.channelPermissionOverrides)
      .innerJoin(schema.roles, eq(schema.channelPermissionOverrides.roleId, schema.roles.id))
      .where(eq(schema.channelPermissionOverrides.channelId, channelId));

    return overrides;
  });

  // Upsert a permission override for a role on a channel
  app.put("/api/channels/:channelId/permission-overrides/:roleId", { preHandler }, async (request, reply) => {
    const { channelId, roleId } = request.params as { channelId: string; roleId: string };
    const body = request.body as {
      sendMessages?: boolean | null;
      manageMessages?: boolean | null;
      pinMessages?: boolean | null;
    };

    // Verify channel exists
    const [channel] = await db
      .select({ id: schema.channels.id })
      .from(schema.channels)
      .where(eq(schema.channels.id, channelId))
      .limit(1);
    if (!channel) return reply.code(404).send({ error: "Channel not found" });

    // Verify role exists
    const [role] = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.id, roleId))
      .limit(1);
    if (!role) return reply.code(404).send({ error: "Role not found" });

    // Check if override exists
    const [existing] = await db
      .select({ id: schema.channelPermissionOverrides.id })
      .from(schema.channelPermissionOverrides)
      .where(
        and(
          eq(schema.channelPermissionOverrides.channelId, channelId),
          eq(schema.channelPermissionOverrides.roleId, roleId)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(schema.channelPermissionOverrides)
        .set({
          sendMessages: body.sendMessages ?? null,
          manageMessages: body.manageMessages ?? null,
          pinMessages: body.pinMessages ?? null,
        })
        .where(eq(schema.channelPermissionOverrides.id, existing.id));
    } else {
      await db.insert(schema.channelPermissionOverrides).values({
        channelId,
        roleId,
        sendMessages: body.sendMessages ?? null,
        manageMessages: body.manageMessages ?? null,
        pinMessages: body.pinMessages ?? null,
      });
    }

    clearPermissionsCache();
    return { ok: true };
  });

  // Delete a permission override
  app.delete("/api/channels/:channelId/permission-overrides/:roleId", { preHandler }, async (request, reply) => {
    const { channelId, roleId } = request.params as { channelId: string; roleId: string };

    const [existing] = await db
      .select({ id: schema.channelPermissionOverrides.id })
      .from(schema.channelPermissionOverrides)
      .where(
        and(
          eq(schema.channelPermissionOverrides.channelId, channelId),
          eq(schema.channelPermissionOverrides.roleId, roleId)
        )
      )
      .limit(1);

    if (!existing) return reply.code(404).send({ error: "Override not found" });

    await db
      .delete(schema.channelPermissionOverrides)
      .where(eq(schema.channelPermissionOverrides.id, existing.id));

    clearPermissionsCache();
    return { ok: true };
  });
}
