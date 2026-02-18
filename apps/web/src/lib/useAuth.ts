"use client";
import { useState, useEffect, useCallback } from "react";
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

  const signup = async (email: string, password: string, username: string, inviteCode?: string) => {
    const result = await api.post<{ user: User; recoveryKey: string }>("/api/auth/signup", {
      email,
      password,
      username,
      inviteCode,
    });
    setState((s) => ({ ...s, user: result.user }));
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
    setState({ user: result.user, loading: false, bootstrapped: true });
    return result;
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

  return { ...state, login, signup, bootstrap, logout, checkAuth, resetPassword };
}
