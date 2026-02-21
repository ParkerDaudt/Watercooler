"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { getSocket, connectSocket } from "@/lib/socket";
import type { User, Channel, Community, ChannelCategory, UserStatus, Notification as Notif, VoiceParticipant, VoiceChannelState } from "@watercooler/shared";
import { ChannelSidebar } from "./ChannelSidebar";
import { ChatPanel } from "./ChatPanel";
import { VoiceChannel } from "./VoiceChannel";
import { VoiceStatusBar } from "./VoiceStatusBar";
import { useVoice } from "@/hooks/useVoice";
import { DmUserPicker } from "./DmUserPicker";
import { EventsPanel } from "./EventsPanel";
import { AdminPanel } from "./AdminPanel";
import { NotificationsPanel } from "./NotificationsPanel";
import { StatusDot } from "./StatusDot";
import { StatusPicker } from "./StatusPicker";
import { UserAvatar } from "./UserAvatar";
import { ServerSettingsModal } from "./ServerSettingsModal";
import { UserSettingsModal } from "./UserSettingsModal";
import { Hash, Calendar, Shield, Bell, LogOut, Sun, Moon, Settings } from "lucide-react";
import type { RolePermissions } from "@watercooler/shared";
import { useTheme } from "@/lib/theme";

interface Props {
  user: User;
  onLogout: () => Promise<void>;
}

type View = "chat" | "events" | "admin" | "notifications";

