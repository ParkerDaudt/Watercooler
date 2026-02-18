"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useFocusTrap } from "@/lib/useFocusTrap";
import type { UserProfile, UserStatus } from "@watercooler/shared";
import { X, Calendar, Shield, Camera, MessageSquare } from "lucide-react";
import { StatusDot, STATUS_LABELS } from "./StatusDot";
import { UserAvatar } from "./UserAvatar";

interface Props {
  userId: string;
  currentUserId: string;
  onClose: () => void;
  onStartDm?: (userId: string) => void;
}

export function UserProfileModal({ userId, currentUserId, onClose, onStartDm }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="User Profile" className="relative w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden">
        <div className="h-20 bg-[var(--primary)]/20" />
        <div className="px-6 pb-6 -mt-10">
          <div className="flex items-end justify-between mb-4">
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
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />
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

          <h2 className="text-xl font-semibold mb-1">{profile.username}</h2>

          {/* Status */}
          <div className="flex items-center gap-2 mb-2">
            <StatusDot status={profile.status ?? "offline"} size={10} />
            <span className="text-sm text-[var(--muted-foreground)]">
              {profile.status ? STATUS_LABELS[profile.status] : "Offline"}
            </span>
          </div>
          {profile.customStatus && (
            <p className="text-sm text-[var(--foreground)] mb-3 italic">
              {profile.customStatus}
            </p>
          )}

          {profile.membership && (
            <div className="flex flex-wrap gap-2 mb-4">
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

          {/* DM button for other users */}
          {!isOwn && onStartDm && (
            <button
              onClick={() => { onStartDm(userId); onClose(); }}
              className="flex items-center gap-2 px-3 py-1.5 mb-4 bg-[var(--primary)] text-white rounded-lg text-sm hover:opacity-90"
            >
              <MessageSquare size={14} />
              Send Message
            </button>
          )}

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
        </div>
      </div>
    </div>
  );
}
