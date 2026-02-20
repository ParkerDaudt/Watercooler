import type { FastifyInstance } from "fastify";
import { randomBytes } from "crypto";
import { hash, verify } from "argon2";
import { eq, and, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { signupSchema, loginSchema, bootstrapSchema, resetPasswordSchema } from "@watercooler/shared";
import { createToken, setAuthCookie, clearAuthCookie, authHook, type AuthedRequest } from "../auth.js";

function generateRecoveryKey(): string {
  return randomBytes(32).toString("hex");
}

// In-memory per-account login lockout
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function checkAccountLockout(email: string): { locked: boolean; retryAfter?: number } {
  const entry = loginAttempts.get(email);
  if (!entry) return { locked: false };
  if (Date.now() > entry.lockedUntil) {
    loginAttempts.delete(email);
    return { locked: false };
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    return { locked: true, retryAfter: Math.ceil((entry.lockedUntil - Date.now()) / 1000) };
  }
  return { locked: false };
}

function recordFailedLogin(email: string) {
  const entry = loginAttempts.get(email) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
  }
  loginAttempts.set(email, entry);
}

function clearFailedLogins(email: string) {
  loginAttempts.delete(email);
}

/** Create default Owner/Moderator/Member roles for a new community */
async function createDefaultRoles(communityId: string) {
  const [ownerRole] = await db.insert(schema.roles).values({
    communityId, name: "Owner", color: "#ed4245", position: 0,
  }).returning();
  const [modRole] = await db.insert(schema.roles).values({
    communityId, name: "Moderator", color: "#5865f2", position: 1,
  }).returning();
  const [memberRole] = await db.insert(schema.roles).values({
    communityId, name: "Member", color: "#99aab5", position: 2, isDefault: true, isEveryone: true,
  }).returning();

  // Owner: all permissions
  await db.insert(schema.rolePermissions).values({
    roleId: ownerRole.id,
    manageCommunity: true, manageRoles: true, manageChannels: true, manageMembers: true,
    createInvites: true, sendMessages: true, manageMessages: true, pinMessages: true,
    kickMembers: true, banMembers: true, timeoutMembers: true,
  });
  // Moderator: moderate permissions
  await db.insert(schema.rolePermissions).values({
    roleId: modRole.id,
    manageCommunity: false, manageRoles: false, manageChannels: true, manageMembers: true,
    createInvites: true, sendMessages: true, manageMessages: true, pinMessages: true,
    kickMembers: true, banMembers: true, timeoutMembers: true,
  });
  // Member: basic permissions
  await db.insert(schema.rolePermissions).values({
    roleId: memberRole.id,
    manageCommunity: false, manageRoles: false, manageChannels: false, manageMembers: false,
    createInvites: true, sendMessages: true, manageMessages: false, pinMessages: true,
    kickMembers: false, banMembers: false, timeoutMembers: false,
  });

  return { ownerRole, modRole, memberRole };
}

