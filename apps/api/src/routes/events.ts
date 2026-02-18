import type { FastifyInstance } from "fastify";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { createEventSchema, updateEventSchema, rsvpSchema } from "@watercooler/shared";
import { authHook, communityHook, requireNotTimedOut, type AuthedRequest } from "../auth.js";

export async function eventRoutes(app: FastifyInstance) {
  const preHandler = [authHook, communityHook];

  app.get("/api/events", { preHandler }, async (request) => {
    const req = request as AuthedRequest;

    const rows = await db
      .select({
        id: schema.events.id,
        communityId: schema.events.communityId,
        createdBy: schema.events.createdBy,
        title: schema.events.title,
        description: schema.events.description,
        locationText: schema.events.locationText,
        startsAt: schema.events.startsAt,
        endsAt: schema.events.endsAt,
        createdAt: schema.events.createdAt,
        creatorUsername: schema.users.username,
      })
      .from(schema.events)
      .innerJoin(schema.users, eq(schema.events.createdBy, schema.users.id))
      .where(eq(schema.events.communityId, req.communityId))
      .orderBy(desc(schema.events.startsAt));

    // Get RSVP counts and user's RSVP
    const result = [];
    for (const row of rows) {
      const counts = await db
        .select({
          status: schema.eventRsvps.status,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.eventRsvps)
        .where(eq(schema.eventRsvps.eventId, row.id))
        .groupBy(schema.eventRsvps.status);

      const [myRsvp] = await db
        .select()
        .from(schema.eventRsvps)
        .where(
          and(
            eq(schema.eventRsvps.eventId, row.id),
            eq(schema.eventRsvps.userId, req.user.id)
          )
        )
        .limit(1);

      const rsvpCounts = { going: 0, interested: 0, not_going: 0 };
      for (const c of counts) {
        rsvpCounts[c.status as keyof typeof rsvpCounts] = c.count;
      }

      result.push({
        ...row,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        creator: { id: row.createdBy, username: row.creatorUsername },
        rsvpCounts,
        myRsvp: myRsvp?.status ?? null,
      });
    }

    return result;
  });

  app.get("/api/events/:eventId", { preHandler }, async (request) => {
    const req = request as AuthedRequest;
    const { eventId } = request.params as { eventId: string };

    const [row] = await db
      .select({
        id: schema.events.id,
        communityId: schema.events.communityId,
        createdBy: schema.events.createdBy,
        title: schema.events.title,
        description: schema.events.description,
        locationText: schema.events.locationText,
        startsAt: schema.events.startsAt,
        endsAt: schema.events.endsAt,
        createdAt: schema.events.createdAt,
        creatorUsername: schema.users.username,
      })
      .from(schema.events)
      .innerJoin(schema.users, eq(schema.events.createdBy, schema.users.id))
      .where(eq(schema.events.id, eventId))
      .limit(1);

    if (!row) return { error: "Event not found" };

    const counts = await db
      .select({
        status: schema.eventRsvps.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.eventRsvps)
      .where(eq(schema.eventRsvps.eventId, row.id))
      .groupBy(schema.eventRsvps.status);

    const [myRsvp] = await db
      .select()
      .from(schema.eventRsvps)
      .where(
        and(
          eq(schema.eventRsvps.eventId, row.id),
          eq(schema.eventRsvps.userId, req.user.id)
        )
      )
      .limit(1);

    const rsvpCounts = { going: 0, interested: 0, not_going: 0 };
    for (const c of counts) {
      rsvpCounts[c.status as keyof typeof rsvpCounts] = c.count;
    }

    return {
      ...row,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      creator: { id: row.createdBy, username: row.creatorUsername },
      rsvpCounts,
      myRsvp: myRsvp?.status ?? null,
    };
  });

  app.post(
    "/api/events",
    { preHandler: [...preHandler, requireNotTimedOut] },
    async (request) => {
      const req = request as AuthedRequest;
      const data = createEventSchema.parse(request.body);

      const [event] = await db
        .insert(schema.events)
        .values({
          communityId: req.communityId,
          createdBy: req.user.id,
          title: data.title,
          description: data.description,
          locationText: data.locationText,
          startsAt: new Date(data.startsAt),
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
        })
        .returning();

      return {
        ...event,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt?.toISOString() ?? null,
        createdAt: event.createdAt.toISOString(),
      };
    }
  );

  app.patch(
    "/api/events/:eventId",
    { preHandler: [...preHandler, requireNotTimedOut] },
    async (request, reply) => {
      const req = request as AuthedRequest;
      const { eventId } = request.params as { eventId: string };
      const data = updateEventSchema.parse(request.body);

      const [existing] = await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, eventId))
        .limit(1);

      if (!existing) return reply.code(404).send({ error: "Event not found" });
      if (
        existing.createdBy !== req.user.id &&
        !["owner", "moderator"].includes(req.membership.role)
      ) {
        return reply.code(403).send({ error: "Not authorized" });
      }

      const updates: Record<string, unknown> = {};
      if (data.title !== undefined) updates.title = data.title;
      if (data.description !== undefined) updates.description = data.description;
      if (data.locationText !== undefined) updates.locationText = data.locationText;
      if (data.startsAt !== undefined) updates.startsAt = new Date(data.startsAt);
      if (data.endsAt !== undefined) updates.endsAt = data.endsAt ? new Date(data.endsAt) : null;

      const [event] = await db
        .update(schema.events)
        .set(updates)
        .where(eq(schema.events.id, eventId))
        .returning();

      return event;
    }
  );

  app.delete(
    "/api/events/:eventId",
    { preHandler: [...preHandler, requireNotTimedOut] },
    async (request, reply) => {
      const req = request as AuthedRequest;
      const { eventId } = request.params as { eventId: string };

      const [existing] = await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, eventId))
        .limit(1);

      if (!existing) return reply.code(404).send({ error: "Event not found" });
      if (
        existing.createdBy !== req.user.id &&
        !["owner", "moderator"].includes(req.membership.role)
      ) {
        return reply.code(403).send({ error: "Not authorized" });
      }

      await db.delete(schema.events).where(eq(schema.events.id, eventId));
      return { ok: true };
    }
  );

  // RSVP
  app.post(
    "/api/events/:eventId/rsvp",
    { preHandler: [...preHandler, requireNotTimedOut] },
    async (request) => {
      const req = request as AuthedRequest;
      const { eventId } = request.params as { eventId: string };
      const data = rsvpSchema.parse(request.body);

      const [existing] = await db
        .select()
        .from(schema.eventRsvps)
        .where(
          and(
            eq(schema.eventRsvps.eventId, eventId),
            eq(schema.eventRsvps.userId, req.user.id)
          )
        )
        .limit(1);

      if (existing) {
        await db
          .update(schema.eventRsvps)
          .set({ status: data.status })
          .where(eq(schema.eventRsvps.id, existing.id));
      } else {
        await db.insert(schema.eventRsvps).values({
          eventId,
          userId: req.user.id,
          status: data.status,
        });
      }

      return { ok: true, status: data.status };
    }
  );
}
