"use client";

interface Props {
  username: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

const SIZE_CLASSES: Record<number, string> = {
  8: "w-8 h-8 text-xs",
  10: "w-10 h-10 text-sm",
  16: "w-16 h-16 text-2xl",
};

export function UserAvatar({ username, avatarUrl, size = 8, className = "" }: Props) {
  const sizeClass = SIZE_CLASSES[size] || `w-${size} h-${size} text-xs`;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={username}
        className={`${sizeClass} rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-[var(--primary)]/20 flex items-center justify-center font-bold text-[var(--primary)] ${className}`}
    >
      {username?.charAt(0)?.toUpperCase() || "?"}
    </div>
  );
}
