"use client";
import { useRef, useEffect } from "react";
import { Volume2, Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Camera, CameraOff, MonitorUp, Monitor, Menu } from "lucide-react";
import type { VoiceParticipant } from "@watercooler/shared";
import { UserAvatar } from "./UserAvatar";

interface Props {
  channelName: string;
  channelId: string;
  isConnected: boolean;
  participants: VoiceParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  currentUserId: string;
  hasVideoSender: boolean;
  error: string | null;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onMenuClick?: () => void;
}

export function VoiceChannel({
  channelName,
  isConnected,
  participants,
  isMuted,
  isDeafened,
  isVideoOn,
  isScreenSharing,
  localStream,
  screenStream,
  remoteStreams,
  currentUserId,
  hasVideoSender,
  error,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleDeafen,
  onToggleVideo,
  onToggleScreenShare,
  onMenuClick,
}: Props) {
  const anyoneHasVideo = participants.some((p) => p.isVideoOn || p.isScreenSharing);

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
      <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
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
          <div className="w-full max-w-4xl">
            <div className={`grid gap-4 ${
              anyoneHasVideo
                ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
            }`}>
              {participants.map((p) => {
                const isLocal = p.userId === currentUserId;
                const stream = isLocal
                  ? (p.isScreenSharing ? screenStream : localStream)
                  : remoteStreams.get(p.userId);
                return (
                  <VoiceParticipantCard
                    key={p.userId}
                    participant={p}
                    stream={stream || null}
                    isLocal={isLocal}
                  />
                );
              })}
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
            onClick={onToggleVideo}
            className={`p-3 rounded-full transition-colors ${
              isVideoOn
                ? "bg-green-500/20 text-green-500 hover:bg-green-500/30"
                : "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)]"
            }`}
            title={isVideoOn ? "Turn off camera" : "Turn on camera"}
          >
            {isVideoOn ? <Camera size={20} /> : <CameraOff size={20} />}
          </button>

          {hasVideoSender && (
            <button
              onClick={onToggleScreenShare}
              className={`p-3 rounded-full transition-colors ${
                isScreenSharing
                  ? "bg-green-500/20 text-green-500 hover:bg-green-500/30"
                  : "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)]"
              }`}
              title={isScreenSharing ? "Stop sharing" : "Share screen"}
            >
              {isScreenSharing ? <MonitorUp size={20} /> : <Monitor size={20} />}
            </button>
          )}

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

function VoiceParticipantCard({
  participant,
  stream,
  isLocal,
}: {
  participant: VoiceParticipant;
  stream: MediaStream | null;
  isLocal: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream && (participant.isVideoOn || participant.isScreenSharing)) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, participant.isVideoOn, participant.isScreenSharing]);

  const showVideo = (participant.isVideoOn || participant.isScreenSharing) && stream;
  const isMirrored = isLocal && !participant.isScreenSharing;

  return (
    <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
      {showVideo ? (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className="w-full h-full object-cover"
            style={isMirrored ? { transform: "scaleX(-1)" } : undefined}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-white truncate">
                {participant.isScreenSharing ? `${participant.username} (sharing screen)` : participant.username}
              </span>
              {participant.isMuted && <MicOff size={10} className="text-red-400 shrink-0" />}
              {participant.isDeafened && <HeadphoneOff size={10} className="text-red-400 shrink-0" />}
            </div>
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
