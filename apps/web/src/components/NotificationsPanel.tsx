"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { Notification } from "@watercooler/shared";
import { Bell, Check } from "lucide-react";

interface Props {
  onRead: () => void;
}

export function NotificationsPanel({ onRead }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    api.get<Notification[]>("/api/notifications").then(setNotifications);
  }, []);

  const markAllRead = async () => {
    await api.post("/api/notifications/mark-read", {});
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    onRead();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-12 px-4 flex items-center justify-between border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-[var(--muted-foreground)]" />
          <span className="font-semibold text-sm">Notifications</span>
        </div>
        <button
          onClick={markAllRead}
          className="flex items-center gap-1 text-sm text-[var(--primary)] hover:opacity-80"
        >
          <Check size={16} /> Mark all read
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {notifications.length === 0 && (
          <p className="text-[var(--muted-foreground)] text-sm text-center py-8">
            No notifications
          </p>
        )}
        {notifications.map((n) => {
          const payload = n.payload as Record<string, string>;
          return (
            <div
              key={n.id}
              className={`p-3 rounded-lg border ${
                n.readAt
                  ? "bg-[var(--card)] border-[var(--border)]"
                  : "bg-[var(--primary)]/5 border-[var(--primary)]/20"
              }`}
            >
              {n.type === "mention" && (
                <p className="text-sm">
                  <span className="font-medium">@{payload.mentionedBy}</span> mentioned you:{" "}
                  <span className="text-[var(--muted-foreground)]">{payload.content}</span>
                </p>
              )}
              {n.type === "event_update" && (
                <p className="text-sm">
                  Event updated: <span className="font-medium">{payload.title}</span>
                </p>
              )}
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                {new Date(n.createdAt).toLocaleString()}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
