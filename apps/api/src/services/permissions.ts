import { eq, and, inArray } from "drizzle-orm";
import { db, schema } from "../db/index.js";

export interface EffectivePermissions {
  manageCommunity: boolean;
  manageRoles: boolean;
  manageChannels: boolean;
  manageMembers: boolean;
  createInvites: boolean;
  sendMessages: boolean;
  manageMessages: boolean;
  pinMessages: boolean;
  kickMembers: boolean;
  banMembers: boolean;
  timeoutMembers: boolean;
}

const PERMISSION_KEYS: (keyof EffectivePermissions)[] = [
  "manageCommunity",
  "manageRoles",
  "manageChannels",
  "manageMembers",
  "createInvites",
  "sendMessages",
  "manageMessages",
  "pinMessages",
  "kickMembers",
  "banMembers",
  "timeoutMembers",
];

const EMPTY_PERMISSIONS: EffectivePermissions = {
  manageCommunity: false,
  manageRoles: false,
  manageChannels: false,
  manageMembers: false,
  createInvites: false,
  sendMessages: false,
  manageMessages: false,
  pinMessages: false,
  kickMembers: false,
  banMembers: false,
  timeoutMembers: false,
};

interface CacheEntry {
  permissions: EffectivePermissions;
  highestPosition: number;
  computedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000; // 1 minute

export async function computeEffectivePermissions(
  membershipId: string,
  channelId?: string,
): Promise<EffectivePermissions> {
  // Check cache for base permissions
  const cached = cache.get(membershipId);
  if (cached && Date.now() - cached.computedAt < CACHE_TTL && !channelId) {
    return cached.permissions;
  }

  // Fetch user's roles with permissions
  const rows = await db
    .select({
      roleId: schema.userRoles.roleId,
      position: schema.roles.position,
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
    .from(schema.userRoles)
    .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
    .innerJoin(schema.rolePermissions, eq(schema.roles.id, schema.rolePermissions.roleId))
    .where(eq(schema.userRoles.membershipId, membershipId));

  // Compute union of all role permissions
  const base: EffectivePermissions = { ...EMPTY_PERMISSIONS };
  let highestPosition = 999;

  for (const row of rows) {
    if (row.position < highestPosition) highestPosition = row.position;
    for (const key of PERMISSION_KEYS) {
      if (row[key]) base[key] = true;
    }
  }

  // Cache base permissions
  cache.set(membershipId, {
    permissions: base,
    highestPosition,
    computedAt: Date.now(),
  });

  if (!channelId) return base;

  // Apply channel-specific overrides
  const roleIds = rows.map((r) => r.roleId);
  if (roleIds.length === 0) return base;

  const overrides = await db
    .select()
    .from(schema.channelPermissionOverrides)
    .where(
      and(
        eq(schema.channelPermissionOverrides.channelId, channelId),
        inArray(schema.channelPermissionOverrides.roleId, roleIds),
      ),
    );

  if (overrides.length === 0) return base;

  const channelPerms = { ...base };
  const channelKeys: (keyof Pick<EffectivePermissions, "sendMessages" | "manageMessages" | "pinMessages">)[] = [
    "sendMessages",
    "manageMessages",
    "pinMessages",
  ];

  // Deny wins: if any override denies, deny. Else if any allows, allow.
  for (const key of channelKeys) {
    let hasDeny = false;
    let hasAllow = false;
    for (const o of overrides) {
      if (o[key] === false) hasDeny = true;
      if (o[key] === true) hasAllow = true;
    }
    if (hasDeny) channelPerms[key] = false;
    else if (hasAllow) channelPerms[key] = true;
  }

  return channelPerms;
}

export async function getUserHighestRolePosition(membershipId: string): Promise<number> {
  const cached = cache.get(membershipId);
  if (cached && Date.now() - cached.computedAt < CACHE_TTL) {
    return cached.highestPosition;
  }

  // Force computation which also populates cache
  await computeEffectivePermissions(membershipId);
  return cache.get(membershipId)?.highestPosition ?? 999;
}

export function clearPermissionsCache(membershipId?: string) {
  if (membershipId) {
    cache.delete(membershipId);
  } else {
    cache.clear();
  }
}
