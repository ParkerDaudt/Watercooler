"use client";
import { useState } from "react";
import { Copy, Check, KeyRound } from "lucide-react";

interface Props {
  onBootstrap: (email: string, password: string, username: string, communityName: string) => Promise<{ recoveryKey?: string }>;
  onFinish: () => void;
}

export function BootstrapForm({ onBootstrap, onFinish }: Props) {
  const [form, setForm] = useState({ email: "", password: "", username: "", communityName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await onBootstrap(form.email, form.password, form.username, form.communityName);
      if (result?.recoveryKey) {
        setRecoveryKey(result.recoveryKey);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyKey = async () => {
    if (!recoveryKey) return;
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (recoveryKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
        <div className="w-full max-w-md bg-[var(--card)] rounded-xl border border-[var(--border)] p-8 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <KeyRound size={24} className="text-yellow-500" />
            </div>
            <h1 className="text-xl font-bold">Save Your Recovery Key</h1>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4">
            <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
              This is the only time this key will be shown. Save it somewhere safe — you'll need it to reset your password if you ever forget it.
            </p>
          </div>

          <div className="relative mb-6">
            <code className="block w-full p-4 bg-[var(--muted)] rounded-lg text-center font-mono text-lg tracking-wider select-all break-all">
              {recoveryKey}
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
            onClick={onFinish}
            className="w-full py-2 px-4 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg font-medium hover:opacity-90"
          >
            I've Saved My Key
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-md bg-[var(--card)] rounded-xl border border-[var(--border)] p-8 shadow-lg">
        <h1 className="text-2xl font-bold mb-2">Welcome!</h1>
        <p className="text-[var(--muted-foreground)] mb-6">
          Set up your community by creating the first admin account.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Community Name</label>
            <input
              type="text"
              required
              value={form.communityName}
              onChange={(e) => setForm((f) => ({ ...f, communityName: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder="My Neighborhood"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input
              type="text"
              required
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder="Min 8 chars, uppercase + digit required"
            />
          </div>
          {error && <p className="text-[var(--destructive)] text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Community"}
          </button>
        </form>
      </div>
    </div>
  );
}
