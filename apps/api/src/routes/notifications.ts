import type { FastifyInstance } from "fastify";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { authHook, communityHook, type AuthedRequest } from "../auth.js";

export async function notificationRoutes(app: FastifyInstance) {
  const preHandler = [authHook, communityHook];

  app.get("/api/notifications", { preHandler }, async (request) => {
    const req = request as AuthedRequest;
    return db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, req.user.id))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(100);
  });

  app.get("/api/notifications/unread-count", { preHandler }, async (request) => {
    const req = request as AuthedRequest;
    const { sql } = await import("drizzle-orm");
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, req.user.id),
          isNull(schema.notifications.readAt)
        )
      );
    return { count: result.count };
  });

  app.post("/api/notifications/mark-read", { preHandler }, async (request) => {
    const req = request as AuthedRequest;
    const { ids } = request.body as { ids?: string[] };

    if (ids && ids.length > 0) {
      const { inArray } = await import("drizzle-orm");
      await db
        .update(schema.notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(schema.notifications.userId, req.user.id),
            inArray(schema.notifications.id, ids)
          )
        );
    } else {
      await db
        .update(schema.notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(schema.notifications.userId, req.user.id),
            isNull(schema.notifications.readAt)
          )
        );
    }

    return { ok: true };
  });
}
