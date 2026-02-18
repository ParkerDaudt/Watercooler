import type { FastifyInstance } from "fastify";
import { eq, and, desc, asc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import {
  authHook,
  communityHook,
  requirePermission,
  type AuthedRequest,
} from "../auth.js";
import {
  getUserHighestRolePosition,
  clearPermissionsCache,
} from "../services/permissions.js";

export async function roleRoutes(app: FastifyInstance) {
  const preHandler = [authHook, communityHook];
  const roleManagerOnly = [...preHandler, requirePermission("manageRoles")];

  // List all roles in community
  app.get("/api/roles", { preHandler }, async (request) => {
    const req = request as AuthedRequest;

    const rows = await db
      .select({
        id: schema.roles.id,
        communityId: schema.roles.communityId,
        name: schema.roles.name,
        color: schema.roles.color,
        position: schema.roles.position,
        isDefault: schema.roles.isDefault,
        isEveryone: schema.roles.isEveryone,
        createdAt: schema.roles.createdAt,
        updatedAt: schema.roles.updatedAt,
        manageCommunity: schema.rolePermissions.manageCommunity,
        manageRoles: schema.rolePermissions.manageRoles,
        manageChannels: schema.rolePermissions.manageChannels,
        manageMembers: schema.rolePermissions.manageMembers,
        createInvites: schema.rolePermissions.createInvites,
        sendMessages: schema.rolePermissions.sendMessages,
        manageMessages: schema.rolePermissions.manageMessages,
        pinMessages: schema.rolePermissions.pinMessages,
        kickMembers: schema.rolePermissions.kickMembers,
        banMembers: schema.rolePermissions.banMembers,
        timeoutMembers: schema.rolePermissions.timeoutMembers,
      })
      .from(schema.roles)
      .leftJoin(schema.rolePermissions, eq(schema.roles.id, schema.rolePermissions.roleId))
      .where(eq(schema.roles.communityId, req.communityId))
      .orderBy(asc(schema.roles.position));

    return rows.map((r) => ({
      id: r.id,
      communityId: r.communityId,
      name: r.name,
      color: r.color,
      position: r.position,
      isDefault: r.isDefault,
      isEveryone: r.isEveryone,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      permissions: {
        manageCommunity: r.manageCommunity ?? false,
        manageRoles: r.manageRoles ?? false,
        manageChannels: r.manageChannels ?? false,
        manageMembers: r.manageMembers ?? false,
        createInvites: r.createInvites ?? false,
        sendMessages: r.sendMessages ?? true,
        manageMessages: r.manageMessages ?? false,
        pinMessages: r.pinMessages ?? false,
        kickMembers: r.kickMembers ?? false,
        banMembers: r.banMembers ?? false,
        timeoutMembers: r.timeoutMembers ?? false,
      },
    }));
  });

  // Create new role
  app.post("/api/roles", { preHandler: roleManagerOnly }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { name, color, permissions } = request.body as {
      name: string;
      color?: string;
      permissions?: Record<string, boolean>;
    };

    if (!name || name.length > 64) {
      return reply.code(400).send({ error: "Role name required (max 64 chars)" });
    }

    // Get max position among non-everyone roles
    const [maxPos] = await db
      .select({ position: schema.roles.position })
      .from(schema.roles)
      .where(
        and(
          eq(schema.roles.communityId, req.communityId),
          eq(schema.roles.isEveryone, false),
        ),
      )
      .orderBy(desc(schema.roles.position))
      .limit(1);

    const newPosition = (maxPos?.position ?? -1) + 1;

    const [role] = await db
      .insert(schema.roles)
      .values({
        communityId: req.communityId,
        name,
        color: color || "#99aab5",
        position: newPosition,
      })
      .returning();

    await db.insert(schema.rolePermissions).values({
      roleId: role.id,
      ...(permissions || {}),
    });

    await db.insert(schema.auditLogs).values({
      communityId: req.communityId,
      actorId: req.user.id,
      action: "role_create",
      targetType: "role",
      targetId: role.id,
      metadata: { name },
    });

    clearPermissionsCache();

    return {
      ...role,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
      permissions: permissions || {},
    };
  });

  // Update role
  app.patch("/api/roles/:roleId", { preHandler: roleManagerOnly }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { roleId } = request.params as { roleId: string };
    const { name, color, permissions } = request.body as {
      name?: string;
      color?: string;
      permissions?: Record<string, boolean>;
    };

    const [role] = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, roleId))
      .limit(1);

    if (!role) return reply.code(404).send({ error: "Role not found" });
    if (role.communityId !== req.communityId) {
      return reply.code(403).send({ error: "Role not in your community" });
    }

    // Check role hierarchy
    const userHighestPos = await getUserHighestRolePosition(req.membership.id);
    if (role.position <= userHighestPos) {
      return reply.code(403).send({ error: "Cannot edit a role equal or above yours" });
    }

    if (name !== undefined || color !== undefined) {
      await db
        .update(schema.roles)
        .set({
          ...(name !== undefined ? { name } : {}),
          ...(color !== undefined ? { color } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.roles.id, roleId));
    }

    if (permissions) {
      await db
        .update(schema.rolePermissions)
        .set(permissions)
        .where(eq(schema.rolePermissions.roleId, roleId));
    }

    await db.insert(schema.auditLogs).values({
      communityId: req.communityId,
      actorId: req.user.id,
      action: "role_update",
      targetType: "role",
      targetId: roleId,
      metadata: { name: name || role.name },
    });

    clearPermissionsCache();

    return { ok: true };
  });

  // Delete role
  app.delete("/api/roles/:roleId", { preHandler: roleManagerOnly }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { roleId } = request.params as { roleId: string };

    const [role] = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, roleId))
      .limit(1);

    if (!role) return reply.code(404).send({ error: "Role not found" });
    if (role.communityId !== req.communityId) {
      return reply.code(403).send({ error: "Role not in your community" });
    }
    if (role.isEveryone) {
      return reply.code(403).send({ error: "Cannot delete the @everyone role" });
    }
    if (role.position === 0) {
      return reply.code(403).send({ error: "Cannot delete the Owner role" });
    }

    const userHighestPos = await getUserHighestRolePosition(req.membership.id);
    if (role.position <= userHighestPos) {
      return reply.code(403).send({ error: "Cannot delete a role equal or above yours" });
    }

    await db.delete(schema.roles).where(eq(schema.roles.id, roleId));

    await db.insert(schema.auditLogs).values({
      communityId: req.communityId,
      actorId: req.user.id,
      action: "role_delete",
      targetType: "role",
      targetId: roleId,
      metadata: { name: role.name },
    });

    clearPermissionsCache();

    return { ok: true };
  });

  // Assign role to user
  app.post("/api/members/:userId/roles/:roleId", { preHandler: roleManagerOnly }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { userId, roleId } = request.params as { userId: string; roleId: string };

    const [role] = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, roleId))
      .limit(1);

    if (!role) return reply.code(404).send({ error: "Role not found" });
    if (role.communityId !== req.communityId) {
      return reply.code(403).send({ error: "Role not in your community" });
    }
    if (role.isEveryone) {
      return reply.code(400).send({ error: "Cannot manually assign the @everyone role" });
    }

    const userHighestPos = await getUserHighestRolePosition(req.membership.id);
    if (role.position <= userHighestPos) {
      return reply.code(403).send({ error: "Cannot assign a role equal or above yours" });
    }

    const [membership] = await db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.communityId, req.communityId),
        ),
      )
      .limit(1);

    if (!membership) return reply.code(404).send({ error: "Member not found" });

    await db
      .insert(schema.userRoles)
      .values({ membershipId: membership.id, roleId })
      .onConflictDoNothing();

    clearPermissionsCache(membership.id);

    return { ok: true };
  });

  // Remove role from user
  app.delete("/api/members/:userId/roles/:roleId", { preHandler: roleManagerOnly }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { userId, roleId } = request.params as { userId: string; roleId: string };

    const [role] = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, roleId))
      .limit(1);

    if (!role) return reply.code(404).send({ error: "Role not found" });
    if (role.isEveryone) {
      return reply.code(400).send({ error: "Cannot remove the @everyone role" });
    }

    const userHighestPos = await getUserHighestRolePosition(req.membership.id);
    if (role.position <= userHighestPos) {
      return reply.code(403).send({ error: "Cannot remove a role equal or above yours" });
    }

    const [membership] = await db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.communityId, req.communityId),
        ),
      )
      .limit(1);

    if (!membership) return reply.code(404).send({ error: "Member not found" });

    await db
      .delete(schema.userRoles)
      .where(
        and(
          eq(schema.userRoles.membershipId, membership.id),
          eq(schema.userRoles.roleId, roleId),
        ),
      );

    clearPermissionsCache(membership.id);

    return { ok: true };
  });

  // Get a member's roles
  app.get("/api/members/:userId/roles", { preHandler }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { userId } = request.params as { userId: string };

    const [membership] = await db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.communityId, req.communityId),
        ),
      )
      .limit(1);

    if (!membership) return reply.code(404).send({ error: "Member not found" });

    const roles = await db
      .select({
        id: schema.roles.id,
        name: schema.roles.name,
        color: schema.roles.color,
        position: schema.roles.position,
      })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
      .where(eq(schema.userRoles.membershipId, membership.id))
      .orderBy(asc(schema.roles.position));

    return roles;
  });

  // Get my permissions
  app.get("/api/permissions/me", { preHandler }, async (request) => {
    const req = request as AuthedRequest;
    return req.permissions;
  });
}
