-- Custom roles system
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#99aab5',
  position INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_everyone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS roles_community_idx ON roles(community_id, position);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID PRIMARY KEY REFERENCES roles(id) ON DELETE CASCADE,
  manage_community BOOLEAN NOT NULL DEFAULT false,
  manage_roles BOOLEAN NOT NULL DEFAULT false,
  manage_channels BOOLEAN NOT NULL DEFAULT false,
  manage_members BOOLEAN NOT NULL DEFAULT false,
  create_invites BOOLEAN NOT NULL DEFAULT false,
  send_messages BOOLEAN NOT NULL DEFAULT true,
  manage_messages BOOLEAN NOT NULL DEFAULT false,
  pin_messages BOOLEAN NOT NULL DEFAULT false,
  kick_members BOOLEAN NOT NULL DEFAULT false,
  ban_members BOOLEAN NOT NULL DEFAULT false,
  timeout_members BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(membership_id, role_id)
);

CREATE INDEX IF NOT EXISTS user_roles_membership_idx ON user_roles(membership_id);
CREATE INDEX IF NOT EXISTS user_roles_role_idx ON user_roles(role_id);

CREATE TABLE IF NOT EXISTS channel_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  send_messages BOOLEAN DEFAULT NULL,
  manage_messages BOOLEAN DEFAULT NULL,
  pin_messages BOOLEAN DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(channel_id, role_id)
);

CREATE INDEX IF NOT EXISTS channel_overrides_channel_idx ON channel_permission_overrides(channel_id);

-- Migrate existing data: create default roles for each community
-- Owner role (position 0)
INSERT INTO roles (community_id, name, color, position, is_default, is_everyone)
SELECT id, 'Owner', '#ed4245', 0, false, false
FROM communities
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE roles.community_id = communities.id AND roles.name = 'Owner');

-- Moderator role (position 1)
INSERT INTO roles (community_id, name, color, position, is_default, is_everyone)
SELECT id, 'Moderator', '#5865f2', 1, false, false
FROM communities
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE roles.community_id = communities.id AND roles.name = 'Moderator');

-- Member role (position 2, is_everyone + is_default)
INSERT INTO roles (community_id, name, color, position, is_default, is_everyone)
SELECT id, 'Member', '#99aab5', 2, true, true
FROM communities
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE roles.community_id = communities.id AND roles.name = 'Member' AND roles.is_everyone = true);

-- Set Owner permissions (all true)
INSERT INTO role_permissions (role_id, manage_community, manage_roles, manage_channels, manage_members, create_invites, send_messages, manage_messages, pin_messages, kick_members, ban_members, timeout_members)
SELECT r.id, true, true, true, true, true, true, true, true, true, true, true
FROM roles r
WHERE r.name = 'Owner' AND NOT EXISTS (SELECT 1 FROM role_permissions WHERE role_permissions.role_id = r.id);

-- Set Moderator permissions
INSERT INTO role_permissions (role_id, manage_community, manage_roles, manage_channels, manage_members, create_invites, send_messages, manage_messages, pin_messages, kick_members, ban_members, timeout_members)
SELECT r.id, false, false, true, true, true, true, true, true, true, true, true
FROM roles r
WHERE r.name = 'Moderator' AND NOT EXISTS (SELECT 1 FROM role_permissions WHERE role_permissions.role_id = r.id);

-- Set Member permissions (basic)
INSERT INTO role_permissions (role_id, manage_community, manage_roles, manage_channels, manage_members, create_invites, send_messages, manage_messages, pin_messages, kick_members, ban_members, timeout_members)
SELECT r.id, false, false, false, false, true, true, false, true, false, false, false
FROM roles r
WHERE r.name = 'Member' AND r.is_everyone = true AND NOT EXISTS (SELECT 1 FROM role_permissions WHERE role_permissions.role_id = r.id);

-- Assign existing users to their corresponding roles
INSERT INTO user_roles (membership_id, role_id)
SELECT m.id, r.id
FROM memberships m
JOIN roles r ON r.community_id = m.community_id AND r.name = 'Owner'
WHERE m.role = 'owner'
AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_roles.membership_id = m.id AND user_roles.role_id = r.id);

INSERT INTO user_roles (membership_id, role_id)
SELECT m.id, r.id
FROM memberships m
JOIN roles r ON r.community_id = m.community_id AND r.name = 'Moderator'
WHERE m.role = 'moderator'
AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_roles.membership_id = m.id AND user_roles.role_id = r.id);

-- All members get the @everyone role
INSERT INTO user_roles (membership_id, role_id)
SELECT m.id, r.id
FROM memberships m
JOIN roles r ON r.community_id = m.community_id AND r.is_everyone = true
WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_roles.membership_id = m.id AND user_roles.role_id = r.id);
