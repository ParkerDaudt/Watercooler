"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useFocusTrap } from "@/lib/useFocusTrap";
import type { UserProfile } from "@watercooler/shared";
import {
  X, Calendar, Shield, Camera, MessageSquare,
  Github, Twitter, Globe, StickyNote, Award,
  Hash, BarChart3, Clock,
} from "lucide-react";
import { StatusDot, STATUS_LABELS } from "./StatusDot";
import { UserAvatar } from "./UserAvatar";

interface Props {
  userId: string;
  currentUserId: string;
  onClose: () => void;
  onStartDm?: (userId: string) => void;
}

type ProfileTab = "overview" | "activity" | "mutual";

export function UserProfileModal({ userId, currentUserId, onClose, onStartDm }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [note, setNote] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  useEffect(() => {
    api
      .get<UserProfile>(`/api/users/${userId}/profile`)
      .then((data) => {
        setProfile(data);
        setBio(data.bio ?? "");
        setNote(data.note?.content ?? "");
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleSaveBio = async () => {
    if (userId !== currentUserId) return;
    setSaving(true);
    try {
      await api.patch("/api/users/me", { bio });
      setProfile((p) => (p ? { ...p, bio } : null));
      setEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/users/me/avatar", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (res.ok) {
        const { avatarUrl } = await res.json();
        setProfile((p) => (p ? { ...p, avatarUrl } : null));
      } else {
        const err = await res.json();
        alert(err.error || "Failed to upload avatar");
      }
    } catch {
      alert("Failed to upload avatar");
    }
    e.target.value = "";
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/users/me/banner", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (res.ok) {
        const { bannerUrl } = await res.json();
        setProfile((p) => (p ? { ...p, bannerUrl } : null));
      } else {
        const err = await res.json();
        alert(err.error || "Failed to upload banner");
      }
    } catch {
      alert("Failed to upload banner");
    }
    e.target.value = "";
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    try {
      if (note.trim()) {
        const result = await api.put<{ content: string; updatedAt: string }>(
          `/api/users/${userId}/note`, { content: note }
        );
        setProfile((p) => p ? { ...p, note: result } : null);
      } else {
        await api.delete(`/api/users/${userId}/note`);
        setProfile((p) => p ? { ...p, note: null } : null);
      }
      setEditingNote(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingNote(false);
    }
  };

  if (loading || !profile) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
        <div className="relative w-full max-w-md p-6 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl">
          <div className="text-center text-[var(--muted-foreground)]">Loading...</div>
        </div>
      </div>
    );
  }

  const isOwn = userId === currentUserId;
  const links = profile.connectedLinks;
  const hasLinks = links && (links.github || links.twitter || links.website);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="User Profile" className="relative w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden max-h-[85vh] flex flex-col">

        {/* Banner */}
        <div className="h-28 relative overflow-hidden shrink-0">
          {profile.bannerUrl ? (
            <img src={profile.bannerUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[var(--primary)]/20" />
          )}
          {isOwn && (
            <button
              onClick={() => bannerInputRef.current?.click()}
              className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
              title="Change banner"
            >
              <Camera size={24} className="text-white" />
            </button>
          )}
          <input ref={bannerInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleBannerUpload} />
        </div>

        {/* Header: Avatar + Close */}
        <div className="px-6 -mt-10 shrink-0">
          <div className="flex items-end justify-between mb-3">
            <div className="relative">
              <UserAvatar username={profile.username} avatarUrl={profile.avatarUrl} size={16} className="border-4 border-[var(--card)]" />
              {isOwn && (
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                  title="Change avatar"
                >
                  <Camera size={20} className="text-white" />
                </button>
              )}
              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleAvatarUpload} />
              <StatusDot
                status={profile.status ?? "offline"}
                size={14}
                className="absolute -bottom-0.5 -right-0.5 border-2 border-[var(--card)]"
              />
            </div>
            <button
              onClick={onClose}
              className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Username + Pronouns */}
          <h2 className="text-xl font-semibold">{profile.username}</h2>
          {profile.pronouns && (
            <p className="text-sm text-[var(--muted-foreground)]">{profile.pronouns}</p>
          )}

          {/* Badges */}
          {profile.badges && profile.badges.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {profile.badges.map((badge) => (
                <span
                  key={badge.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: badge.color + "20", color: badge.color }}
                  title={badge.description}
                >
                  <Award size={12} />
                  {badge.name}
                </span>
              ))}
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-2 mt-2">
            <StatusDot status={profile.status ?? "offline"} size={10} />
            <span className="text-sm text-[var(--muted-foreground)]">
              {profile.status ? STATUS_LABELS[profile.status] : "Offline"}
            </span>
          </div>
          {profile.customStatus && (
            <p className="text-sm text-[var(--foreground)] mt-1 italic">
              {profile.customStatus}
            </p>
          )}

          {/* Membership info */}
          {profile.membership && (
            <div className="flex flex-wrap gap-2 mt-3">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  profile.membership.role === "owner"
                    ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                    : profile.membership.role === "moderator"
                      ? "bg-[var(--primary)]/20 text-[var(--primary)]"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                }`}
              >
                <Shield size={12} />
                {profile.membership.role}
              </span>
              {profile.membership.roles?.map((r) => (
                <span
                  key={r.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: r.color + "20", color: r.color }}
                >
                  {r.name}
                </span>
              ))}
              <span className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                <Calendar size={12} />
                Joined {new Date(profile.membership.joinedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </div>
          )}

          {/* DM button */}
          {!isOwn && onStartDm && (
            <button
              onClick={() => { onStartDm(userId); onClose(); }}
              className="flex items-center gap-2 px-3 py-1.5 mt-3 bg-[var(--primary)] text-white rounded-lg text-sm hover:opacity-90"
            >
              <MessageSquare size={14} />
              Send Message
            </button>
          )}

          {/* Connected links */}
          {hasLinks && (
            <div className="flex gap-3 mt-3">
              {links!.github && (
                <a href={links!.github} target="_blank" rel="noopener noreferrer"
                   className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]" title="GitHub">
                  <Github size={18} />
                </a>
              )}
              {links!.twitter && (
                <a href={links!.twitter} target="_blank" rel="noopener noreferrer"
                   className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]" title="Twitter">
                  <Twitter size={18} />
                </a>
              )}
              {links!.website && (
                <a href={links!.website} target="_blank" rel="noopener noreferrer"
                   className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]" title="Website">
                  <Globe size={18} />
                </a>
              )}
            </div>
          )}

          {/* Tab bar */}
          <div className="flex border-b border-[var(--border)] mt-4 -mx-6 px-6">
            {(["overview", "activity", "mutual"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === t
                    ? "border-[var(--primary)] text-[var(--primary)]"
                    : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                {t === "mutual" ? "Mutual" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* Bio */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-[var(--muted-foreground)]">Bio</h3>
                {editing && isOwn ? (
                  <div className="space-y-2">
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell us about yourself..."
                      maxLength={500}
                      rows={3}
                      className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-[var(--muted-foreground)]">{bio.length}/500</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditing(false); setBio(profile.bio ?? ""); }}
                          className="px-3 py-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveBio}
                          disabled={saving}
                          className="px-3 py-1 text-sm bg-[var(--primary)] text-white rounded-md hover:opacity-90 disabled:opacity-50"
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-[var(--foreground)] flex-1 min-w-0">
                      {profile.bio || (isOwn ? "No bio yet. Click Edit to add one." : "No bio.")}
                    </p>
                    {isOwn && (
                      <button
                        onClick={() => setEditing(true)}
                        className="text-sm text-[var(--primary)] hover:underline shrink-0"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Private note (other users only) */}
              {!isOwn && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-[var(--muted-foreground)] flex items-center gap-1.5">
                    <StickyNote size={14} />
                    Note
                  </h3>
                  {editingNote ? (
                    <div className="space-y-2">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add a private note about this user..."
                        maxLength={1000}
                        rows={3}
                        className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      />
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-[var(--muted-foreground)]">{note.length}/1000</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditingNote(false); setNote(profile.note?.content ?? ""); }}
                            className="px-3 py-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveNote}
                            disabled={savingNote}
                            className="px-3 py-1 text-sm bg-[var(--primary)] text-white rounded-md hover:opacity-90 disabled:opacity-50"
                          >
                            {savingNote ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-[var(--foreground)] flex-1 min-w-0 italic">
                        {profile.note?.content || "No note. Click Edit to add one."}
                      </p>
                      <button
                        onClick={() => setEditingNote(true)}
                        className="text-sm text-[var(--primary)] hover:underline shrink-0"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "activity" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-[var(--muted)] rounded-lg">
                <BarChart3 size={18} className="text-[var(--primary)] shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {(profile.activityStats?.messageCount ?? 0).toLocaleString()} messages
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">Total messages sent</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-[var(--muted)] rounded-lg">
                <Clock size={18} className="text-[var(--primary)] shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {profile.activityStats?.lastActiveAt
                      ? new Date(profile.activityStats.lastActiveAt).toLocaleDateString(undefined, {
                          month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
                        })
                      : "Never"}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">Last active</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "mutual" && (
            <div className="space-y-1">
              {profile.mutualChannels && profile.mutualChannels.length > 0 ? (
                profile.mutualChannels.map((ch) => (
                  <div key={ch.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--muted)]">
                    <Hash size={16} className="text-[var(--muted-foreground)]" />
                    <span className="text-sm">{ch.name}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--muted-foreground)] py-2">No shared private channels</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
