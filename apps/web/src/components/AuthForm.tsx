"use client";
import { useState, useEffect } from "react";
import { Copy, Check, KeyRound } from "lucide-react";

interface Props {
  onLogin: (email: string, password: string) => Promise<unknown>;
  onSignup: (email: string, password: string, username: string, inviteCode?: string) => Promise<{ recoveryKey: string }>;
  onResetPassword: (email: string, recoveryKey: string, newPassword: string) => Promise<{ recoveryKey: string }>;
}

export function AuthForm({ onLogin, onSignup, onResetPassword }: Props) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [form, setForm] = useState({ email: "", password: "", username: "", inviteCode: "", confirmPassword: "", recoveryKey: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRecoveryKey, setShowRecoveryKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("invite");
    if (code) {
      setForm((f) => ({ ...f, inviteCode: code }));
      setMode("signup");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await onLogin(form.email, form.password);
      } else if (mode === "signup") {
        const result = await onSignup(form.email, form.password, form.username, form.inviteCode || undefined);
        setShowRecoveryKey(result.recoveryKey);
      } else if (mode === "reset") {
        if (form.password.length < 8) {
          setError("Password must be at least 8 characters");
          setLoading(false);
          return;
        }
        if (form.password !== form.confirmPassword) {
          setError("Passwords do not match");
          setLoading(false);
          return;
        }
        const result = await onResetPassword(form.email, form.recoveryKey, form.password);
        setShowRecoveryKey(result.recoveryKey);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyKey = async () => {
    if (!showRecoveryKey) return;
    await navigator.clipboard.writeText(showRecoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Recovery key display overlay
  if (showRecoveryKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
        <div className="w-full max-w-md bg-[var(--card)] rounded-xl border border-[var(--border)] p-8 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <KeyRound size={24} className="text-yellow-500" />
            </div>
            <h1 className="text-xl font-bold">
              {mode === "reset" ? "New Recovery Key" : "Save Your Recovery Key"}
            </h1>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4">
            <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
              This is the only time this key will be shown. Save it somewhere safe — you'll need it to reset your password if you ever forget it.
            </p>
          </div>

          <div className="relative mb-6">
            <code className="block w-full p-4 bg-[var(--muted)] rounded-lg text-center font-mono text-lg tracking-wider select-all break-all">
              {showRecoveryKey}
            </code>
            <button
              onClick={copyKey}
              className="absolute top-2 right-2 p-2 hover:bg-[var(--border)] rounded-lg transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} className="text-[var(--muted-foreground)]" />}
            </button>
          </div>

          <button
            onClick={() => {
              setShowRecoveryKey(null);
              if (mode === "reset") {
                setMode("login");
                setForm({ email: "", password: "", username: "", inviteCode: "", confirmPassword: "", recoveryKey: "" });
              }
            }}
            className="w-full py-2 px-4 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg font-medium hover:opacity-90"
          >
            {mode === "reset" ? "Back to Login" : "I've Saved My Key"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-md bg-[var(--card)] rounded-xl border border-[var(--border)] p-8 shadow-lg">
        <h1 className="text-2xl font-bold mb-6">
          {mode === "login" ? "Welcome back" : mode === "signup" ? "Create account" : "Reset Password"}
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Invite Code</label>
                <input
                  type="text"
                  required
                  value={form.inviteCode}
                  onChange={(e) => setForm((f) => ({ ...f, inviteCode: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  placeholder="Enter your invite code"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          {mode === "reset" && (
            <div>
              <label className="block text-sm font-medium mb-1">Recovery Key</label>
              <input
                type="text"
                required
                value={form.recoveryKey}
                onChange={(e) => setForm((f) => ({ ...f, recoveryKey: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] font-mono"
                placeholder="Enter your recovery key"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">
              {mode === "reset" ? "New Password" : "Password"}
            </label>
            <input
              type="password"
              required
              minLength={mode !== "login" ? 8 : 1}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          {mode === "reset" && (
            <div>
              <label className="block text-sm font-medium mb-1">Confirm New Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={form.confirmPassword}
                onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
          )}
          {error && <p className="text-[var(--destructive)] text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "..." : mode === "login" ? "Log in" : mode === "signup" ? "Sign up" : "Reset Password"}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-[var(--muted-foreground)] space-y-1">
          {mode === "login" && (
            <>
              <p>
                Don't have an account?{" "}
                <button
                  onClick={() => { setMode("signup"); setError(""); }}
                  className="text-[var(--primary)] hover:underline"
                >
                  Sign up
                </button>
              </p>
              <p>
                <button
                  onClick={() => { setMode("reset"); setError(""); }}
                  className="text-[var(--primary)] hover:underline"
                >
                  Forgot password?
                </button>
              </p>
            </>
          )}
          {mode === "signup" && (
            <p>
              Already have an account?{" "}
              <button
                onClick={() => { setMode("login"); setError(""); }}
                className="text-[var(--primary)] hover:underline"
              >
                Log in
              </button>
            </p>
          )}
          {mode === "reset" && (
            <p>
              Remember your password?{" "}
              <button
                onClick={() => { setMode("login"); setError(""); }}
                className="text-[var(--primary)] hover:underline"
              >
                Log in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
