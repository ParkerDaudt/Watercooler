import type { FastifyInstance } from "fastify";
import { eq, asc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { createCategorySchema, updateCategorySchema } from "@watercooler/shared";
import {
  authHook,
  communityHook,
  requireRole,
  type AuthedRequest,
} from "../auth.js";
import { getIO } from "../socket.js";

export async function categoryRoutes(app: FastifyInstance) {
  const preHandler = [authHook, communityHook];

  // List categories
  app.get("/api/categories", { preHandler }, async (request) => {
    const req = request as AuthedRequest;
    return db
      .select()
      .from(schema.channelCategories)
      .where(eq(schema.channelCategories.communityId, req.communityId))
      .orderBy(asc(schema.channelCategories.sortOrder));
  });

  // Create category
  app.post(
    "/api/categories",
    { preHandler: [...preHandler, requireRole("owner", "moderator")] },
    async (request) => {
      const req = request as AuthedRequest;
      const data = createCategorySchema.parse(request.body);

      const [category] = await db
        .insert(schema.channelCategories)
        .values({
          communityId: req.communityId,
          name: data.name,
          sortOrder: data.sortOrder,
        })
        .returning();

      const io = getIO();
      io.emit("category_created", {
        ...category,
        createdAt: category.createdAt.toISOString(),
      });

      return category;
    }
  );

  // Update category
  app.patch(
    "/api/categories/:categoryId",
    { preHandler: [...preHandler, requireRole("owner", "moderator")] },
    async (request) => {
      const { categoryId } = request.params as { categoryId: string };
      const data = updateCategorySchema.parse(request.body);

      const [category] = await db
        .update(schema.channelCategories)
        .set(data)
        .where(eq(schema.channelCategories.id, categoryId))
        .returning();

      const io = getIO();
      io.emit("category_updated", {
        ...category,
        createdAt: category.createdAt.toISOString(),
      });

      return category;
    }
  );

  // Delete category
  app.delete(
    "/api/categories/:categoryId",
    { preHandler: [...preHandler, requireRole("owner", "moderator")] },
    async (request) => {
      const { categoryId } = request.params as { categoryId: string };

      // Nullify channels' categoryId first
      await db
        .update(schema.channels)
        .set({ categoryId: null })
        .where(eq(schema.channels.categoryId, categoryId));

      await db
        .delete(schema.channelCategories)
        .where(eq(schema.channelCategories.id, categoryId));

      const io = getIO();
      io.emit("category_deleted", { categoryId });

      return { ok: true };
    }
  );
}
