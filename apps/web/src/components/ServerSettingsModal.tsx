"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { X, Settings, Shield, Users, Plus, Trash2, Hash } from "lucide-react";
import type { Community, ServerRole, RolePermissions, Channel } from "@watercooler/shared";

interface Props {
  community: Community;
  onClose: () => void;
  onUpdate: (community: Community) => void;
}

type Tab = "overview" | "roles" | "members" | "channels";

const PERMISSION_LABELS: Record<keyof RolePermissions, string> = {
  manageCommunity: "Manage Server",
  manageRoles: "Manage Roles",
  manageChannels: "Manage Channels",
  manageMembers: "Manage Members",
  createInvites: "Create Invites",
  sendMessages: "Send Messages",
  manageMessages: "Manage Messages",
  pinMessages: "Pin Messages",
  kickMembers: "Kick Members",
  banMembers: "Ban Members",
  timeoutMembers: "Timeout Members",
};

const PERMISSION_GROUPS: { label: string; keys: (keyof RolePermissions)[] }[] = [
  { label: "General", keys: ["manageCommunity", "manageRoles", "manageChannels", "manageMembers", "createInvites"] },
  { label: "Messages", keys: ["sendMessages", "manageMessages", "pinMessages"] },
  { label: "Moderation", keys: ["kickMembers", "banMembers", "timeoutMembers"] },
];

