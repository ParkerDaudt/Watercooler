"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Message, UserStatus, LinkPreview } from "@watercooler/shared";
import { Flag, Trash2, Pencil, Reply, Smile, X, Check, Pin, MessageSquare } from "lucide-react";
import { StatusDot } from "./StatusDot";
import { UserAvatar } from "./UserAvatar";

const EMOJI_OPTIONS = [
  { emoji: "\u{1F44D}", label: "thumbs up" },
  { emoji: "\u2764\uFE0F", label: "heart" },
  { emoji: "\u{1F602}", label: "laugh" },
  { emoji: "\u{1F62E}", label: "surprised" },
  { emoji: "\u{1F622}", label: "sad" },
  { emoji: "\u{1F525}", label: "fire" },
];

interface Props {
  message: Message;
  isOwn: boolean;
  isMod: boolean;
  channelId: string;
  currentUserId: string;
  onReply: () => void;
  onUserClick?: (userId: string) => void;
  onPin?: () => void;
  onViewThread?: (messageId: string) => void;
  userStatus?: UserStatus | "offline";
}

function renderContent(content: string) {
  let html = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (before other formatting)
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-[var(--background)] rounded p-2 my-1 text-xs overflow-x-auto"><code>$1</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-[var(--background)] px-1 rounded text-xs">$1</code>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");
  // Blockquotes (> is escaped to &gt;)
  html = html.replace(/^&gt; (.+)$/gm, '<div class="border-l-2 border-[var(--primary)] pl-2 text-[var(--muted-foreground)] my-1">$1</div>');
  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
  // URLs
  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener" class="text-[var(--primary)] hover:underline">$1</a>'
  );
  // Mentions
  html = html.replace(
    /@(\w+)/g,
    '<span class="bg-[var(--primary)]/20 text-[var(--primary)] px-1 rounded">@$1</span>'
  );

  return html;
}

function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-2 max-w-md border border-[var(--border)] rounded-lg overflow-hidden hover:bg-[var(--muted)] transition-colors"
    >
      {preview.image && (
        <div className="w-full h-32 bg-[var(--muted)]">
          <img
            src={preview.image}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-3">
        {preview.siteName && (
          <p className="text-[10px] text-[var(--primary)] font-medium mb-0.5 uppercase tracking-wide">
            {preview.siteName}
          </p>
        )}
        {preview.title && (
          <p className="text-sm font-semibold text-[var(--foreground)] line-clamp-2">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="text-xs text-[var(--muted-foreground)] mt-1 line-clamp-2">
            {preview.description}
          </p>
        )}
      </div>
    </a>
  );
}

