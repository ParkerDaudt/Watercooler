"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import type { VoiceParticipant, RTCSessionDescriptionLike, RTCIceCandidateLike } from "@watercooler/shared";

const STUN_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export interface UseVoiceReturn {
  isConnected: boolean;
  currentChannelId: string | null;
  participants: VoiceParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  error: string | null;
  joinChannel: (channelId: string) => Promise<void>;
  leaveChannel: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
}

export function useVoice(userId: string): UseVoiceReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElements = useRef<Map<string, HTMLAudioElement>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const currentChannelRef = useRef<string | null>(null);
  const isMutedRef = useRef(false);
  const isDeafenedRef = useRef(false);

  useEffect(() => { currentChannelRef.current = currentChannelId; }, [currentChannelId]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isDeafenedRef.current = isDeafened; }, [isDeafened]);

  const createPeerConnection = useCallback((peerId: string, stream: MediaStream): RTCPeerConnection => {
    const socket = getSocket();
    const pc = new RTCPeerConnection(STUN_CONFIG);

    for (const track of stream.getAudioTracks()) {
      pc.addTrack(track, stream);
    }

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      if (remoteStream) {
        let audio = audioElements.current.get(peerId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audioElements.current.set(peerId, audio);
        }
        audio.srcObject = remoteStream;
        audio.muted = isDeafenedRef.current;
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("voice_ice_candidate", {
          to: peerId,
          candidate: event.candidate.toJSON() as RTCIceCandidateLike,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        pc.close();
        peerConnections.current.delete(peerId);
        const audio = audioElements.current.get(peerId);
        if (audio) { audio.srcObject = null; audioElements.current.delete(peerId); }
      }
    };

    peerConnections.current.set(peerId, pc);
    return pc;
  }, []);

  const cleanupConnections = useCallback(() => {
    for (const [, pc] of peerConnections.current) {
      pc.close();
    }
    peerConnections.current.clear();
    for (const [, audio] of audioElements.current) {
      audio.srcObject = null;
    }
    audioElements.current.clear();
  }, []);

  const joinChannel = useCallback(async (channelId: string) => {
    const socket = getSocket();
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      socket.emit("voice_join", channelId, async (response) => {
        if (!response.ok) {
          stream.getTracks().forEach(t => t.stop());
          localStreamRef.current = null;
          setError(response.error || "Failed to join voice channel");
          return;
        }

        setCurrentChannelId(channelId);
        setIsConnected(true);
        setParticipants(response.participants || []);
        setIsMuted(false);
        setIsDeafened(false);

        // Create peer connections to existing participants and send offers
        const existingPeers = (response.participants || []).filter(p => p.userId !== userId);
        for (const peer of existingPeers) {
          const pc = createPeerConnection(peer.userId, stream);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("voice_offer", {
            to: peer.userId,
            offer: pc.localDescription!.toJSON() as RTCSessionDescriptionLike,
          });
        }
      });
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError") {
        setError("Microphone access denied. Please allow microphone access in your browser settings.");
      } else {
        setError("Failed to access microphone.");
      }
    }
  }, [userId, createPeerConnection]);

  const leaveChannel = useCallback(() => {
    const socket = getSocket();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    cleanupConnections();
    socket.emit("voice_leave", () => {});

    setIsConnected(false);
    setCurrentChannelId(null);
    setParticipants([]);
    setIsMuted(false);
    setIsDeafened(false);
  }, [cleanupConnections]);

  const toggleMute = useCallback(() => {
    const socket = getSocket();
    const newMuted = !isMutedRef.current;
    setIsMuted(newMuted);

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getAudioTracks()) {
        track.enabled = !newMuted;
      }
    }

    socket.emit("voice_state_update", { isMuted: newMuted, isDeafened: isDeafenedRef.current }, () => {});
  }, []);

  const toggleDeafen = useCallback(() => {
    const socket = getSocket();
    const newDeafened = !isDeafenedRef.current;
    setIsDeafened(newDeafened);

    // Mute/unmute all remote audio elements
    for (const [, audio] of audioElements.current) {
      audio.muted = newDeafened;
    }

    // Deafening also mutes your mic
    const newMuted = newDeafened ? true : isMutedRef.current;
    if (newDeafened && !isMutedRef.current) {
      setIsMuted(true);
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getAudioTracks()) {
          track.enabled = false;
        }
      }
    }

    socket.emit("voice_state_update", { isMuted: newMuted, isDeafened: newDeafened }, () => {});
  }, []);

  // Socket event listeners for voice signaling
  useEffect(() => {
    const socket = getSocket();

    const handleUserJoined = async (data: { channelId: string; participant: VoiceParticipant }) => {
      if (data.channelId !== currentChannelRef.current) return;
      if (data.participant.userId === userId) return;

      setParticipants(prev => {
        if (prev.some(p => p.userId === data.participant.userId)) return prev;
        return [...prev, data.participant];
      });
      // The new joiner sends offers, so we wait for their offer
    };

    const handleUserLeft = (data: { channelId: string; userId: string }) => {
      if (data.channelId !== currentChannelRef.current) return;

      setParticipants(prev => prev.filter(p => p.userId !== data.userId));

      const pc = peerConnections.current.get(data.userId);
      if (pc) { pc.close(); peerConnections.current.delete(data.userId); }
      const audio = audioElements.current.get(data.userId);
      if (audio) { audio.srcObject = null; audioElements.current.delete(data.userId); }
    };

    const handleVoiceStateUpdate = (data: { channelId: string; userId: string; isMuted: boolean; isDeafened: boolean }) => {
      if (data.channelId !== currentChannelRef.current) return;
      setParticipants(prev => prev.map(p =>
        p.userId === data.userId ? { ...p, isMuted: data.isMuted, isDeafened: data.isDeafened } : p
      ));
    };

    const handleOffer = async (data: { from: string; offer: RTCSessionDescriptionLike }) => {
      if (!localStreamRef.current) return;
      const pc = createPeerConnection(data.from, localStreamRef.current);
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer as RTCSessionDescriptionInit));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("voice_answer", {
        to: data.from,
        answer: pc.localDescription!.toJSON() as RTCSessionDescriptionLike,
      });
    };

    const handleAnswer = async (data: { from: string; answer: RTCSessionDescriptionLike }) => {
      const pc = peerConnections.current.get(data.from);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer as RTCSessionDescriptionInit));
      }
    };

    const handleIceCandidate = async (data: { from: string; candidate: RTCIceCandidateLike }) => {
      const pc = peerConnections.current.get(data.from);
      if (pc && data.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate as RTCIceCandidateInit));
      }
    };

    socket.on("voice_offer", handleOffer);
    socket.on("voice_answer", handleAnswer);
    socket.on("voice_ice_candidate", handleIceCandidate);
    socket.on("voice_user_joined", handleUserJoined);
    socket.on("voice_user_left", handleUserLeft);
    socket.on("voice_state_update", handleVoiceStateUpdate);

    return () => {
      socket.off("voice_offer", handleOffer);
      socket.off("voice_answer", handleAnswer);
      socket.off("voice_ice_candidate", handleIceCandidate);
      socket.off("voice_user_joined", handleUserJoined);
      socket.off("voice_user_left", handleUserLeft);
      socket.off("voice_state_update", handleVoiceStateUpdate);
    };
  }, [userId, createPeerConnection]);

  // beforeunload cleanup
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentChannelRef.current) {
        const socket = getSocket();
        socket.emit("voice_leave", () => {});
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      cleanupConnections();
    };
  }, [cleanupConnections]);

  return {
    isConnected,
    currentChannelId,
    participants,
    isMuted,
    isDeafened,
    error,
    joinChannel,
    leaveChannel,
    toggleMute,
    toggleDeafen,
  };
}