/** Assign a membership to the appropriate roles based on its role string */
async function assignMembershipRoles(membershipId: string, communityId: string, roleStr: string) {
  // Always assign the @everyone role
  const [everyoneRole] = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.communityId, communityId), eq(schema.roles.isEveryone, true)))
    .limit(1);
  if (everyoneRole) {
    await db.insert(schema.userRoles).values({ membershipId, roleId: everyoneRole.id }).onConflictDoNothing();
  }

  // Assign the specific role if not just "member"
  if (roleStr === "owner") {
    const [ownerRole] = await db.select().from(schema.roles)
      .where(and(eq(schema.roles.communityId, communityId), eq(schema.roles.name, "Owner"), eq(schema.roles.position, 0)))
      .limit(1);
    if (ownerRole) {
      await db.insert(schema.userRoles).values({ membershipId, roleId: ownerRole.id }).onConflictDoNothing();
    }
  }
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/api/auth/status", async () => {
    const [community] = await db.select().from(schema.communities).limit(1);
    return { bootstrapped: !!community };
  });

  app.post("/api/auth/bootstrap", async (request, reply) => {
    const [existing] = await db.select().from(schema.communities).limit(1);
    if (existing) {
      return reply.code(400).send({ error: "Already bootstrapped" });
    }
    const parsed = bootstrapSchema.safeParse(request.body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map(e => e.message).join(". ");
      return reply.code(400).send({ error: messages, details: parsed.error.errors });
    }
    const data = parsed.data;
    const passwordHash = await hash(data.password);
    const recoveryKey = generateRecoveryKey();
    const recoveryKeyHash = await hash(recoveryKey);

    const [user] = await db
      .insert(schema.users)
      .values({ email: data.email, username: data.username, passwordHash, recoveryKeyHash })
      .returning();

    const [community] = await db
      .insert(schema.communities)
      .values({ name: data.communityName })
      .returning();

    const [ownerMembership] = await db.insert(schema.memberships).values({
      userId: user.id,
      communityId: community.id,
      role: "owner",
    }).returning();

    // Create default roles and assign owner
    await createDefaultRoles(community.id);
    await assignMembershipRoles(ownerMembership.id, community.id, "owner");

    // Create default channels
    const defaultChannels = ["announcements", "general", "events", "buy-sell"];
    for (const name of defaultChannels) {
      await db.insert(schema.channels).values({ communityId: community.id, name });
    }

    const token = await createToken(user.id);
    setAuthCookie(reply, token);
    return { user: { id: user.id, email: user.email, username: user.username }, community, recoveryKey };
  });

  app.post("/api/auth/signup", async (request, reply) => {
    const parsed = signupSchema.safeParse(request.body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map(e => e.message).join(". ");
      return reply.code(400).send({ error: messages, details: parsed.error.errors });
    }
    const data = parsed.data;

    // Validate invite code BEFORE creating the user
    const [invite] = await db
      .select()
      .from(schema.invites)
      .where(eq(schema.invites.code, data.inviteCode))
      .limit(1);

    if (!invite) {
      return reply.code(400).send({ error: "Invalid invite code" });
    }
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return reply.code(410).send({ error: "Invite has expired" });
    }
    if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
      return reply.code(410).send({ error: "Invite has reached max uses" });
    }

    const passwordHash = await hash(data.password);
    const recoveryKey = generateRecoveryKey();
    const recoveryKeyHash = await hash(recoveryKey);

    const [existingEmail] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, data.email))
      .limit(1);
    const [existingUsername] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, data.username))
      .limit(1);
    if (existingEmail || existingUsername) {
      return reply.code(409).send({ error: "Email or username is unavailable" });
    }

    // Create user and membership atomically
    const [user] = await db
      .insert(schema.users)
      .values({ email: data.email, username: data.username, passwordHash, recoveryKeyHash })
      .returning();

    const [newMembership] = await db.insert(schema.memberships).values({
      userId: user.id,
      communityId: invite.communityId,
      role: "member",
    }).returning();

    // Assign default (@everyone) role
    await assignMembershipRoles(newMembership.id, invite.communityId, "member");

    await db
      .update(schema.invites)
      .set({ uses: sql`${schema.invites.uses} + 1` })
      .where(eq(schema.invites.id, invite.id));

    const token = await createToken(user.id);
    setAuthCookie(reply, token);
    return { user: { id: user.id, email: user.email, username: user.username }, recoveryKey };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map(e => e.message).join(". ");
      return reply.code(400).send({ error: messages, details: parsed.error.errors });
    }
    const data = parsed.data;

    // Check per-account lockout
    const lockout = checkAccountLockout(data.email);
    if (lockout.locked) {
      console.warn(`[auth] Account locked out: email=${data.email} ip=${request.ip}`);
      return reply.code(429).send({ error: "Too many failed attempts. Try again later.", retryAfter: lockout.retryAfter });
    }

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, data.email))
      .limit(1);

    if (!user || !(await verify(user.passwordHash, data.password))) {
      recordFailedLogin(data.email);
      console.warn(`[auth] Failed login attempt for email=${data.email} ip=${request.ip}`);
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    clearFailedLogins(data.email);
    const token = await createToken(user.id, user.tokenVersion);
    setAuthCookie(reply, token);
    return { user: { id: user.id, email: user.email, username: user.username } };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    clearAuthCookie(reply);
    return { ok: true };
  });

  app.get("/api/auth/me", { preHandler: [authHook] }, async (request) => {
    const req = request as AuthedRequest;
    return { user: req.user };
  });

  // Reset password using recovery key (unauthenticated)
  app.post("/api/auth/reset-password", async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map(e => e.message).join(". ");
      return reply.code(400).send({ error: messages, details: parsed.error.errors });
    }
    const data = parsed.data;

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, data.email))
      .limit(1);

    if (!user || !user.recoveryKeyHash) {
      console.warn(`[auth] Failed password reset: invalid email (email=${data.email}, ip=${request.ip})`);
      return reply.code(401).send({ error: "Invalid email or recovery key" });
    }

    const valid = await verify(user.recoveryKeyHash, data.recoveryKey);
    if (!valid) {
      console.warn(`[auth] Failed password reset: invalid recovery key (email=${data.email}, ip=${request.ip})`);
      return reply.code(401).send({ error: "Invalid email or recovery key" });
    }

    // Reset password and rotate recovery key
    const passwordHash = await hash(data.newPassword);
    const newRecoveryKey = generateRecoveryKey();
    const recoveryKeyHash = await hash(newRecoveryKey);

    await db
      .update(schema.users)
      .set({ passwordHash, recoveryKeyHash, tokenVersion: sql`token_version + 1` })
      .where(eq(schema.users.id, user.id));

    return { ok: true, recoveryKey: newRecoveryKey };
  });

  // Returns the session token for Socket.IO auth (cookie is HTTP-only so JS can't read it)
  app.get("/api/auth/token", { preHandler: [authHook] }, async (request) => {
    const token = request.cookies.session;
    return { token };
  });
}
