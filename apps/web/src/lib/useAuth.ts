"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";
import type { User } from "@watercooler/shared";

interface AuthState {
  user: User | null;
  loading: boolean;
  bootstrapped: boolean | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    bootstrapped: null,
  });

  const checkAuth = useCallback(async () => {
    try {
      const { bootstrapped } = await api.get<{ bootstrapped: boolean }>("/api/auth/status");
      if (!bootstrapped) {
        setState({ user: null, loading: false, bootstrapped: false });
        return;
      }
      try {
        const { user } = await api.get<{ user: User }>("/api/auth/me");
        setState({ user, loading: false, bootstrapped: true });
      } catch {
        setState({ user: null, loading: false, bootstrapped: true });
      }
    } catch {
      setState({ user: null, loading: false, bootstrapped: null });
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    const { user } = await api.post<{ user: User }>("/api/auth/login", { email, password });
    setState((s) => ({ ...s, user }));
    return user;
  };

  const pendingUser = useRef<User | null>(null);

  const signup = async (email: string, password: string, username: string, inviteCode?: string) => {
    const result = await api.post<{ user: User; recoveryKey: string }>("/api/auth/signup", {
      email,
      password,
      username,
      inviteCode,
    });
    // Don't set user yet — AuthForm needs to stay mounted to show the recovery key
    pendingUser.current = result.user;
    return result;
  };

  const bootstrap = async (
    email: string,
    password: string,
    username: string,
    communityName: string
  ) => {
    const result = await api.post<{ user: User; recoveryKey: string }>("/api/auth/bootstrap", {
      email,
      password,
      username,
      communityName,
    });
    // Don't set user yet — BootstrapForm needs to stay mounted to show the recovery key
    pendingUser.current = result.user;
    return result;
  };

  const finishAuth = () => {
    const user = pendingUser.current;
    if (user) {
      setState({ user, loading: false, bootstrapped: true });
      pendingUser.current = null;
    }
  };

  const resetPassword = async (email: string, recoveryKey: string, newPassword: string) => {
    return api.post<{ ok: boolean; recoveryKey: string }>("/api/auth/reset-password", {
      email,
      recoveryKey,
      newPassword,
    });
  };

  const logout = async () => {
    await api.post("/api/auth/logout");
    setState((s) => ({ ...s, user: null }));
  };

  return { ...state, login, signup, finishAuth, bootstrap, logout, checkAuth, resetPassword };
}
