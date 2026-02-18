"use client";
import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@watercooler/shared";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket() {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
    socket = io(url, {
      withCredentials: true,
      path: "/socket.io",
      autoConnect: false,
    });
  }
  return socket;
}

export async function connectSocket() {
  const s = getSocket();
  if (s.connected) return s;

  // Fetch token via same-origin proxy so cookie is sent correctly
  try {
    const res = await fetch("/api/auth/token", { credentials: "include" });
    if (res.ok) {
      const { token } = await res.json();
      s.auth = { token };
    }
  } catch {
    // Will fall back to cookie-based auth
  }

  s.connect();
  return s;
}
