"use client";
import type { UserStatus } from "@watercooler/shared";

const STATUS_COLORS: Record<UserStatus | "offline", string> = {
  online: "bg-green-500",
  away: "bg-yellow-500",
  dnd: "bg-red-500",
  invisible: "bg-gray-400",
  offline: "bg-gray-400",
};

const STATUS_LABELS: Record<UserStatus | "offline", string> = {
  online: "Online",
  away: "Away",
  dnd: "Do Not Disturb",
  invisible: "Invisible",
  offline: "Offline",
};

interface Props {
  status: UserStatus | "offline";
  size?: number;
  className?: string;
}

export function StatusDot({ status, size = 10, className = "" }: Props) {
  return (
    <span
      className={`inline-block rounded-full ${STATUS_COLORS[status]} ${className}`}
      style={{ width: size, height: size }}
      title={STATUS_LABELS[status]}
    />
  );
}

export { STATUS_COLORS, STATUS_LABELS };
