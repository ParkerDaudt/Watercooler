"use client";
import { Volume2, MicOff, HeadphoneOff, PhoneOff, Mic, Headphones } from "lucide-react";

interface Props {
  channelName: string;
  isMuted: boolean;
  isDeafened: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onDisconnect: () => void;
}

export function VoiceStatusBar({ channelName, isMuted, isDeafened, onToggleMute, onToggleDeafen, onDisconnect }: Props) {
  return (
    <div className="border-t border-[var(--border)] bg-[var(--card)] p-2">
      <div className="flex items-center gap-2 mb-1.5">
        <Volume2 size={14} className="text-green-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-green-500">Voice Connected</p>
          <p className="text-[10px] text-[var(--muted-foreground)] truncate">{channelName}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleMute}
          className={`p-1.5 rounded ${isMuted ? "text-red-500 bg-red-500/10" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"}`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
        </button>
        <button
          onClick={onToggleDeafen}
          className={`p-1.5 rounded ${isDeafened ? "text-red-500 bg-red-500/10" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"}`}
          title={isDeafened ? "Undeafen" : "Deafen"}
        >
          {isDeafened ? <HeadphoneOff size={14} /> : <Headphones size={14} />}
        </button>
        <button
          onClick={onDisconnect}
          className="p-1.5 rounded text-red-500 hover:bg-red-500/10 ml-auto"
          title="Disconnect"
        >
          <PhoneOff size={14} />
        </button>
      </div>
    </div>
  );
}
