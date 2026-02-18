"use client";
import { useAuth } from "@/lib/useAuth";
import { BootstrapForm } from "@/components/BootstrapForm";
import { AuthForm } from "@/components/AuthForm";
import { AppShell } from "@/components/AppShell";

export default function Home() {
  const auth = useAuth();

  if (auth.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-[var(--muted-foreground)]">Loading...</div>
      </div>
    );
  }

  if (auth.bootstrapped === false) {
    return <BootstrapForm onBootstrap={auth.bootstrap} />;
  }

  if (!auth.user) {
    return <AuthForm onLogin={auth.login} onSignup={auth.signup} onResetPassword={auth.resetPassword} />;
  }

  return <AppShell user={auth.user} onLogout={auth.logout} />;
}