export function ServerSettingsModal({ community, onClose, onUpdate }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="Server Settings" className="bg-[var(--background)] rounded-xl shadow-2xl w-full max-w-5xl h-[80vh] flex overflow-hidden border border-[var(--border)]">
        {/* Sidebar */}
        <div className="w-56 bg-[var(--card)] border-r border-[var(--border)] p-4 shrink-0">
          <h2 className="text-lg font-bold mb-4 truncate">{community.name}</h2>
          <nav className="space-y-1">
            <SidebarButton icon={<Settings size={16} />} label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
            <SidebarButton icon={<Shield size={16} />} label="Roles" active={tab === "roles"} onClick={() => setTab("roles")} />
            <SidebarButton icon={<Hash size={16} />} label="Channels" active={tab === "channels"} onClick={() => setTab("channels")} />
            <SidebarButton icon={<Users size={16} />} label="Members" active={tab === "members"} onClick={() => setTab("members")} />
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="h-14 px-6 flex items-center justify-between border-b border-[var(--border)] shrink-0">
            <h3 className="font-semibold capitalize">{tab}</h3>
            <button onClick={onClose} className="p-1 hover:bg-[var(--muted)] rounded" aria-label="Close">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {tab === "overview" && <OverviewTab community={community} onUpdate={onUpdate} />}
            {tab === "roles" && <RolesTab />}
            {tab === "channels" && <ChannelsTab />}
            {tab === "members" && <MembersTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
        active ? "bg-[var(--primary)] text-white" : "text-[var(--foreground)] hover:bg-[var(--muted)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// --- Overview Tab ---
function OverviewTab({ community, onUpdate }: { community: Community; onUpdate: (c: Community) => void }) {
  const [name, setName] = useState(community.name);
  const [logoUrl, setLogoUrl] = useState(community.logoUrl || "");
  const [accentColor, setAccentColor] = useState(community.accentColor || "#6366f1");
  const [inviteOnly, setInviteOnly] = useState(community.inviteOnly);
  const [requestToJoin, setRequestToJoin] = useState(community.requestToJoin);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.patch<Community>("/api/community", {
        name: name.trim(),
        logoUrl: logoUrl.trim() || null,
        accentColor,
        inviteOnly,
        requestToJoin,
      });
      onUpdate(updated);
      document.documentElement.style.setProperty("--primary", accentColor);
    } catch (err: any) {
      alert(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">Server Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Logo URL</label>
        <input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..."
          className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Accent Color</label>
        <div className="flex gap-2 items-center">
          <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)}
            className="w-12 h-12 rounded cursor-pointer border border-[var(--border)]" />
          <input type="text" value={accentColor} onChange={(e) => setAccentColor(e.target.value)}
            className="flex-1 px-3 py-2 bg-[var(--muted)] rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
        </div>
      </div>
      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={inviteOnly} onChange={(e) => setInviteOnly(e.target.checked)}
            className="w-4 h-4 rounded" />
          <div>
            <span className="text-sm font-medium">Invite Only</span>
            <p className="text-xs text-[var(--muted-foreground)]">Users must have an invite to join</p>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={requestToJoin} onChange={(e) => setRequestToJoin(e.target.checked)}
            className="w-4 h-4 rounded" />
          <div>
            <span className="text-sm font-medium">Request to Join</span>
            <p className="text-xs text-[var(--muted-foreground)]">Users can request to join for approval</p>
          </div>
        </label>
      </div>
      <button onClick={save} disabled={saving}
        className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50">
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}

// --- Roles Tab ---
function RolesTab() {
  const [roles, setRoles] = useState<ServerRole[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRoles = useCallback(async () => {
    try {
      const data = await api.get<ServerRole[]>("/api/roles");
      setRoles(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const createRole = async () => {
    const name = prompt("Role name:");
    if (!name?.trim()) return;
    try {
      const newRole = await api.post<ServerRole>("/api/roles", {
        name: name.trim(),
        color: "#99aab5",
        permissions: { sendMessages: true, createInvites: true },
      });
      await loadRoles();
      setSelectedId(newRole.id);
    } catch (err: any) {
      alert(err.message || "Failed to create role");
    }
  };

  const selectedRole = roles.find((r) => r.id === selectedId);

  if (loading) return <div className="text-[var(--muted-foreground)]">Loading...</div>;

  return (
    <div className="flex gap-6 h-full">
      {/* Role list */}
      <div className="w-56 shrink-0 space-y-2">
        <button onClick={createRole}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--primary)] text-white rounded-lg text-sm hover:opacity-90">
          <Plus size={14} /> Create Role
        </button>
        {roles.map((role) => (
          <button key={role.id} onClick={() => setSelectedId(role.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm ${
              selectedId === role.id ? "bg-[var(--muted)]" : "hover:bg-[var(--muted)]/50"
            }`}>
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
            <span className="truncate font-medium">{role.name}</span>
            {role.isEveryone && <span className="text-[10px] text-[var(--muted-foreground)] ml-auto">@all</span>}
          </button>
        ))}
      </div>

      {/* Role editor */}
      {selectedRole ? (
        <RoleEditor key={selectedRole.id} role={selectedRole} onUpdate={loadRoles} onDelete={() => { setSelectedId(null); loadRoles(); }} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-[var(--muted-foreground)] text-sm">
          Select a role to edit
        </div>
      )}
    </div>
  );
}

function RoleEditor({ role, onUpdate, onDelete }: { role: ServerRole; onUpdate: () => void; onDelete: () => void }) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [perms, setPerms] = useState<RolePermissions>(role.permissions || {} as RolePermissions);
  const [saving, setSaving] = useState(false);

  const canEdit = !role.isEveryone && role.position !== 0;

  const togglePerm = (key: keyof RolePermissions) => {
    setPerms((p) => ({ ...p, [key]: !p[key] }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/roles/${role.id}`, { name, color, permissions: perms });
      onUpdate();
    } catch (err: any) {
      alert(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete role "${role.name}"? Members will lose this role.`)) return;
    try {
      await api.delete(`/api/roles/${role.id}`);
      onDelete();
    } catch (err: any) {
      alert(err.message || "Failed to delete");
    }
  };

  return (
    <div className="flex-1 space-y-6 overflow-y-auto">
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2">Role Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit}
            className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Color</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={!canEdit}
            className="w-12 h-10 rounded cursor-pointer border border-[var(--border)] disabled:opacity-50" />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-3">Permissions</h4>
        <div className="space-y-4">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label}>
              <h5 className="text-xs uppercase font-semibold text-[var(--muted-foreground)] mb-2">{group.label}</h5>
              <div className="space-y-1.5">
                {group.keys.map((key) => (
                  <label key={key} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[var(--muted)]/50 cursor-pointer">
                    <span className="text-sm">{PERMISSION_LABELS[key]}</span>
                    <input type="checkbox" checked={!!perms[key]} onChange={() => togglePerm(key)}
                      disabled={!canEdit || role.position === 0}
                      className="w-4 h-4 rounded" />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
        <button onClick={save} disabled={saving || !canEdit}
          className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm">
          {saving ? "Saving..." : "Save Changes"}
        </button>
        {canEdit && (
          <button onClick={handleDelete}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:opacity-90 text-sm flex items-center gap-1.5">
            <Trash2 size={14} /> Delete Role
          </button>
        )}
      </div>
    </div>
  );
}

// --- Channels Tab ---
interface PermissionOverride {
  id: string;
  channelId: string;
  roleId: string;
  sendMessages: boolean | null;
  manageMessages: boolean | null;
  pinMessages: boolean | null;
  roleName: string;
  roleColor: string;
}

const CHANNEL_PERM_KEYS = ["sendMessages", "manageMessages", "pinMessages"] as const;
const CHANNEL_PERM_LABELS: Record<string, string> = {
  sendMessages: "Send Messages",
  manageMessages: "Manage Messages",
  pinMessages: "Pin Messages",
};

function ChannelsTab() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<ServerRole[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<PermissionOverride[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Channel[]>("/api/channels"),
      api.get<ServerRole[]>("/api/roles"),
    ]).then(([ch, r]) => {
      const communityChannels = ch.filter((c) => c.communityId);
      setChannels(communityChannels);
      setRoles(r);
    }).finally(() => setLoading(false));
  }, []);

  const loadOverrides = useCallback(async (channelId: string) => {
    const data = await api.get<PermissionOverride[]>(`/api/channels/${channelId}/permission-overrides`);
    setOverrides(data);
  }, []);

  useEffect(() => {
    if (selectedChannelId) loadOverrides(selectedChannelId);
  }, [selectedChannelId, loadOverrides]);

  const cyclePermission = async (roleId: string, key: string, current: boolean | null) => {
    if (!selectedChannelId) return;
    // Cycle: null (inherit) -> true (allow) -> false (deny) -> null (inherit)
    const next = current === null ? true : current === true ? false : null;

    // Build the full override state for this role
    const existing = overrides.find((o) => o.roleId === roleId);
    const body: Record<string, boolean | null> = {
      sendMessages: existing?.sendMessages ?? null,
      manageMessages: existing?.manageMessages ?? null,
      pinMessages: existing?.pinMessages ?? null,
    };
    body[key] = next;

    // If all null, delete the override
    if (body.sendMessages === null && body.manageMessages === null && body.pinMessages === null) {
      try {
        await api.delete(`/api/channels/${selectedChannelId}/permission-overrides/${roleId}`);
      } catch { /* might not exist */ }
    } else {
      await api.put(`/api/channels/${selectedChannelId}/permission-overrides/${roleId}`, body);
    }
    await loadOverrides(selectedChannelId);
  };

  if (loading) return <div className="text-[var(--muted-foreground)]">Loading...</div>;

  return (
    <div className="flex gap-6 h-full">
      {/* Channel list */}
      <div className="w-48 shrink-0 space-y-1 overflow-y-auto">
        {channels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => setSelectedChannelId(ch.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm ${
              selectedChannelId === ch.id ? "bg-[var(--muted)]" : "hover:bg-[var(--muted)]/50"
            }`}
          >
            <Hash size={14} className="text-[var(--muted-foreground)] shrink-0" />
            <span className="truncate">{ch.name}</span>
          </button>
        ))}
      </div>

      {/* Permission grid */}
      {selectedChannelId ? (
        <div className="flex-1 overflow-y-auto">
          <h4 className="text-sm font-semibold mb-4">Permission Overrides</h4>
          <div className="space-y-3">
            {roles.map((role) => {
              const override = overrides.find((o) => o.roleId === role.id);
              return (
                <div key={role.id} className="border border-[var(--border)] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                    <span className="text-sm font-medium">{role.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {CHANNEL_PERM_KEYS.map((key) => {
                      const value = override?.[key] ?? null;
                      return (
                        <button
                          key={key}
                          onClick={() => cyclePermission(role.id, key, value)}
                          className={`px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
                            value === true
                              ? "bg-green-500/20 border-green-500/50 text-green-600 dark:text-green-400"
                              : value === false
                                ? "bg-red-500/20 border-red-500/50 text-red-600 dark:text-red-400"
                                : "bg-[var(--muted)] border-[var(--border)] text-[var(--muted-foreground)]"
                          }`}
                          title={`${CHANNEL_PERM_LABELS[key]}: ${value === true ? "Allow" : value === false ? "Deny" : "Inherit"}`}
                        >
                          <span className="block truncate">{CHANNEL_PERM_LABELS[key]}</span>
                          <span className="block text-[10px] mt-0.5">
                            {value === true ? "Allow" : value === false ? "Deny" : "Inherit"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[var(--muted-foreground)] text-sm">
          Select a channel to manage permissions
        </div>
      )}
    </div>
  );
}

// --- Members Tab ---
function MembersTab() {
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<ServerRole[]>([]);
  const [memberRoles, setMemberRoles] = useState<Record<string, { id: string; name: string; color: string }[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<any[]>("/api/members"),
      api.get<ServerRole[]>("/api/roles"),
    ]).then(([m, r]) => {
      setMembers(m);
      setRoles(r);
      // Load roles for each member
      Promise.all(
        m.map((member: any) =>
          api.get<{ id: string; name: string; color: string }[]>(`/api/members/${member.userId}/roles`)
            .then((userRoles) => ({ userId: member.userId, roles: userRoles }))
            .catch(() => ({ userId: member.userId, roles: [] }))
        )
      ).then((results) => {
        const map: Record<string, { id: string; name: string; color: string }[]> = {};
        for (const r of results) map[r.userId] = r.roles;
        setMemberRoles(map);
      });
    }).finally(() => setLoading(false));
  }, []);

  const assignableRoles = roles.filter((r) => !r.isEveryone && r.position !== 0);

  const toggleRole = async (userId: string, roleId: string, hasRole: boolean) => {
    try {
      if (hasRole) {
        await api.delete(`/api/members/${userId}/roles/${roleId}`);
      } else {
        await api.post(`/api/members/${userId}/roles/${roleId}`, {});
      }
      // Refresh member's roles
      const updated = await api.get<{ id: string; name: string; color: string }[]>(`/api/members/${userId}/roles`);
      setMemberRoles((prev) => ({ ...prev, [userId]: updated }));
    } catch (err: any) {
      alert(err.message || "Failed to update role");
    }
  };

  if (loading) return <div className="text-[var(--muted-foreground)]">Loading...</div>;

  return (
    <div className="space-y-2">
      <p className="text-sm text-[var(--muted-foreground)] mb-4">{members.length} members</p>
      {members.map((member) => {
        const userRoleList = memberRoles[member.userId] || [];
        return (
          <div key={member.userId} className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-[var(--muted)]/50">
            <div className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center text-sm font-bold text-[var(--primary)]">
              {member.username?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{member.username}</div>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {userRoleList.filter((r: any) => !roles.find((sr) => sr.id === r.id)?.isEveryone).map((r: any) => (
                  <span key={r.id} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: r.color + "30", color: r.color }}>
                    {r.name}
                  </span>
                ))}
              </div>
            </div>
            {/* Role assignment dropdown */}
            <div className="relative group">
              <button className="px-2 py-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] rounded">
                Roles
              </button>
              <div className="absolute right-0 top-full mt-1 w-48 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg py-1 hidden group-hover:block z-10">
                {assignableRoles.map((role) => {
                  const hasRole = userRoleList.some((r: any) => r.id === role.id);
                  return (
                    <button key={role.id} onClick={() => toggleRole(member.userId, role.id, hasRole)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--muted)] text-left text-sm">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                      <span className="flex-1">{role.name}</span>
                      {hasRole && <span className="text-[var(--primary)] text-xs">&#10003;</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
