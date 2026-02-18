import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { handleJoinRequestSchema } from "@watercooler/shared";
import {
  authHook,
  communityHook,
  requireRole,
  type AuthedRequest,
} from "../auth.js";

export async function joinRequestRoutes(app: FastifyInstance) {
  const preHandler = [authHook, communityHook];

  // Create join request (user must be authed but not a member)
  app.post("/api/join-requests", { preHandler: [authHook] }, async (request, reply) => {
    const req = request as AuthedRequest;

    const [community] = await db.select().from(schema.communities).limit(1);
    if (!community) return reply.code(404).send({ error: "No community" });
    if (!community.requestToJoin) {
      return reply.code(400).send({ error: "Community does not accept join requests" });
    }

    const [existing] = await db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, req.user.id),
          eq(schema.memberships.communityId, community.id)
        )
      )
      .limit(1);
    if (existing) return reply.code(409).send({ error: "Already a member" });

    const [existingReq] = await db
      .select()
      .from(schema.joinRequests)
      .where(
        and(
          eq(schema.joinRequests.userId, req.user.id),
          eq(schema.joinRequests.communityId, community.id),
          eq(schema.joinRequests.status, "pending")
        )
      )
      .limit(1);
    if (existingReq) return reply.code(409).send({ error: "Request already pending" });

    const [jr] = await db
      .insert(schema.joinRequests)
      .values({ communityId: community.id, userId: req.user.id })
      .returning();

    return jr;
  });

  // List join requests (mod/owner)
  app.get(
    "/api/join-requests",
    { preHandler: [...preHandler, requireRole("owner", "moderator")] },
    async (request) => {
      const req = request as AuthedRequest;
      return db
        .select({
          id: schema.joinRequests.id,
          communityId: schema.joinRequests.communityId,
          userId: schema.joinRequests.userId,
          status: schema.joinRequests.status,
          createdAt: schema.joinRequests.createdAt,
          username: schema.users.username,
        })
        .from(schema.joinRequests)
        .innerJoin(schema.users, eq(schema.joinRequests.userId, schema.users.id))
        .where(eq(schema.joinRequests.communityId, req.communityId));
    }
  );

  // Handle join request
  app.patch(
    "/api/join-requests/:requestId",
    { preHandler: [...preHandler, requireRole("owner", "moderator")] },
    async (request, reply) => {
      const req = request as AuthedRequest;
      const { requestId } = request.params as { requestId: string };
      const data = handleJoinRequestSchema.parse(request.body);

      const [jr] = await db
        .select()
        .from(schema.joinRequests)
        .where(and(eq(schema.joinRequests.id, requestId), eq(schema.joinRequests.communityId, req.communityId)))
        .limit(1);

      if (!jr) return reply.code(404).send({ error: "Not found" });

      await db
        .update(schema.joinRequests)
        .set({ status: data.status })
        .where(eq(schema.joinRequests.id, requestId));

      if (data.status === "approved") {
        await db.insert(schema.memberships).values({
          userId: jr.userId,
          communityId: jr.communityId,
          role: "member",
        });
      }

      return { ok: true };
    }
  );
}
