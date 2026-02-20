"use client";
import { Volume2, Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Menu } from "lucide-react";
import type { VoiceParticipant } from "@watercooler/shared";
import { UserAvatar } from "./UserAvatar";

interface Props {
  channelName: string;
  channelId: string;
  isConnected: boolean;
  participants: VoiceParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  error: string | null;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onMenuClick?: () => void;
}

export function VoiceChannel({
  channelName,
  isConnected,
  participants,
  isMuted,
  isDeafened,
  error,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleDeafen,
  onMenuClick,
}: Props) {
  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="h-12 border-b border-[var(--border)] flex items-center px-4 gap-2 shrink-0">
        {onMenuClick && (
          <button onClick={onMenuClick} className="md:hidden p-1 mr-1 text-[var(--muted-foreground)]">
            <Menu size={18} />
          </button>
        )}
        <Volume2 size={18} className="text-[var(--muted-foreground)]" />
        <span className="font-semibold text-sm">{channelName}</span>
        {isConnected && (
          <span className="text-xs text-green-500 ml-2 font-medium">Connected</span>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm max-w-md text-center">
            {error}
          </div>
        )}

        {!isConnected ? (
          <div className="text-center space-y-4">
            <Volume2 size={48} className="text-[var(--muted-foreground)] mx-auto" />
            <h2 className="text-lg font-semibold">{channelName}</h2>
            <p className="text-[var(--muted-foreground)] text-sm">
              {participants.length > 0
                ? `${participants.length} user${participants.length !== 1 ? "s" : ""} connected`
                : "No one is here yet"}
            </p>
            <button
              onClick={onJoin}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              Join Voice
            </button>
          </div>
        ) : (
          <div className="w-full max-w-2xl">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {participants.map((p) => (
                <VoiceParticipantCard key={p.userId} participant={p} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Controls bar */}
      {isConnected && (
        <div className="h-16 border-t border-[var(--border)] flex items-center justify-center gap-3 px-4 shrink-0 bg-[var(--card)]">
          <button
            onClick={onToggleMute}
            className={`p-3 rounded-full transition-colors ${
              isMuted
                ? "bg-red-500/20 text-red-500 hover:bg-red-500/30"
                : "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)]"
            }`}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          <button
            onClick={onToggleDeafen}
            className={`p-3 rounded-full transition-colors ${
              isDeafened
                ? "bg-red-500/20 text-red-500 hover:bg-red-500/30"
                : "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)]"
            }`}
            title={isDeafened ? "Undeafen" : "Deafen"}
          >
            {isDeafened ? <HeadphoneOff size={20} /> : <Headphones size={20} />}
          </button>

          <button
            onClick={onLeave}
            className="p-3 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
            title="Disconnect"
          >
            <PhoneOff size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

function VoiceParticipantCard({ participant }: { participant: VoiceParticipant }) {
  return (
    <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
      <div className="relative">
        <UserAvatar
          username={participant.username}
          avatarUrl={participant.avatarUrl}
          size={16}
        />
        {(participant.isMuted || participant.isDeafened) && (
          <div className="absolute -bottom-1 -right-1 bg-[var(--card)] rounded-full p-0.5">
            {participant.isDeafened ? (
              <HeadphoneOff size={12} className="text-red-500" />
            ) : (
              <MicOff size={12} className="text-red-500" />
            )}
          </div>
        )}
      </div>
      <span className="text-xs font-medium truncate max-w-full">{participant.username}</span>
    </div>
  );
}
