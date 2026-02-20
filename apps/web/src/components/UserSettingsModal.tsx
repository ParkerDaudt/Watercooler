"use client";
import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useFocusTrap } from "@/lib/useFocusTrap";
import type { User } from "@watercooler/shared";
import { X, UserIcon, Lock, Palette, Camera, Github, Twitter, Globe } from "lucide-react";
import { UserAvatar } from "./UserAvatar";

interface Props {
  user: User;
  onClose: () => void;
  onUserUpdate: (user: User) => void;
}

type Tab = "profile" | "account" | "appearance";

export function UserSettingsModal({ user, onClose, onUserUpdate }: Props) {
  const [tab, setTab] = useState<Tab>("profile");
  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="User Settings" className="bg-[var(--background)] rounded-xl shadow-2xl w-full max-w-4xl h-[70vh] flex overflow-hidden border border-[var(--border)]">
        {/* Sidebar */}
        <div className="w-52 bg-[var(--card)] border-r border-[var(--border)] p-4 shrink-0">
          <h2 className="text-lg font-bold mb-4">User Settings</h2>
          <nav className="space-y-1">
            <SidebarButton icon={<UserIcon size={16} />} label="Profile" active={tab === "profile"} onClick={() => setTab("profile")} />
            <SidebarButton icon={<Lock size={16} />} label="Account" active={tab === "account"} onClick={() => setTab("account")} />
            <SidebarButton icon={<Palette size={16} />} label="Appearance" active={tab === "appearance"} onClick={() => setTab("appearance")} />
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
            {tab === "profile" && <ProfileTab user={user} onUserUpdate={onUserUpdate} />}
            {tab === "account" && <AccountTab user={user} onUserUpdate={onUserUpdate} />}
            {tab === "appearance" && <AppearanceTab />}
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

// --- Profile Tab ---
function ProfileTab({ user, onUserUpdate }: { user: User; onUserUpdate: (u: User) => void }) {
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio || "");
  const [pronouns, setPronouns] = useState(user.pronouns || "");
  const [github, setGithub] = useState(user.connectedLinks?.github || "");
  const [twitter, setTwitter] = useState(user.connectedLinks?.twitter || "");
  const [website, setWebsite] = useState(user.connectedLinks?.website || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (username !== user.username) updates.username = username;
      if (bio !== (user.bio || "")) updates.bio = bio;
      if (pronouns !== (user.pronouns || "")) updates.pronouns = pronouns;

      const newLinks = {
        github: github || null,
        twitter: twitter || null,
        website: website || null,
      };
      const oldLinks = user.connectedLinks || {};
      if (JSON.stringify(newLinks) !== JSON.stringify(oldLinks)) {
        updates.connectedLinks = newLinks;
      }

      if (Object.keys(updates).length === 0) {
        setError("No changes to save");
        setSaving(false);
        return;
      }

      const updated = await api.patch<User>("/api/users/me", updates);
      onUserUpdate({ ...user, ...updated });
      setSuccess("Profile updated!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save");
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
        onUserUpdate({ ...user, avatarUrl });
      } else {
        const err = await res.json();
        setError(err.error || "Failed to upload avatar");
      }
    } catch {
      setError("Failed to upload avatar");
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
        onUserUpdate({ ...user, bannerUrl });
      } else {
        const err = await res.json();
        setError(err.error || "Failed to upload banner");
      }
    } catch {
      setError("Failed to upload banner");
    }
    e.target.value = "";
  };

  return (
    <div className="max-w-lg space-y-6">
      {/* Banner */}
      <div>
        <label className="block text-sm font-medium mb-3">Banner</label>
        <div className="relative w-full h-24 rounded-lg overflow-hidden bg-[var(--muted)]">
          {user.bannerUrl ? (
            <img src={user.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[var(--primary)]/20" />
          )}
          <button
            onClick={() => bannerInputRef.current?.click()}
            className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
            title="Change banner"
          >
            <Camera size={20} className="text-white" />
          </button>
          <input ref={bannerInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleBannerUpload} />
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">Recommended: 600x240. Max 4MB.</p>
      </div>

      {/* Avatar */}
      <div>
        <label className="block text-sm font-medium mb-3">Avatar</label>
        <div className="flex items-center gap-4">
          <div className="relative">
            <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={16} />
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
              title="Change avatar"
            >
              <Camera size={20} className="text-white" />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>
          <button
            onClick={() => avatarInputRef.current?.click()}
            className="px-3 py-1.5 text-sm bg-[var(--muted)] rounded-lg hover:bg-[var(--border)]"
          >
            Upload Avatar
          </button>
        </div>
      </div>

      {/* Username */}
      <div>
        <label className="block text-sm font-medium mb-2">Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          maxLength={32}
        />
        <p className="text-xs text-[var(--muted-foreground)] mt-1">2-32 characters. Letters, numbers, underscores, hyphens only.</p>
      </div>

      {/* Pronouns */}
      <div>
        <label className="block text-sm font-medium mb-2">Pronouns</label>
        <input
          value={pronouns}
          onChange={(e) => setPronouns(e.target.value)}
          placeholder="e.g. they/them, she/her, he/him"
          className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          maxLength={50}
        />
        <p className="text-xs text-[var(--muted-foreground)] mt-1">Optional. Max 50 characters.</p>
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium mb-2">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell us about yourself..."
          maxLength={500}
          rows={3}
          className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />
        <p className="text-xs text-[var(--muted-foreground)] mt-1">{bio.length}/500</p>
      </div>

      {/* Connected Links */}
      <div className="space-y-3">
        <label className="block text-sm font-medium">Connected Links</label>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Github size={16} className="text-[var(--muted-foreground)] shrink-0" />
            <input
              value={github}
              onChange={(e) => setGithub(e.target.value)}
              placeholder="https://github.com/username"
              className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Twitter size={16} className="text-[var(--muted-foreground)] shrink-0" />
            <input
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="https://twitter.com/username"
              className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-[var(--muted-foreground)] shrink-0" />
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yourwebsite.com"
              className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
      {success && <p className="text-sm text-green-500">{success}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm"
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}

// --- Account Tab ---
function AccountTab({ user, onUserUpdate }: { user: User; onUserUpdate: (u: User) => void }) {
  const [email, setEmail] = useState(user.email || "");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  const handleEmailSave = async () => {
    setEmailError("");
    setEmailSuccess("");
    if (email === user.email) {
      setEmailError("No changes to save");
      return;
    }
    setEmailSaving(true);
    try {
      const updated = await api.patch<User>("/api/users/me", { email });
      onUserUpdate({ ...user, ...updated });
      setEmailSuccess("Email updated!");
      setTimeout(() => setEmailSuccess(""), 3000);
    } catch (err: any) {
      setEmailError(err.message || "Failed to update email");
    } finally {
      setEmailSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setPwError("");
    setPwSuccess("");
    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match");
      return;
    }
    setPwSaving(true);
    try {
      await api.post("/api/users/me/password", { currentPassword, newPassword });
      setPwSuccess("Password changed!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPwSuccess(""), 3000);
    } catch (err: any) {
      setPwError(err.message || "Failed to change password");
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="max-w-lg space-y-8">
      {/* Email */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold">Email</h4>
        <div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>
        {emailError && <p className="text-sm text-[var(--destructive)]">{emailError}</p>}
        {emailSuccess && <p className="text-sm text-green-500">{emailSuccess}</p>}
        <button
          onClick={handleEmailSave}
          disabled={emailSaving}
          className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm"
        >
          {emailSaving ? "Saving..." : "Update Email"}
        </button>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Change Password */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold">Change Password</h4>
        <div>
          <label className="block text-xs text-[var(--muted-foreground)] mb-1">Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--muted-foreground)] mb-1">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
          <p className="text-xs text-[var(--muted-foreground)] mt-1">Minimum 8 characters</p>
        </div>
        <div>
          <label className="block text-xs text-[var(--muted-foreground)] mb-1">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--muted)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>
        {pwError && <p className="text-sm text-[var(--destructive)]">{pwError}</p>}
        {pwSuccess && <p className="text-sm text-green-500">{pwSuccess}</p>}
        <button
          onClick={handlePasswordChange}
          disabled={pwSaving || !currentPassword || !newPassword}
          className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm"
        >
          {pwSaving ? "Changing..." : "Change Password"}
        </button>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Account info */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Account Info</h4>
        <p className="text-sm text-[var(--muted-foreground)]">
          Account created: {new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>
    </div>
  );
}
// --- Appearance Tab ---
function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h4 className="text-sm font-semibold mb-3">Theme</h4>
        <div className="flex gap-3">
          <button
            onClick={() => setTheme("light")}
            className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
              theme === "light"
                ? "border-[var(--primary)] bg-[var(--primary)]/10"
                : "border-[var(--border)] hover:border-[var(--muted-foreground)]"
            }`}
          >
            <div className="w-full h-16 rounded bg-white border border-gray-200 mb-2" />
            <p className="text-sm font-medium text-center">Light</p>
          </button>
          <button
            onClick={() => setTheme("dark")}
            className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
              theme === "dark"
                ? "border-[var(--primary)] bg-[var(--primary)]/10"
                : "border-[var(--border)] hover:border-[var(--muted-foreground)]"
            }`}
          >
            <div className="w-full h-16 rounded bg-gray-900 border border-gray-700 mb-2" />
            <p className="text-sm font-medium text-center">Dark</p>
          </button>
        </div>
      </div>
    </div>
  );
}
