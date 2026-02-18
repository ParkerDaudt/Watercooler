"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { Warning } from "@watercooler/shared";
import { Shield, Users, Link2, Flag, ClipboardList, Plus, X, Hash, Image, Palette, FolderOpen, Pencil, Trash2, AlertTriangle, History } from "lucide-react";

type Tab = "members" | "invites" | "reports" | "audit" | "channels" | "categories" | "settings";

export function AdminPanel() {
  const [tab, setTab] = useState<Tab>("members");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-12 px-4 flex items-center gap-2 border-b border-[var(--border)] shrink-0">
        <Shield size={18} className="text-[var(--muted-foreground)]" />
        <span className="font-semibold text-sm">Admin Panel</span>
      </div>
      <div className="flex border-b border-[var(--border)] overflow-x-auto">
        {(["members", "invites", "reports", "audit", "channels", "categories", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize whitespace-nowrap ${
              tab === t
                ? "border-b-2 border-[var(--primary)] text-[var(--primary)] font-medium"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "members" && <MembersTab />}
        {tab === "invites" && <InvitesTab />}
        {tab === "reports" && <ReportsTab />}
        {tab === "audit" && <AuditTab />}
        {tab === "channels" && <ChannelsTab />}
        {tab === "categories" && <CategoriesTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}

/* ─── User Moderation History Modal ─── */

function UserHistoryModal({ userId, username, onClose }: { userId: string; username: string; onClose: () => void }) {
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState<"warning" | "strike">("warning");
  const [issuing, setIssuing] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<Warning[]>(`/api/mod/warnings/${userId}`)
      .then(setWarnings)
      .catch(() => setWarnings([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [userId]);

  const strikeCount = warnings.filter((w) => w.severity === "strike").length;

  const issue = async () => {
    if (!reason.trim()) return;
    setIssuing(true);
    try {
      await api.post("/api/mod/warn", { userId, reason: reason.trim(), severity });
      setReason("");
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIssuing(false);
    }
  };

  const remove = async (warningId: string) => {
    if (!confirm("Remove this warning/strike?")) return;
    try {
      await api.delete(`/api/mod/warnings/${warningId}`);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <History size={18} className="text-[var(--muted-foreground)]" />
            <h2 className="font-semibold text-sm">Moderation History: {username}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[var(--muted)] rounded">
            <X size={18} />
          </button>
        </div>

        {/* Strike counter */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Strikes:</span>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i < strikeCount
                      ? strikeCount >= 3
                        ? "bg-[var(--destructive)] text-white"
                        : "bg-yellow-500 text-white"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                  }`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
            {strikeCount >= 3 && (
              <span className="text-xs text-[var(--destructive)] font-medium">AUTO-BANNED</span>
            )}
          </div>
        </div>

        {/* Issue warning/strike */}
        <div className="px-4 py-2 border-b border-[var(--border)]">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs text-[var(--muted-foreground)] mb-1">Reason</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason..."
                className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                onKeyDown={(e) => e.key === "Enter" && issue()}
              />
            </div>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as "warning" | "strike")}
              className="px-2 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm"
            >
              <option value="warning">Warning</option>
              <option value="strike">Strike</option>
            </select>
            <button
              onClick={issue}
              disabled={issuing || !reason.trim()}
              className="px-3 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
            >
              {issuing ? "..." : "Issue"}
            </button>
          </div>
        </div>

        {/* History list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && <p className="text-[var(--muted-foreground)] text-sm text-center">Loading...</p>}
          {!loading && warnings.length === 0 && (
            <p className="text-[var(--muted-foreground)] text-sm text-center py-4">No warnings or strikes</p>
          )}
          {warnings.map((w) => (
            <div
              key={w.id}
              className={`p-3 border rounded-lg ${
                w.severity === "strike"
                  ? "border-yellow-500/50 bg-yellow-500/5"
                  : "border-[var(--border)] bg-[var(--card)]"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      w.severity === "strike"
                        ? "bg-yellow-500/20 text-yellow-600"
                        : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                    }`}>
                      {w.severity === "strike" ? "STRIKE" : "WARNING"}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      by {w.moderator?.username || "Unknown"}
                    </span>
                  </div>
                  <p className="text-sm mt-1">{w.reason}</p>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    {new Date(w.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => remove(w.id)}
                  className="p-1 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Members Tab ─── */

function MembersTab() {
  const [members, setMembers] = useState<any[]>([]);
  const [strikeCounts, setStrikeCounts] = useState<Record<string, number>>({});
  const [historyUser, setHistoryUser] = useState<{ id: string; username: string } | null>(null);

  const load = async () => {
    const data = await api.get<any[]>("/api/members");
    setMembers(data);
    // Load strike counts for each member
    const counts: Record<string, number> = {};
    await Promise.all(
      data.map(async (m) => {
        try {
          const warnings = await api.get<Warning[]>(`/api/mod/warnings/${m.userId}`);
          const strikes = warnings.filter((w) => w.severity === "strike").length;
          if (strikes > 0) counts[m.userId] = strikes;
        } catch {}
      })
    );
    setStrikeCounts(counts);
  };

  useEffect(() => { load(); }, []);

  const handleAction = async (action: string, userId: string) => {
    try {
      if (action === "kick") {
        await api.post("/api/mod/kick", { userId });
      } else if (action === "ban") {
        const reason = prompt("Ban reason:", "Banned by moderator");
        if (reason === null) return;
        await api.post("/api/mod/ban", { userId, reason });
      } else if (action === "unban") {
        await api.post("/api/mod/unban", { userId });
      } else if (action === "timeout") {
        const hours = prompt("Timeout hours:", "1");
        if (!hours) return;
        const until = new Date(Date.now() + parseInt(hours) * 3600000).toISOString();
        await api.post("/api/mod/timeout", { userId, until });
      } else if (action === "promote") {
        await api.patch(`/api/members/${userId}/role`, { role: "moderator" });
      } else if (action === "demote") {
        await api.patch(`/api/members/${userId}/role`, { role: "member" });
      } else if (action === "warn") {
        const reason = prompt("Warning reason:");
        if (!reason) return;
        await api.post("/api/mod/warn", { userId, reason, severity: "warning" });
      }
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-2">
      {members.map((m) => (
        <div
          key={m.id}
          className="flex items-center justify-between p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg"
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHistoryUser({ id: m.userId, username: m.username })}
              className="font-medium text-sm hover:text-[var(--primary)] hover:underline cursor-pointer"
            >
              {m.username}
            </button>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
              {m.role}
            </span>
            {m.status === "banned" && (
              <span className="text-xs text-[var(--destructive)] font-medium">BANNED</span>
            )}
            {m.status === "timeout" && (
              <span className="text-xs text-yellow-500 font-medium">TIMED OUT</span>
            )}
            {strikeCounts[m.userId] > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                strikeCounts[m.userId] >= 3
                  ? "bg-[var(--destructive)]/20 text-[var(--destructive)]"
                  : "bg-yellow-500/20 text-yellow-600"
              }`}>
                {strikeCounts[m.userId]}/3 strikes
              </span>
            )}
          </div>
          {m.role !== "owner" && (
            <div className="flex gap-1">
              {m.status === "banned" ? (
                <ActionBtn onClick={() => handleAction("unban", m.userId)} label="Unban" className="bg-green-500/10 text-green-600 hover:bg-green-500/20" />
              ) : (
                <>
                  {m.role === "member" && (
                    <ActionBtn onClick={() => handleAction("promote", m.userId)} label="Promote" />
                  )}
                  {m.role === "moderator" && (
                    <ActionBtn onClick={() => handleAction("demote", m.userId)} label="Demote" />
                  )}
                  <ActionBtn onClick={() => handleAction("warn", m.userId)} label="Warn" className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20" />
                  <ActionBtn onClick={() => handleAction("timeout", m.userId)} label="Timeout" />
                  <ActionBtn onClick={() => handleAction("kick", m.userId)} label="Kick" />
                  <ActionBtn onClick={() => handleAction("ban", m.userId)} label="Ban" danger />
                </>
              )}
            </div>
          )}
        </div>
      ))}
      {historyUser && (
        <UserHistoryModal
          userId={historyUser.id}
          username={historyUser.username}
          onClose={() => { setHistoryUser(null); load(); }}
        />
      )}
    </div>
  );
}

function InvitesTab() {
  const [invites, setInvites] = useState<any[]>([]);

  const load = async () => {
    const data = await api.get<any[]>("/api/invites");
    setInvites(data);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    const maxStr = prompt("Max uses (0 = unlimited):", "0");
    if (maxStr === null) return;
    await api.post("/api/invites", { maxUses: parseInt(maxStr) || 0 });
    load();
  };

  const revoke = async (id: string) => {
    await api.delete(`/api/invites/${id}`);
    load();
  };

  return (
    <div>
      <button
        onClick={create}
        className="flex items-center gap-1 mb-4 px-3 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90"
      >
        <Plus size={16} /> Create Invite
      </button>
      <div className="space-y-2">
        {invites.map((inv) => (
          <div
            key={inv.id}
            className="flex items-center justify-between p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg"
          >
            <div>
              <code className="text-sm font-mono bg-[var(--muted)] px-2 py-1 rounded">
                {inv.code}
              </code>
              <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                {inv.uses}/{inv.maxUses || "\u221e"} uses
              </span>
              {inv.expiresAt && (
                <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                  expires {new Date(inv.expiresAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <button
              onClick={() => revoke(inv.id)}
              className="p-1 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Reports Tab ─── */

function ReportsTab() {
  const [reports, setReports] = useState<any[]>([]);

  const load = async () => {
    const data = await api.get<any[]>("/api/reports");
    setReports(data);
  };

  useEffect(() => { load(); }, []);

  const update = async (id: string, status: string) => {
    await api.patch(`/api/reports/${id}`, { status });
    load();
  };

  const takeAction = async (reportId: string, action: string) => {
    try {
      if (action === "timeout") {
        const hours = prompt("Timeout hours:", "1");
        if (!hours) return;
        await api.post(`/api/reports/${reportId}/action`, {
          action: "timeout",
          timeoutHours: parseInt(hours),
        });
      } else {
        const reason = action === "warn" ? prompt("Warning reason:", "Reported content violation") : undefined;
        if (action === "warn" && reason === null) return;
        await api.post(`/api/reports/${reportId}/action`, { action, reason: reason || undefined });
      }
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-2">
      {reports.length === 0 && (
        <p className="text-[var(--muted-foreground)] text-sm text-center py-8">No reports</p>
      )}
      {reports.map((r) => (
        <div
          key={r.id}
          className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg"
        >
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{r.reporterUsername}</span> reported a message
                {r.messageAuthorUsername && (
                  <> by <span className="font-medium">{r.messageAuthorUsername}</span></>
                )}
              </p>
              <p className="text-sm text-[var(--muted-foreground)] mt-1">
                <span className="font-medium">Reason:</span> {r.reason}
              </p>
              {r.messageContent && (
                <div className="mt-2 p-2 bg-[var(--muted)] rounded-lg border-l-2 border-[var(--muted-foreground)]">
                  <p className="text-xs text-[var(--muted-foreground)] mb-1">Reported message:</p>
                  <p className="text-sm break-words">{r.messageContent}</p>
                </div>
              )}
              <p className="text-xs text-[var(--muted-foreground)] mt-2">
                Status: <span className={`font-medium ${
                  r.status === "open" ? "text-yellow-500" :
                  r.status === "reviewed" ? "text-green-500" :
                  "text-[var(--muted-foreground)]"
                }`}>{r.status}</span>
                {" \u00b7 "}
                {new Date(r.createdAt).toLocaleString()}
              </p>
            </div>
            {r.status === "open" && (
              <div className="flex flex-col gap-1 ml-3">
                <ActionBtn onClick={() => update(r.id, "reviewed")} label="Review" />
                <ActionBtn onClick={() => update(r.id, "dismissed")} label="Dismiss" />
                <div className="border-t border-[var(--border)] my-1" />
                <ActionBtn onClick={() => takeAction(r.id, "warn")} label="Warn Author" className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20" />
                <ActionBtn onClick={() => takeAction(r.id, "timeout")} label="Timeout" />
                <ActionBtn onClick={() => takeAction(r.id, "ban")} label="Ban" danger />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Audit Tab ─── */

const ACTION_LABELS: Record<string, string> = {
  channel_create: "Created channel",
  channel_delete: "Deleted channel",
  channel_update: "Updated channel",
  kick: "Kicked user",
  ban: "Banned user",
  unban: "Unbanned user",
  timeout_user: "Timed out user",
  message_delete: "Deleted message",
  warn: "Warned user",
  strike: "Issued strike",
  remove_warning: "Removed warning",
  auto_ban: "Auto-banned (3 strikes)",
  report_action: "Action from report",
};

function AuditTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<any[]>("/api/audit-logs")
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return <p className="text-[var(--muted-foreground)] text-sm text-center py-8">Loading audit logs...</p>;
  }

  if (logs.length === 0) {
    return <p className="text-[var(--muted-foreground)] text-sm text-center py-8">No audit logs</p>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-2 px-2 text-[var(--muted-foreground)] font-medium">Time</th>
              <th className="text-left py-2 px-2 text-[var(--muted-foreground)] font-medium">Actor</th>
              <th className="text-left py-2 px-2 text-[var(--muted-foreground)] font-medium">Action</th>
              <th className="text-left py-2 px-2 text-[var(--muted-foreground)] font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--muted)]/30">
                <td className="py-2 px-2 text-xs text-[var(--muted-foreground)] whitespace-nowrap">
                  {new Date(l.createdAt).toLocaleString()}
                </td>
                <td className="py-2 px-2 font-medium">{l.actorUsername}</td>
                <td className="py-2 px-2">{ACTION_LABELS[l.action] || l.action}</td>
                <td className="py-2 px-2 text-[var(--muted-foreground)]">
                  {l.targetType} {l.metadata?.name && `"${l.metadata.name}"`}
                  {l.metadata?.reason && ` \u2014 ${l.metadata.reason}`}
                  {!l.metadata?.name && !l.metadata?.reason && l.targetId && (
                    <span className="font-mono text-xs">{l.targetId.slice(0, 8)}...</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChannelsTab() {
  const [channels, setChannels] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = () => api.get<any[]>("/api/channels").then(setChannels);
  useEffect(() => { load(); }, []);

  const create = async () => {
    const trimmed = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!trimmed) {
      alert("Channel name must contain letters, numbers, or hyphens");
      return;
    }
    setCreating(true);
    try {
      await api.post("/api/channels", { name: trimmed, isPrivate, isAnnouncement });
      setName("");
      setIsPrivate(false);
      setIsAnnouncement(false);
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const communityChannels = channels.filter((c) => c.communityId);

  return (
    <div className="space-y-4">
      <div className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg">
        <h3 className="font-medium text-sm mb-3">Create Channel</h3>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="general"
              className="px-3 py-2 bg-[var(--muted)] rounded-lg text-sm w-32 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            Private
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isAnnouncement} onChange={(e) => setIsAnnouncement(e.target.checked)} />
            Announcement (read-only)
          </label>
          <button
            onClick={create}
            disabled={creating || !name.trim()}
            className="px-3 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>

      <div>
        <h3 className="font-medium text-sm mb-2">Channels</h3>
        <div className="space-y-2">
          {communityChannels.map((ch) => (
            <div
              key={ch.id}
              className="flex items-center gap-2 p-2 bg-[var(--card)] border border-[var(--border)] rounded-lg"
            >
              <Hash size={14} className="text-[var(--muted-foreground)]" />
              <span className="font-medium">#{ch.name}</span>
              {ch.isPrivate && <span className="text-xs bg-[var(--muted)] px-1.5 py-0.5 rounded">Private</span>}
              {ch.isAnnouncement && <span className="text-xs bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded">Read-only</span>}
            </div>
          ))}
          {communityChannels.length === 0 && (
            <p className="text-[var(--muted-foreground)] text-sm">No channels yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsTab() {
  const [community, setCommunity] = useState<any>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [accentColor, setAccentColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<any>("/api/community").then((c) => {
      setCommunity(c);
      setLogoUrl(c?.logoUrl ?? "");
      setAccentColor(c?.accentColor ?? "#6366f1");
    });
  }, []);

  const toggle = async (field: string, value: boolean) => {
    const updated = await api.patch<any>("/api/community", { [field]: value });
    setCommunity(updated);
  };

  const saveBranding = async () => {
    setSaving(true);
    try {
      const updated = await api.patch<any>("/api/community", {
        logoUrl: logoUrl.trim() || null,
        accentColor: accentColor || "#6366f1",
      });
      setCommunity(updated);
      document.documentElement.style.setProperty("--primary", accentColor);
      document.documentElement.style.setProperty("--accent", accentColor);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!community) return null;

  return (
    <div className="max-w-md space-y-6">
      <h3 className="font-semibold">Community Settings</h3>

      <div className="space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Image size={16} /> Customization
        </h4>
        <div className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg space-y-3">
          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1">Logo URL</label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1">Accent color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-[var(--border)]"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="flex-1 px-3 py-2 bg-[var(--muted)] rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
          </div>
          <button
            onClick={saveBranding}
            disabled={saving}
            className="px-3 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save branding"}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">Access</h4>
        <div className="flex items-center justify-between p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg">
          <div>
            <p className="text-sm font-medium">Invite Only</p>
            <p className="text-xs text-[var(--muted-foreground)]">Users need an invite to join</p>
          </div>
          <ToggleSwitch
            checked={community.inviteOnly}
            onChange={(v) => toggle("inviteOnly", v)}
          />
        </div>
        <div className="flex items-center justify-between p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg">
          <div>
            <p className="text-sm font-medium">Request to Join</p>
            <p className="text-xs text-[var(--muted-foreground)]">Users can request to join, mods approve</p>
          </div>
          <ToggleSwitch
            checked={community.requestToJoin}
            onChange={(v) => toggle("requestToJoin", v)}
          />
        </div>
      </div>
    </div>
  );
}

function CategoriesTab() {
  const [categories, setCategories] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = async () => {
    const [cats, chans] = await Promise.all([
      api.get<any[]>("/api/categories").catch(() => []),
      api.get<any[]>("/api/channels"),
    ]);
    setCategories(cats);
    setChannels(chans.filter((c: any) => c.communityId));
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api.post("/api/categories", { name: name.trim(), sortOrder: categories.length });
      setName("");
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const save = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await api.patch(`/api/categories/${id}`, { name: editName.trim() });
      setEditingId(null);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this category? Channels will become uncategorized.")) return;
    try {
      await api.delete(`/api/categories/${id}`);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const assignChannel = async (channelId: string, categoryId: string | null) => {
    try {
      await api.patch(`/api/channels/${channelId}`, { categoryId });
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg">
        <h3 className="font-medium text-sm mb-3">Create Category</h3>
        <div className="flex gap-2 items-end">
          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="General"
              className="px-3 py-2 bg-[var(--muted)] rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
          </div>
          <button
            onClick={create}
            disabled={creating || !name.trim()}
            className="px-3 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>

      <div>
        <h3 className="font-medium text-sm mb-2">Categories</h3>
        <div className="space-y-2">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg"
            >
              <div className="flex items-center justify-between mb-2">
                {editingId === cat.id ? (
                  <div className="flex gap-2 items-center flex-1">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="px-2 py-1 bg-[var(--muted)] rounded text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      onKeyDown={(e) => e.key === "Enter" && save(cat.id)}
                      autoFocus
                    />
                    <button onClick={() => save(cat.id)} className="text-xs px-2 py-1 bg-[var(--primary)] text-white rounded">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1 bg-[var(--muted)] rounded">Cancel</button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <FolderOpen size={14} className="text-[var(--muted-foreground)]" />
                      <span className="font-medium text-sm">{cat.name}</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}
                        className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => remove(cat.id)}
                        className="p-1 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="pl-5 space-y-1">
                {channels
                  .filter((ch) => ch.categoryId === cat.id)
                  .map((ch) => (
                    <div key={ch.id} className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                      <Hash size={10} />
                      <span>{ch.name}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
          {categories.length === 0 && (
            <p className="text-[var(--muted-foreground)] text-sm">No categories yet</p>
          )}
        </div>
      </div>

      {/* Channel-to-category assignment */}
      <div>
        <h3 className="font-medium text-sm mb-2">Assign Channels to Categories</h3>
        <div className="space-y-1">
          {channels.map((ch) => (
            <div key={ch.id} className="flex items-center gap-2 p-2 bg-[var(--card)] border border-[var(--border)] rounded-lg">
              <Hash size={14} className="text-[var(--muted-foreground)]" />
              <span className="text-sm font-medium">#{ch.name}</span>
              <select
                value={ch.categoryId || ""}
                onChange={(e) => assignChannel(ch.id, e.target.value || null)}
                className="ml-auto text-xs bg-[var(--muted)] border border-[var(--border)] rounded px-2 py-1 focus:outline-none"
              >
                <option value="">Uncategorized</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ onClick, label, danger, className }: { onClick: () => void; label: string; danger?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded ${
        className
          ? className
          : danger
            ? "bg-[var(--destructive)]/10 text-[var(--destructive)] hover:bg-[var(--destructive)]/20"
            : "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)]"
      }`}
    >
      {label}
    </button>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        checked ? "bg-[var(--primary)]" : "bg-[var(--border)]"
      }`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
