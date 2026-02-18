 "use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Message, Reaction } from "@watercooler/shared";
import { MessageBubble } from "./MessageBubble";
import { UserProfileModal } from "./UserProfileModal";
import { PinnedMessagesPanel } from "./PinnedMessagesPanel";
import { ThreadPanel } from "./ThreadPanel";
import { SearchPanel } from "./SearchPanel";
import { Hash, Paperclip, X, User, Pin, Search, Bold, Italic, Code, Braces, Smile, Menu } from "lucide-react";
import { EmojiPicker } from "./EmojiPicker";

interface Props {
  channelId: string;
  channelName: string;
  user: { id: string; username: string };
  isMod: boolean;
  isDm?: boolean;
  isAnnouncement?: boolean;
  onMarkRead?: () => void;
  onNavigateChannel?: (channelId: string) => void;
  onlineUsers?: Map<string, { status: string; customStatus: string }>;
  onMenuClick?: () => void;
  onStartDm?: (userId: string) => void;
}

export function ChatPanel({ channelId, channelName, user, isMod, isDm, isAnnouncement, onMarkRead, onNavigateChannel, onlineUsers, onMenuClick, onStartDm }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionUsers, setMentionUsers] = useState<Array<{ id: string; username: string }>>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [showPins, setShowPins] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [threadMessageId, setThreadMessageId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingEmit = useRef(0);
  const mentionItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const markReadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const insertMention = useCallback((mentionUser: { id: string; username: string }) => {
    const cursorPos = textareaRef.current?.selectionStart ?? 0;
    const textBeforeCursor = input.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    const newText = input.slice(0, atIndex) + `@${mentionUser.username} ` + input.slice(cursorPos);
    setInput(newText);
    setShowMentions(false);
    textareaRef.current?.focus();
    setTimeout(() => {
      const newPos = atIndex + mentionUser.username.length + 2;
      textareaRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  }, [input]);

  const loadMessages = useCallback(async (cursor?: string) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "50" };
      if (cursor) params.cursor = cursor;
      const msgs = await api.get<Message[]>(`/api/channels/${channelId}/messages`, params);
      if (cursor) {
        setMessages((prev) => [...prev, ...msgs]);
      } else {
        setMessages(msgs);
      }
      setHasMore(msgs.length === 50);
    } catch (err) {
      console.error("Failed to load messages", err);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    setMessages([]);
    setHasMore(true);
    setReplyTo(null);
    setTypingUsers(new Map());
    setShowPins(false);
    setThreadMessageId(null);
    loadMessages();

    // Mark channel as read when entering
    api.post(`/api/channels/${channelId}/read`)
      .then(() => onMarkRead?.())
      .catch((err) => {
        console.error("Failed to mark channel as read", err);
      });
  }, [channelId, loadMessages, onMarkRead]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("join_channel", channelId);

    const handleNewMessage = (msg: Message) => {
      if (msg.channelId === channelId) {
        setMessages((prev) => [msg, ...prev]);
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(msg.userId);
          return next;
        });
        // Debounce: mark as read since user is viewing; refresh unread badges
        if (markReadTimeoutRef.current) clearTimeout(markReadTimeoutRef.current);
        markReadTimeoutRef.current = setTimeout(() => {
          markReadTimeoutRef.current = null;
          api.post(`/api/channels/${channelId}/read`).then(() => onMarkRead?.()).catch(console.error);
        }, 500);
      }
    };

    const handleMessageUpdated = (msg: Message) => {
      if (msg.channelId === channelId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, content: msg.content ?? m.content, editedAt: msg.editedAt ?? m.editedAt, linkPreviews: msg.linkPreviews ?? m.linkPreviews } : m))
        );
      }
    };

    const handleDeleteMessage = ({ channelId: cId, messageId }: { channelId: string; messageId: string }) => {
      if (cId === channelId) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    };

    const handleTyping = ({ channelId: cId, userId: uid, username }: { channelId: string; userId: string; username: string }) => {
      if (cId === channelId && uid !== user.id) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.set(uid, username);
          return next;
        });
      }
    };

    const handleStopTyping = ({ channelId: cId, userId: uid }: { channelId: string; userId: string }) => {
      if (cId === channelId) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(uid);
          return next;
        });
      }
    };

    const handleReactionAdded = ({ channelId: cId, messageId, reaction }: { channelId: string; messageId: string; reaction: Reaction }) => {
      if (cId === channelId) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            return { ...m, reactions: [...(m.reactions || []), reaction] };
          })
        );
      }
    };

    const handleReactionRemoved = ({ channelId: cId, messageId, userId: uid, emoji }: { channelId: string; messageId: string; userId: string; emoji: string }) => {
      if (cId === channelId) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            return { ...m, reactions: (m.reactions || []).filter((r) => !(r.userId === uid && r.emoji === emoji)) };
          })
        );
      }
    };

    const handleMessagePinned = ({ channelId: cId, messageId, isPinned, pinnedBy, pinnedAt }: { channelId: string; messageId: string; isPinned: boolean; pinnedBy: string | null; pinnedAt: string | null }) => {
      if (cId === channelId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, isPinned, pinnedBy, pinnedAt } : m))
        );
      }
    };

    socket.on("new_message", handleNewMessage);
    socket.on("message_updated", handleMessageUpdated);
    socket.on("message_deleted", handleDeleteMessage);
    socket.on("typing", handleTyping);
    socket.on("stop_typing", handleStopTyping);
    socket.on("reaction_added", handleReactionAdded);
    socket.on("reaction_removed", handleReactionRemoved);
    socket.on("message_pinned", handleMessagePinned);

    return () => {
      if (markReadTimeoutRef.current) clearTimeout(markReadTimeoutRef.current);
      socket.emit("leave_channel", channelId);
      socket.off("new_message", handleNewMessage);
      socket.off("message_updated", handleMessageUpdated);
      socket.off("message_deleted", handleDeleteMessage);
      socket.off("typing", handleTyping);
      socket.off("stop_typing", handleStopTyping);
      socket.off("reaction_added", handleReactionAdded);
      socket.off("reaction_removed", handleReactionRemoved);
      socket.off("message_pinned", handleMessagePinned);
    };
  }, [channelId, user.id, onMarkRead]);

  useEffect(() => {
    if (showMentions && mentionItemRefs.current[selectedMentionIndex]) {
      mentionItemRefs.current[selectedMentionIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [showMentions, selectedMentionIndex]);

  const emitTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingEmit.current > 2000) {
      const socket = getSocket();
      socket.emit("typing", channelId);
      lastTypingEmit.current = now;
    }
  }, [channelId]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    const socket = getSocket();
    socket.emit(
      "send_message",
      { channelId, content: text, replyToId: replyTo?.id },
      (res) => {
        if (!res.ok) console.error("Send failed:", res.error);
      }
    );
    setInput("");
    setReplyTo(null);
  }, [input, channelId, replyTo]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && mentionUsers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMentionIndex((i) => (i + 1) % mentionUsers.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMentionIndex((i) => (i - 1 + mentionUsers.length) % mentionUsers.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        insertMention(mentionUsers[selectedMentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === "b") { e.preventDefault(); applyBold(); return; }
      if (e.key === "i") { e.preventDefault(); applyItalic(); return; }
      if (e.key === "e") { e.preventDefault(); applyInlineCode(); return; }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    emitTyping();

    // Check for @ mentions
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1 && (atIndex === 0 || textBeforeCursor[atIndex - 1] === ' ')) {
      const query = textBeforeCursor.slice(atIndex + 1);
      if (query.length >= 1) {
        try {
          const users = await api.get<Array<{ id: string; username: string }>>(`/api/users/search?q=${encodeURIComponent(query)}`);
          setMentionUsers(users);
          setMentionQuery(query);
          setSelectedMentionIndex(0);
          setShowMentions(true);
        } catch (err) {
          console.error("Failed to search users", err);
        }
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  const uploadFile = useCallback((file: File) => {
    setUploadProgress(0);
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/channels/${channelId}/upload`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploadProgress(null);
      if (xhr.status >= 400) {
        try {
          const body = JSON.parse(xhr.responseText);
          alert(body.error || "Upload failed");
        } catch {
          alert("Upload failed");
        }
      }
    };

    xhr.onerror = () => {
      setUploadProgress(null);
      alert("Upload failed");
    };

    xhr.send(formData);
  }, [channelId]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) uploadFile(file);
        return;
      }
    }
  };

  const wrapSelection = (prefix: string, suffix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.slice(start, end);
    const newText = text.slice(0, start) + prefix + selected + suffix + text.slice(end);
    setInput(newText);
    requestAnimationFrame(() => {
      if (selected.length > 0) {
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
      } else {
        const cursorPos = start + prefix.length;
        textarea.setSelectionRange(cursorPos, cursorPos);
      }
      textarea.focus();
    });
  };

  const applyBold = () => wrapSelection("**", "**");
  const applyItalic = () => wrapSelection("*", "*");
  const applyInlineCode = () => wrapSelection("`", "`");
  const applyCodeBlock = () => wrapSelection("```\n", "\n```");

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const newText = input.slice(0, start) + emoji + input.slice(start);
    setInput(newText);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      const newPos = start + emoji.length;
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
    });
  };

  const loadMore = () => {
    if (messages.length > 0 && hasMore && !loading) {
      loadMessages(messages[messages.length - 1].createdAt);
    }
  };

  const handlePin = async (messageId: string) => {
    try {
      await api.patch(`/api/channels/${channelId}/pins/${messageId}`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const typingText = (() => {
    const names = Array.from(typingUsers.values());
    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return `${names[0]} and ${names.length - 1} others are typing...`;
  })();

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* Main chat column */}
      <div
        className="flex-1 flex flex-col overflow-hidden relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="absolute inset-0 z-20 bg-[var(--primary)]/10 border-2 border-dashed border-[var(--primary)] rounded-lg flex items-center justify-center pointer-events-none">
            <p className="text-[var(--primary)] font-semibold text-lg">Drop file to upload</p>
          </div>
        )}
        {/* Channel header */}
        <div className="h-12 px-4 flex items-center gap-2 border-b border-[var(--border)] shrink-0">
          {onMenuClick && (
            <button onClick={onMenuClick} className="md:hidden p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" title="Open sidebar">
              <Menu size={18} />
            </button>
          )}
          {isDm ? <User size={18} className="text-[var(--muted-foreground)]" /> : <Hash size={18} className="text-[var(--muted-foreground)]" />}
          <span className="font-semibold text-sm">{channelName}</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setShowSearch(true)}
              className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded hover:bg-[var(--muted)]"
              title="Search messages"
            >
              <Search size={16} />
            </button>
            {!isDm && (
              <button
                onClick={() => setShowPins(!showPins)}
                className={`p-1.5 rounded hover:bg-[var(--muted)] ${showPins ? "text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
                title="Pinned messages"
              >
                <Pin size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Pinned messages panel */}
        {showPins && (
          <PinnedMessagesPanel
            channelId={channelId}
            isMod={isMod}
            currentUserId={user.id}
            onClose={() => setShowPins(false)}
          />
        )}

        {/* Message list (reversed - newest at bottom) */}
        <div
          ref={listRef}
          role="log"
          aria-label="Message history"
          className="flex-1 overflow-y-auto flex flex-col-reverse p-4 gap-1"
        >
          <div ref={bottomRef} />
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.userId === user.id}
              isMod={isMod}
              channelId={channelId}
              currentUserId={user.id}
              onReply={() => setReplyTo(msg)}
              onUserClick={setProfileUserId}
              onPin={() => handlePin(msg.id)}
              onViewThread={(id) => setThreadMessageId(id)}
              userStatus={onlineUsers?.get(msg.userId)?.status as any ?? "offline"}
            />
          ))}
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loading}
              className="text-sm text-[var(--primary)] hover:underline self-center py-2"
            >
              {loading ? "Loading..." : "Load older messages"}
            </button>
          )}
        </div>

        {/* Typing indicator */}
        <div className="h-5 px-4" aria-live="polite" aria-atomic="true">
          {typingText && (
            <span className="text-xs text-[var(--muted-foreground)] animate-pulse">
              {typingText}
            </span>
          )}
        </div>

        {/* Reply preview */}
        {replyTo && (
          <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--muted)] flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <span className="text-xs text-[var(--muted-foreground)]">
                Replying to <strong>{replyTo.user?.username || "Unknown"}</strong>
              </span>
              <p className="text-xs truncate">{replyTo.content}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Upload progress */}
        {uploadProgress !== null && (
          <div className="px-4 py-2 border-t border-[var(--border)]">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--primary)] rounded-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <span className="text-xs text-[var(--muted-foreground)] w-8">{uploadProgress}%</span>
            </div>
          </div>
        )}

        {/* Message input - hidden for non-mods in announcement channels */}
        <div className="p-4 border-t border-[var(--border)]">
          {isAnnouncement && !isMod ? (
            <p className="text-sm text-[var(--muted-foreground)] py-2 text-center">
              This channel is read-only. Only moderators can post announcements.
            </p>
          ) : (
          <div className="relative flex flex-col bg-[var(--muted)] rounded-lg">
            {/* Formatting toolbar */}
            <div className="flex items-center gap-0.5 px-2 pt-1.5 pb-0.5">
              <button onClick={applyBold} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded" title="Bold (Ctrl+B)">
                <Bold size={14} />
              </button>
              <button onClick={applyItalic} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded" title="Italic (Ctrl+I)">
                <Italic size={14} />
              </button>
              <button onClick={applyInlineCode} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded" title="Code (Ctrl+E)">
                <Code size={14} />
              </button>
              <button onClick={applyCodeBlock} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded" title="Code Block">
                <Braces size={14} />
              </button>
              <div className="w-px h-4 bg-[var(--border)] mx-1" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded"
                title="Attach file"
              >
                <Paperclip size={14} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded"
                  title="Emoji"
                >
                  <Smile size={14} />
                </button>
                {showEmojiPicker && (
                  <EmojiPicker
                    onSelect={insertEmoji}
                    onClose={() => setShowEmojiPicker(false)}
                  />
                )}
              </div>
            </div>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleUpload} />

            {/* Input row */}
            <div className="flex items-end gap-2 px-3 pb-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={isDm ? `Message ${channelName}` : `Message #${channelName}`}
                rows={1}
                className="flex-1 bg-transparent resize-none focus:outline-none text-sm max-h-32"
              />

              {/* Mention dropdown */}
              {showMentions && mentionUsers.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg max-h-40 overflow-y-auto z-10">
                  {mentionUsers.map((mentionUser, index) => (
                    <button
                      key={mentionUser.id}
                      ref={(el) => { mentionItemRefs.current[index] = el; }}
                      onClick={() => insertMention(mentionUser)}
                      className={`w-full px-3 py-2 text-left text-sm ${
                        index === selectedMentionIndex
                          ? "bg-[var(--primary)]/20 text-[var(--primary)]"
                          : "hover:bg-[var(--muted)]"
                      }`}
                    >
                      @{mentionUser.username}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                className="text-[var(--primary)] hover:opacity-80 disabled:opacity-30 font-medium text-sm px-2"
              >
                Send
              </button>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Thread side panel */}
      {threadMessageId && (
        <ThreadPanel
          messageId={threadMessageId}
          channelId={channelId}
          user={user}
          isMod={isMod}
          onClose={() => setThreadMessageId(null)}
        />
      )}

      {/* Search overlay */}
      {showSearch && (
        <SearchPanel
          onNavigate={(chId) => {
            if (chId === channelId) {
              setShowSearch(false);
            } else {
              onNavigateChannel?.(chId);
              setShowSearch(false);
            }
          }}
          onClose={() => setShowSearch(false)}
        />
      )}

      {profileUserId && (
        <UserProfileModal
          userId={profileUserId}
          currentUserId={user.id}
          onClose={() => setProfileUserId(null)}
          onStartDm={onStartDm}
        />
      )}
    </div>
  );
}
