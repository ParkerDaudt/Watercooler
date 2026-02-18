"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-md bg-[var(--card)] rounded-xl border border-[var(--border)] p-8 shadow-lg text-center">
        <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
        <p className="text-[var(--muted-foreground)] mb-6">
          An unexpected error occurred. Please try again.
        </p>
        {process.env.NODE_ENV === "development" && (
          <pre className="text-xs text-left bg-[var(--muted)] p-3 rounded mb-4 overflow-auto max-h-40">
            {error.message}
          </pre>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-sm hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
