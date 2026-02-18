"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { Message } from "@watercooler/shared";
import { Pin, X } from "lucide-react";

interface Props {
  channelId: string;
  isMod: boolean;
  currentUserId: string;
  onClose: () => void;
}

export function PinnedMessagesPanel({ channelId, isMod, currentUserId, onClose }: Props) {
  const [pins, setPins] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<Message[]>(`/api/channels/${channelId}/pins`)
      .then(setPins)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [channelId]);

  const handleUnpin = async (messageId: string) => {
    try {
      await api.patch(`/api/channels/${channelId}/pins/${messageId}`);
      setPins((prev) => prev.filter((p) => p.id !== messageId));
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="border-b border-[var(--border)] bg-[var(--card)] max-h-64 overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] sticky top-0 bg-[var(--card)] z-10">
        <div className="flex items-center gap-2">
          <Pin size={14} className="text-[var(--primary)]" />
          <span className="text-sm font-medium">Pinned Messages</span>
          <span className="text-xs text-[var(--muted-foreground)]">({pins.length})</span>
        </div>
        <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          <X size={16} />
        </button>
      </div>

      {loading && (
        <p className="text-center text-sm text-[var(--muted-foreground)] py-4">Loading...</p>
      )}

      {!loading && pins.length === 0 && (
        <p className="text-center text-sm text-[var(--muted-foreground)] py-4">No pinned messages</p>
      )}

      {pins.map((msg) => (
        <div key={msg.id} className="px-4 py-2 border-b border-[var(--border)]/50 hover:bg-[var(--muted)] flex gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-xs">{msg.user?.username || "Unknown"}</span>
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {new Date(msg.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="text-sm truncate">{msg.content}</p>
          </div>
          {(isMod || msg.userId === currentUserId) && (
            <button
              onClick={() => handleUnpin(msg.id)}
              className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] shrink-0 p-1"
              title="Unpin"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