export function AppShell({ user, onLogout }: Props) {
  const { theme, setTheme } = useTheme();
  const [community, setCommunity] = useState<Community | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [view, setView] = useState<View>("chat");
  const [unreadCount, setUnreadCount] = useState(0);
  const [channelUnreadCounts, setChannelUnreadCounts] = useState<Record<string, number>>({});
  const [membership, setMembership] = useState<{ role: string } | null>(null);
  const [notMember, setNotMember] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Map<string, { status: string; customStatus: string }>>(new Map());
  const [showDmModal, setShowDmModal] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [myStatus, setMyStatus] = useState<UserStatus>("online");
  const [myCustomStatus, setMyCustomStatus] = useState("");
  const [myPermissions, setMyPermissions] = useState<RolePermissions | null>(null);

  // Voice state
  const voice = useVoice(user.id);
  const [voiceParticipantsMap, setVoiceParticipantsMap] = useState<Map<string, VoiceParticipant[]>>(new Map());

  const loadData = useCallback(async () => {
    try {
      const [comm, chans, notifCount, members, channelUnreads, cats] = await Promise.all([
        api.get<Community>("/api/community"),
        api.get<Channel[]>("/api/channels"),
        api.get<{ count: number }>("/api/notifications/unread-count"),
        api.get<Array<{ userId: string; role: string }>>("/api/members"),
        api.get<Record<string, number>>("/api/channels/unread"),
        api.get<ChannelCategory[]>("/api/categories").catch(() => [] as ChannelCategory[]),
      ]);
      setCommunity(comm);
      setChannels(chans);
      setCategories(cats);
      setUnreadCount(notifCount.count);
      setChannelUnreadCounts(channelUnreads);
      setNotMember(false);
      const myMembership = members.find((m) => m.userId === user.id);
      if (myMembership) setMembership({ role: myMembership.role });
      // Fetch permissions
      api.get<RolePermissions>("/api/permissions/me").then(setMyPermissions).catch(() => {});
      if (chans.length > 0 && !activeChannelId) {
        setActiveChannelId(chans[0].id);
      }
    } catch (err: any) {
      if (err.message?.includes("Not a member")) {
        setNotMember(true);
      } else {
        console.error("Failed to load data", err);
      }
    }
  }, [user.id, activeChannelId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (community?.accentColor) {
      document.documentElement.style.setProperty("--primary", community.accentColor);
      document.documentElement.style.setProperty("--accent", community.accentColor);
    }
  }, [community?.accentColor]);

  const refreshChannelUnreadCounts = useCallback(() => {
    api.get<Record<string, number>>("/api/channels/unread").then(setChannelUnreadCounts).catch(console.error);
  }, []);

  useEffect(() => {
    connectSocket();
    const socket = getSocket();

    socket.on("notification", () => {
      setUnreadCount((c) => c + 1);
    });

    socket.on("channel_created", (channel) => {
      setChannels((prev) => [...prev, channel]);
    });

    socket.on("channel_deleted", ({ channelId }) => {
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
      if (activeChannelId === channelId) {
        setActiveChannelId(null);
      }
    });

    socket.on("category_created", (cat) => {
      setCategories((prev) => [...prev, cat]);
    });
    socket.on("category_updated", (cat) => {
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? cat : c)));
    });
    socket.on("category_deleted", ({ categoryId }) => {
      setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    });

    socket.on("new_message", (message) => {
      if (message.channelId !== activeChannelId) {
        refreshChannelUnreadCounts();
      }
    });

    // Presence tracking
    socket.on("presence_update", ({ userId, status, customStatus }) => {
      setOnlineUsers((prev) => {
        const next = new Map(prev);
        if (status === "offline") {
          next.delete(userId);
        } else {
          next.set(userId, { status, customStatus: customStatus ?? "" });
        }
        return next;
      });
    });

    socket.on("status_changed", ({ userId, status, customStatus }) => {
      setOnlineUsers((prev) => {
        const next = new Map(prev);
        next.set(userId, { status, customStatus });
        return next;
      });
    });

    // Voice state tracking for sidebar
    const handleVoiceUserJoined = ({ channelId, participant }: { channelId: string; participant: VoiceParticipant }) => {
      setVoiceParticipantsMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(channelId) || [];
        if (!existing.some((p) => p.userId === participant.userId)) {
          next.set(channelId, [...existing, participant]);
        }
        return next;
      });
    };

    const handleVoiceUserLeft = ({ channelId, userId: leftUserId }: { channelId: string; userId: string }) => {
      setVoiceParticipantsMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(channelId) || [];
        const filtered = existing.filter((p) => p.userId !== leftUserId);
        if (filtered.length === 0) {
          next.delete(channelId);
        } else {
          next.set(channelId, filtered);
        }
        return next;
      });
    };

    const handleVoiceStateUpdate = ({ channelId, userId: updatedUserId, isMuted: m, isDeafened: d, isVideoOn: v }: { channelId: string; userId: string; isMuted: boolean; isDeafened: boolean; isVideoOn: boolean }) => {
      setVoiceParticipantsMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(channelId) || [];
        next.set(channelId, existing.map((p) =>
          p.userId === updatedUserId ? { ...p, isMuted: m, isDeafened: d, isVideoOn: v } : p
        ));
        return next;
      });
    };

    socket.on("voice_user_joined", handleVoiceUserJoined);
    socket.on("voice_user_left", handleVoiceUserLeft);
    socket.on("voice_state_update", handleVoiceStateUpdate);

    // Fetch initial online users and voice states once connected
    const onConnect = () => {
      socket.emit("get_online_users", (users) => {
        const map = new Map<string, { status: string; customStatus: string }>();
        for (const u of users) {
          map.set(u.userId, { status: u.status, customStatus: u.customStatus });
        }
        setOnlineUsers(map);
      });
      socket.emit("get_voice_states", (states: VoiceChannelState[]) => {
        const map = new Map<string, VoiceParticipant[]>();
        for (const s of states) {
          map.set(s.channelId, s.participants);
        }
        setVoiceParticipantsMap(map);
      });
    };
    if (socket.connected) onConnect();
    else socket.on("connect", onConnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("voice_user_joined", handleVoiceUserJoined);
      socket.off("voice_user_left", handleVoiceUserLeft);
      socket.off("voice_state_update", handleVoiceStateUpdate);
      socket.disconnect();
    };
  }, [activeChannelId, refreshChannelUnreadCounts]);

  const isMod = myPermissions?.manageMembers || myPermissions?.manageChannels || myPermissions?.manageRoles || membership?.role === "owner" || membership?.role === "moderator";
  const canManageServer = myPermissions?.manageCommunity || myPermissions?.manageRoles || membership?.role === "owner";

  if (notMember) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
        <div className="w-full max-w-md bg-[var(--card)] rounded-xl border border-[var(--border)] p-8 shadow-lg text-center">
          <h1 className="text-2xl font-bold mb-2">Not a member</h1>
          <p className="text-[var(--muted-foreground)] mb-6">
            You need an invite link to join this community.
          </p>
          <button
            onClick={onLogout}
            className="px-4 py-2 bg-[var(--muted)] rounded-lg text-sm hover:bg-[var(--border)]"
          >
            Log out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Navigation sidebar */}
      <div className="w-16 bg-[var(--sidebar)] hidden md:flex flex-col items-center py-4 gap-2 shrink-0" role="navigation" aria-label="Main navigation">
        <div className="relative mb-2 shrink-0" title={`${onlineUsers.size} online`}>
          <div className="w-10 h-10 rounded-full bg-[var(--primary)] flex items-center justify-center text-white font-bold text-sm overflow-hidden">
            {community?.logoUrl ? (
              <img src={community.logoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              community?.name?.charAt(0)?.toUpperCase() || "C"
            )}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-[var(--sidebar)] text-[6px] text-white flex items-center justify-center font-normal">
            {onlineUsers.size > 9 ? "+" : onlineUsers.size}
          </span>
        </div>
        <NavButton
          icon={<Hash size={20} />}
          active={view === "chat"}
          onClick={() => setView("chat")}
          title="Channels"
        />
        <NavButton
          icon={<Calendar size={20} />}
          active={view === "events"}
          onClick={() => setView("events")}
          title="Events"
        />
        <NavButton
          icon={
            <div className="relative">
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[var(--destructive)] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
          }
          active={view === "notifications"}
          onClick={() => setView("notifications")}
          title="Notifications"
        />
        {isMod && (
          <NavButton
            icon={<Shield size={20} />}
            active={view === "admin"}
            onClick={() => setView("admin")}
            title="Admin"
          />
        )}
        <div className="mt-auto space-y-2 relative">
          {/* Own avatar with status dot */}
          <button
            onClick={() => setShowStatusPicker(!showStatusPicker)}
            className="relative"
            title={`${currentUser.username} - ${myStatus}${myCustomStatus ? `: ${myCustomStatus}` : ""}`}
          >
            <UserAvatar username={currentUser.username} avatarUrl={currentUser.avatarUrl} size={10} />
            <StatusDot
              status={myStatus}
              size={12}
              className="absolute -bottom-0.5 -right-0.5 border-2 border-[var(--sidebar)]"
            />
          </button>
          {showStatusPicker && (
            <StatusPicker
              currentStatus={myStatus}
              currentCustomStatus={myCustomStatus}
              onClose={() => setShowStatusPicker(false)}
              onStatusChange={(status, customStatus) => {
                setMyStatus(status);
                setMyCustomStatus(customStatus);
              }}
            />
          )}
          <NavButton
            icon={<Settings size={20} />}
            active={false}
            onClick={() => setShowUserSettings(true)}
            title="User Settings"
          />
          <NavButton
            icon={theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            active={false}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          />
          <NavButton icon={<LogOut size={20} />} active={false} onClick={onLogout} title="Logout" />
        </div>
      </div>

      {/* Channel sidebar (only in chat view) */}
      {view === "chat" && (
        <>
          {/* Mobile backdrop */}
          {mobileSidebarOpen && (
            <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setMobileSidebarOpen(false)} />
          )}
          <ChannelSidebar
            channels={channels}
            categories={categories}
            activeChannelId={activeChannelId}
            onSelect={(id) => {
              // Auto-disconnect from voice when navigating to a different channel
              if (voice.isConnected && voice.currentChannelId !== id) {
                voice.leaveChannel();
              }
              setActiveChannelId(id);
              setMobileSidebarOpen(false);
            }}
            communityName={community?.name || ""}
            unreadCounts={channelUnreadCounts}
            onNewDmClick={() => setShowDmModal(true)}
            onSettingsClick={canManageServer ? () => setShowServerSettings(true) : undefined}
            mobileOpen={mobileSidebarOpen}
            onMobileClose={() => setMobileSidebarOpen(false)}
            voiceParticipants={voiceParticipantsMap}
            voiceStatusBar={
              voice.isConnected ? (
                <VoiceStatusBar
                  channelName={channels.find(c => c.id === voice.currentChannelId)?.name || ""}
                  isMuted={voice.isMuted}
                  isDeafened={voice.isDeafened}
                  isVideoOn={voice.isVideoOn}
                  onToggleMute={voice.toggleMute}
                  onToggleDeafen={voice.toggleDeafen}
                  onToggleVideo={voice.toggleVideo}
                  onDisconnect={voice.leaveChannel}
                />
              ) : undefined
            }
          />
        </>
      )}

      {showServerSettings && community && (
        <ServerSettingsModal
          community={community}
          onClose={() => setShowServerSettings(false)}
          onUpdate={(updated) => setCommunity(updated)}
        />
      )}

      {showUserSettings && (
        <UserSettingsModal
          user={currentUser}
          onClose={() => setShowUserSettings(false)}
          onUserUpdate={(updated) => setCurrentUser(updated)}
        />
      )}

      {showDmModal && (
        <DmUserPicker
          currentUserId={user.id}
          onSelect={(channel) => {
            setChannels((prev) =>
              prev.some((c) => c.id === channel.id) ? prev : [...prev, channel]
            );
            setActiveChannelId(channel.id);
            refreshChannelUnreadCounts();
          }}
          onClose={() => setShowDmModal(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {view === "chat" && activeChannelId && channels.find(c => c.id === activeChannelId)?.type === "voice" && (
          <VoiceChannel
            channelName={channels.find(c => c.id === activeChannelId)?.name || ""}
            channelId={activeChannelId}
            isConnected={voice.isConnected && voice.currentChannelId === activeChannelId}
            participants={
              voice.isConnected && voice.currentChannelId === activeChannelId
                ? voice.participants
                : voiceParticipantsMap.get(activeChannelId) || []
            }
            isMuted={voice.isMuted}
            isDeafened={voice.isDeafened}
            isVideoOn={voice.isVideoOn}
            localStream={voice.localStream}
            remoteStreams={voice.remoteStreams}
            currentUserId={user.id}
            error={voice.error}
            onJoin={() => voice.joinChannel(activeChannelId)}
            onLeave={voice.leaveChannel}
            onToggleMute={voice.toggleMute}
            onToggleDeafen={voice.toggleDeafen}
            onToggleVideo={voice.toggleVideo}
            onMenuClick={() => setMobileSidebarOpen(true)}
          />
        )}
        {view === "chat" && activeChannelId && channels.find(c => c.id === activeChannelId)?.type !== "voice" && (
          <ChatPanel
            channelId={activeChannelId}
            channelName={channels.find((c) => c.id === activeChannelId)?.name || ""}
            user={currentUser}
            isMod={!!isMod}
            isDm={channels.find((c) => c.id === activeChannelId)?.type === "dm"}
            isAnnouncement={channels.find((c) => c.id === activeChannelId)?.isAnnouncement}
            onMarkRead={refreshChannelUnreadCounts}
            onNavigateChannel={setActiveChannelId}
            onlineUsers={onlineUsers}
            onMenuClick={() => setMobileSidebarOpen(true)}
            onStartDm={async (dmUserId) => {
              try {
                const channel = await api.post<Channel>("/api/dms", { userId: dmUserId });
                setChannels((prev) => prev.some((c) => c.id === channel.id) ? prev : [...prev, channel]);
                setActiveChannelId(channel.id);
              } catch (err: any) {
                alert(err.message || "Failed to start DM");
              }
            }}
          />
        )}
        {view === "chat" && !activeChannelId && (
          <div className="flex-1 flex items-center justify-center text-[var(--muted-foreground)]">
            Select a channel to start chatting
          </div>
        )}
        {view === "events" && <EventsPanel user={currentUser} />}
        {view === "admin" && <AdminPanel />}
        {view === "notifications" && (
          <NotificationsPanel onRead={() => setUnreadCount(0)} />
        )}
      </div>
    </div>
  );
}

function NavButton({
  icon,
  active,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
        active
          ? "bg-[var(--primary)] text-white"
          : "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-hover)]"
      }`}
    >
      {icon}
    </button>
  );
}
