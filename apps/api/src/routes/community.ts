import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { updateCommunitySchema } from "@watercooler/shared";
import {
  authHook,
  communityHook,
  requirePermission,
  type AuthedRequest,
} from "../auth.js";

export async function communityRoutes(app: FastifyInstance) {
  const preHandler = [authHook, communityHook];

  app.get("/api/community", { preHandler }, async (request) => {
    const req = request as AuthedRequest;
    const [community] = await db
      .select()
      .from(schema.communities)
      .where(eq(schema.communities.id, req.communityId))
      .limit(1);
    return community;
  });

  app.patch(
    "/api/community",
    { preHandler: [...preHandler, requirePermission("manageCommunity")] },
    async (request) => {
      const req = request as AuthedRequest;
      const data = updateCommunitySchema.parse(request.body);

      const [community] = await db
        .update(schema.communities)
        .set(data)
        .where(eq(schema.communities.id, req.communityId))
        .returning();

      return community;
    }
  );
}
