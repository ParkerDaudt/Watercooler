"use client";
import { useState } from "react";
import type { UserStatus } from "@watercooler/shared";
import { getSocket } from "@/lib/socket";
import { StatusDot, STATUS_LABELS } from "./StatusDot";
import { X } from "lucide-react";

const STATUSES: UserStatus[] = ["online", "away", "dnd", "invisible"];

interface Props {
  currentStatus: UserStatus;
  currentCustomStatus: string;
  onClose: () => void;
  onStatusChange: (status: UserStatus, customStatus: string) => void;
}

export function StatusPicker({ currentStatus, currentCustomStatus, onClose, onStatusChange }: Props) {
  const [customText, setCustomText] = useState(currentCustomStatus);

  const setStatus = (status: UserStatus) => {
    const socket = getSocket();
    socket.emit("set_status", { status, customStatus: customText }, (res) => {
      if (res.ok) {
        onStatusChange(status, customText);
      }
    });
    onClose();
  };

  const saveCustomStatus = () => {
    const socket = getSocket();
    socket.emit("set_status", { status: currentStatus, customStatus: customText }, (res) => {
      if (res.ok) {
        onStatusChange(currentStatus, customText);
      }
    });
    onClose();
  };

  const clearCustomStatus = () => {
    const socket = getSocket();
    socket.emit("set_status", { status: currentStatus, customStatus: "" }, (res) => {
      if (res.ok) {
        onStatusChange(currentStatus, "");
        setCustomText("");
      }
    });
  };

  return (
    <div className="absolute bottom-14 left-1 z-50 w-64 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <span className="text-xs font-semibold text-[var(--muted-foreground)]">Set Status</span>
        <button onClick={onClose} className="p-0.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          <X size={14} />
        </button>
      </div>

      {/* Custom status input */}
      <div className="px-3 py-2 border-b border-[var(--border)]">
        <div className="flex gap-2">
          <input
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="What's on your mind?"
            maxLength={128}
            className="flex-1 px-2 py-1.5 bg-[var(--muted)] rounded text-xs focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            onKeyDown={(e) => e.key === "Enter" && saveCustomStatus()}
          />
          {customText && (
            <button
              onClick={clearCustomStatus}
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Status options */}
      <div className="py-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--muted)] transition-colors ${
              s === currentStatus ? "text-[var(--primary)]" : "text-[var(--foreground)]"
            }`}
          >
            <StatusDot status={s} size={10} />
            <span>{STATUS_LABELS[s]}</span>
            {s === currentStatus && (
              <span className="ml-auto text-xs text-[var(--muted-foreground)]">Current</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
