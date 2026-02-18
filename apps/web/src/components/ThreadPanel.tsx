"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Message } from "@watercooler/shared";
import { MessageBubble } from "./MessageBubble";
import { X, MessageSquare } from "lucide-react";

interface Props {
  messageId: string;
  channelId: string;
  user: { id: string; username: string };
  isMod: boolean;
  onClose: () => void;
}

export function ThreadPanel({ messageId, channelId, user, isMod, onClose }: Props) {
  const [root, setRoot] = useState<Message | null>(null);
  const [replies, setReplies] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThread = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ root: Message; replies: Message[] }>(
        `/api/messages/${messageId}/thread`
      );
      setRoot(data.root);
      setReplies(data.replies);
    } catch (err) {
      console.error("Failed to load thread", err);
    } finally {
      setLoading(false);
    }
  }, [messageId]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  // Listen for new messages that are replies to this thread's root
  useEffect(() => {
    if (!root) return;
    const socket = getSocket();
    const rootId = root.id;

    const handleNew = (msg: Message) => {
      if (msg.channelId === channelId && msg.replyToId === rootId) {
        setReplies((prev) => [...prev, msg]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    };

    const handleUpdated = (msg: Message) => {
      if (msg.channelId === channelId) {
        if (msg.id === rootId) {
          setRoot((prev) => prev ? { ...prev, content: msg.content, editedAt: msg.editedAt } : prev);
        }
        setReplies((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, content: msg.content, editedAt: msg.editedAt } : m))
        );
      }
    };

    const handleDeleted = ({ messageId: mId }: { channelId: string; messageId: string }) => {
      setReplies((prev) => prev.filter((m) => m.id !== mId));
    };

    socket.on("new_message", handleNew);
    socket.on("message_updated", handleUpdated);
    socket.on("message_deleted", handleDeleted);

    return () => {
      socket.off("new_message", handleNew);
      socket.off("message_updated", handleUpdated);
      socket.off("message_deleted", handleDeleted);
    };
  }, [root, channelId]);

  const sendReply = () => {
    const text = input.trim();
    if (!text || !root) return;
    const socket = getSocket();
    socket.emit(
      "send_message",
      { channelId, content: text, replyToId: root.id },
      (res) => {
        if (!res.ok) console.error("Send failed:", res.error);
      }
    );
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  };

  return (
    <div className="w-[380px] border-l border-[var(--border)] flex flex-col bg-[var(--background)] shrink-0">
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Thread</span>
        </div>
        <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          <X size={18} />
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-[var(--muted-foreground)] text-sm">
          Loading thread...
        </div>
      )}

      {!loading && root && (
        <>
          {/* Root message */}
          <div className="border-b border-[var(--border)] p-2 bg-[var(--muted)]/30">
            <MessageBubble
              message={root}
              isOwn={root.userId === user.id}
              isMod={isMod}
              channelId={channelId}
              currentUserId={user.id}
              onReply={() => {}}
            />
          </div>

          {/* Replies */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            <p className="text-xs text-[var(--muted-foreground)] px-2 py-1">
              {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </p>
            {replies.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.userId === user.id}
                isMod={isMod}
                channelId={channelId}
                currentUserId={user.id}
                onReply={() => {}}
              />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Reply input */}
          <div className="p-3 border-t border-[var(--border)]">
            <div className="flex items-end gap-2 bg-[var(--muted)] rounded-lg px-3 py-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Reply in thread..."
                rows={1}
                className="flex-1 bg-transparent resize-none focus:outline-none text-sm max-h-24"
              />
              <button
                onClick={sendReply}
                disabled={!input.trim()}
                className="text-[var(--primary)] hover:opacity-80 disabled:opacity-30 font-medium text-sm px-2"
              >
                Send
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