export function MessageBubble({ message, isOwn, isMod, channelId, currentUserId, onReply, onUserClick, onPin, onViewThread, userStatus }: Props) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const handleDelete = async () => {
    if (isOwn) {
      if (!confirm("Delete this message?")) return;
      const socket = getSocket();
      socket.emit("delete_message", { messageId: message.id }, (res) => {
        if (!res.ok) alert(res.error || "Failed to delete");
      });
    } else if (isMod) {
      try {
        await api.post("/api/mod/delete-message", { messageId: message.id });
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const handleEdit = () => {
    setEditing(true);
    setEditContent(message.content);
    setShowActions(false);
  };

  const saveEdit = () => {
    const text = editContent.trim();
    if (!text || text === message.content) {
      setEditing(false);
      return;
    }
    const socket = getSocket();
    socket.emit("edit_message", { messageId: message.id, content: text }, (res) => {
      if (!res.ok) alert(res.error || "Failed to edit");
    });
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditContent(message.content);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    }
    if (e.key === "Escape") {
      cancelEdit();
    }
  };

  const handleReport = async () => {
    const reason = prompt("Reason for report:");
    if (!reason) return;
    try {
      await api.post("/api/reports", { messageId: message.id, reason });
      alert("Report submitted");
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReaction = (emoji: string) => {
    const socket = getSocket();
    const existing = (message.reactions || []).find(
      (r) => r.emoji === emoji && r.userId === currentUserId
    );
    if (existing) {
      socket.emit("remove_reaction", { messageId: message.id, emoji }, (res) => {
        if (!res.ok) console.error(res.error);
      });
    } else {
      socket.emit("add_reaction", { messageId: message.id, emoji }, (res) => {
        if (!res.ok) console.error(res.error);
      });
    }
    setShowEmojiPicker(false);
  };

  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Group reactions by emoji
  const reactionGroups = (message.reactions || []).reduce<Record<string, { count: number; userReacted: boolean; users: string[] }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, userReacted: false, users: [] };
    acc[r.emoji].count++;
    if (r.userId === currentUserId) acc[r.emoji].userReacted = true;
    if (r.user?.username) acc[r.emoji].users.push(r.user.username);
    return acc;
  }, {});

  return (
    <div
      className="group flex gap-3 py-1 px-2 rounded hover:bg-[var(--muted)] transition-colors"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowEmojiPicker(false); }}
    >
      {/* Avatar */}
      <div className="relative w-8 h-8 shrink-0 mt-0.5">
        <UserAvatar username={message.user?.username || "?"} avatarUrl={message.user?.avatarUrl} size={8} />
        {userStatus && (
          <StatusDot
            status={userStatus}
            size={10}
            className="absolute -bottom-0.5 -right-0.5 border-2 border-[var(--background)]"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          {onUserClick && message.userId ? (
            <button
              onClick={() => onUserClick(message.userId)}
              className="font-semibold text-sm hover:text-[var(--primary)] hover:underline text-left"
            >
              {message.user?.username || "Unknown"}
            </button>
          ) : (
            <span className="font-semibold text-sm">{message.user?.username || "Unknown"}</span>
          )}
          <span className="text-[10px] text-[var(--muted-foreground)]">{time}</span>
          {message.isPinned && (
            <Pin size={10} className="text-[var(--primary)]" />
          )}
          {message.editedAt && (
            <span className="text-[10px] text-[var(--muted-foreground)]">(edited)</span>
          )}
        </div>

        {/* Reply snippet */}
        {message.replyTo && (
          <div className="flex items-center gap-1 mb-1 text-xs text-[var(--muted-foreground)] border-l-2 border-[var(--primary)] pl-2">
            <Reply size={10} className="shrink-0" />
            <span className="font-medium">{message.replyTo.user?.username}</span>
            <span className="truncate">{message.replyTo.content}</span>
          </div>
        )}

        {/* Content or edit mode */}
        {editing ? (
          <div className="flex items-end gap-1 mt-1">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              rows={2}
              autoFocus
            />
            <button onClick={saveEdit} className="p-1 text-green-500 hover:text-green-400" title="Save">
              <Check size={16} />
            </button>
            <button onClick={cancelEdit} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" title="Cancel">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div
            className="text-sm break-words"
            dangerouslySetInnerHTML={{ __html: renderContent(message.content) }}
          />
        )}

        {/* Attachments */}
        {message.attachments?.map((a) => (
          <div key={a.id} className="mt-1">
            {a.mime.startsWith("image/") ? (
              <img
                src={a.url}
                alt={a.filename}
                className="max-w-sm max-h-64 rounded-lg border border-[var(--border)]"
              />
            ) : (
              <a
                href={a.url}
                target="_blank"
                rel="noopener"
                className="text-sm text-[var(--primary)] hover:underline"
              >
                {a.filename} ({(a.size / 1024).toFixed(0)} KB)
              </a>
            )}
          </div>
        ))}

        {/* Link Previews */}
        {!editing && message.linkPreviews && message.linkPreviews.length > 0 && (
          <div className="space-y-2">
            {message.linkPreviews.map((preview, i) => (
              <LinkPreviewCard key={preview.url || i} preview={preview} />
            ))}
          </div>
        )}

        {/* Reaction pills */}
        {Object.keys(reactionGroups).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(reactionGroups).map(([emoji, { count, userReacted, users }]) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                title={users.join(", ")}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  userReacted
                    ? "bg-[var(--primary)]/20 border-[var(--primary)] text-[var(--primary)]"
                    : "bg-[var(--muted)] border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]"
                }`}
              >
                <span>{emoji}</span>
                <span>{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread reply count badge */}
        {(message.replyCount ?? 0) > 0 && onViewThread && (
          <button
            onClick={() => onViewThread(message.id)}
            className="flex items-center gap-1 mt-1 text-xs text-[var(--primary)] hover:underline"
          >
            <MessageSquare size={12} />
            <span>{message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}</span>
          </button>
        )}
      </div>

      {/* Actions */}
      {showActions && !editing && (
        <div className="flex items-start gap-0.5 shrink-0 relative">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            title="React"
            aria-label="React"
          >
            <Smile size={14} />
          </button>
          <button
            onClick={onReply}
            className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            title="Reply"
            aria-label="Reply"
          >
            <Reply size={14} />
          </button>
          {onPin && (isOwn || isMod) && (
            <button
              onClick={onPin}
              className={`p-1 hover:text-[var(--foreground)] ${message.isPinned ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`}
              title={message.isPinned ? "Unpin" : "Pin"}
              aria-label={message.isPinned ? "Unpin" : "Pin"}
            >
              <Pin size={14} />
            </button>
          )}
          {isOwn && (
            <button
              onClick={handleEdit}
              className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              title="Edit"
              aria-label="Edit"
            >
              <Pencil size={14} />
            </button>
          )}
          {!isOwn && (
            <button
              onClick={handleReport}
              className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              title="Report"
              aria-label="Report"
            >
              <Flag size={14} />
            </button>
          )}
          {(isOwn || isMod) && (
            <button
              onClick={handleDelete}
              className="p-1 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
              title="Delete"
              aria-label="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}

          {/* Emoji picker popup */}
          {showEmojiPicker && (
            <div className="absolute right-0 top-7 z-10 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg p-2 flex gap-1">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e.emoji}
                  onClick={() => handleReaction(e.emoji)}
                  className="text-lg hover:scale-125 transition-transform p-1"
                  title={e.label}
                >
                  {e.emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
