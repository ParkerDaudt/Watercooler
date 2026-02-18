"use client";
import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { useFocusTrap } from "@/lib/useFocusTrap";
import type { Channel } from "@watercooler/shared";
import { X, User, Search } from "lucide-react";

interface Member {
  userId: string;
  username: string;
  status: string;
  role?: string;
}

interface Props {
  currentUserId: string;
  onSelect: (channel: Channel) => void;
  onClose: () => void;
}

export function DmUserPicker({ currentUserId, onSelect, onClose }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Member[]>("/api/members")
      .then((data) => setMembers(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const dmableMembers = useMemo(() => {
    return members.filter(
      (m) => m.userId !== currentUserId && m.status === "active"
    );
  }, [members, currentUserId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return dmableMembers;
    const q = search.toLowerCase();
    return dmableMembers.filter((m) =>
      m.username.toLowerCase().includes(q)
    );
  }, [dmableMembers, search]);

  const handleSelect = async (member: Member) => {
    setCreating(member.userId);
    setError(null);
    try {
      const channel = await api.post<Channel>("/api/dms", { userId: member.userId });
      onSelect(channel);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start DM");
    } finally {
      setCreating(null);
    }
  };

  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="Start a direct message" className="relative w-full max-w-md max-h-[80vh] flex flex-col bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-sm">Start a direct message</h2>
          <button
            onClick={onClose}
            className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-2 border-b border-[var(--border)]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members..."
              className="w-full pl-9 pr-3 py-2 bg-[var(--muted)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {loading ? (
            <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
              Loading members...
            </div>
          ) : error ? (
            <div className="py-4 text-center text-sm text-[var(--destructive)]">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
              {search.trim()
                ? "No members match your search"
                : "No other members in this community"}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((member) => (
                <button
                  key={member.userId}
                  onClick={() => handleSelect(member)}
                  disabled={!!creating}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
                >
                  <div className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center shrink-0">
                    <User size={14} className="text-[var(--primary)]" />
                  </div>
                  <span className="flex-1 truncate font-medium">{member.username}</span>
                  {creating === member.userId && (
                    <span className="text-xs text-[var(--muted-foreground)]">Starting...</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
