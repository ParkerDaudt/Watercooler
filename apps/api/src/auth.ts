import { SignJWT, jwtVerify } from "jose";
import type { FastifyRequest, FastifyReply } from "fastify";
import { db, schema } from "./db/index.js";
import { eq, and } from "drizzle-orm";
import { env } from "./env.js";
import { computeEffectivePermissions, type EffectivePermissions } from "./services/permissions.js";

const secret = new TextEncoder().encode(env.SESSION_SECRET);
const ALG = "HS256";

export async function createToken(userId: string, tokenVersion: number = 0): Promise<string> {
  return new SignJWT({ sub: userId, tv: tokenVersion })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<{ userId: string; tokenVersion: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: payload.sub as string,
      tokenVersion: (payload.tv as number) ?? 0,
    };
  } catch {
    return null;
  }
}

export function setAuthCookie(reply: FastifyReply, token: string) {
  reply.setCookie("session", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}

export function clearAuthCookie(reply: FastifyReply) {
  reply.clearCookie("session", { path: "/" });
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
}

export interface AuthedRequest extends FastifyRequest {
  user: AuthUser;
  communityId: string;
  membership: {
    id: string;
    role: string;
    status: string;
    timeoutUntil: Date | null;
  };
  permissions: EffectivePermissions;
}

export async function authHook(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies.session;
  if (!token) {
    reply.code(401).send({ error: "Not authenticated" });
    return;
  }
  const result = await verifyToken(token);
  if (!result) {
    reply.code(401).send({ error: "Invalid session" });
    return;
  }
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email, username: schema.users.username, avatarUrl: schema.users.avatarUrl, tokenVersion: schema.users.tokenVersion })
    .from(schema.users)
    .where(eq(schema.users.id, result.userId))
    .limit(1);
  if (!user) {
    reply.code(401).send({ error: "User not found" });
    return;
  }
  if (user.tokenVersion !== result.tokenVersion) {
    clearAuthCookie(reply);
    reply.code(401).send({ error: "Session expired. Please log in again." });
    return;
  }
  (request as AuthedRequest).user = user;
}

export async function communityHook(request: FastifyRequest, reply: FastifyReply) {
  const user = (request as AuthedRequest).user;
  if (!user) return;

  const [community] = await db
    .select()
    .from(schema.communities)
    .limit(1);

  if (!community) {
    reply.code(404).send({ error: "No community found" });
    return;
  }

  (request as AuthedRequest).communityId = community.id;

  const [membership] = await db
    .select()
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, user.id),
        eq(schema.memberships.communityId, community.id)
      )
    )
    .limit(1);

  if (!membership) {
    reply.code(403).send({ error: "Not a member of this community" });
    return;
  }

  if (membership.status === "banned") {
    reply.code(403).send({ error: "You are banned from this community" });
    return;
  }

  if (
    membership.status === "timeout" &&
    membership.timeoutUntil &&
    new Date(membership.timeoutUntil) > new Date()
  ) {
    // Timeout users can read but not write - we'll check in write routes
  }

  (request as AuthedRequest).membership = {
    id: membership.id,
    role: membership.role,
    status: membership.status,
    timeoutUntil: membership.timeoutUntil,
  };

  // Compute effective permissions from custom roles
  const permissions = await computeEffectivePermissions(membership.id);
  (request as AuthedRequest).permissions = permissions;
}

/** Verify the user can access the given channel (community or DM membership). */
export async function verifyChannelAccess(
  channelId: string,
  userId: string,
  communityId: string,
): Promise<{ ok: true; channel: { id: string; type: string; isPrivate: boolean; isAnnouncement: boolean; communityId: string | null } } | { ok: false; error: string; code: number }> {
  const [channel] = await db
    .select({ id: schema.channels.id, type: schema.channels.type, isPrivate: schema.channels.isPrivate, isAnnouncement: schema.channels.isAnnouncement, communityId: schema.channels.communityId })
    .from(schema.channels)
    .where(eq(schema.channels.id, channelId))
    .limit(1);

  if (!channel) return { ok: false, error: "Channel not found", code: 404 };

  if (channel.type === "dm") {
    const [participant] = await db
      .select({ id: schema.dmParticipants.id })
      .from(schema.dmParticipants)
      .where(and(eq(schema.dmParticipants.channelId, channelId), eq(schema.dmParticipants.userId, userId)))
      .limit(1);
    if (!participant) return { ok: false, error: "Not a participant of this conversation", code: 403 };
  } else {
    if (channel.communityId !== communityId) return { ok: false, error: "Channel not found", code: 404 };
    if (channel.isPrivate) {
      const [member] = await db
        .select({ id: schema.channelMembers.id })
        .from(schema.channelMembers)
        .where(and(eq(schema.channelMembers.channelId, channelId), eq(schema.channelMembers.userId, userId)))
        .limit(1);
      if (!member) return { ok: false, error: "No access to this channel", code: 403 };
    }
  }

  return { ok: true, channel };
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as AuthedRequest;
    if (!roles.includes(req.membership.role)) {
      reply.code(403).send({ error: "Insufficient permissions" });
    }
  };
}

export function requirePermission(...perms: (keyof EffectivePermissions)[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as AuthedRequest;
    for (const perm of perms) {
      if (!req.permissions[perm]) {
        reply.code(403).send({ error: "Insufficient permissions" });
        return;
      }
    }
  };
}

export async function requireNotTimedOut(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthedRequest;
  if (
    req.membership.status === "timeout" &&
    req.membership.timeoutUntil &&
    new Date(req.membership.timeoutUntil) > new Date()
  ) {
    reply.code(403).send({ error: "You are timed out" });
  }
}
