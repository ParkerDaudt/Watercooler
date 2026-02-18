"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { MessageSearchResult } from "@watercooler/shared";
import { Search, X, Hash } from "lucide-react";

interface Props {
  onNavigate: (channelId: string) => void;
  onClose: () => void;
}

export function SearchPanel({ onNavigate, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get<MessageSearchResult[]>("/api/messages/search", {
        q,
        limit: "20",
      });
      setResults(data);
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value.trim()), 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  const highlightMatch = (content: string, q: string) => {
    if (!q) return content;
    const idx = content.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return content.slice(0, 150);
    const start = Math.max(0, idx - 40);
    const end = Math.min(content.length, idx + q.length + 60);
    const before = content.slice(start, idx);
    const match = content.slice(idx, idx + q.length);
    const after = content.slice(idx + q.length, end);
    return (
      <>
        {start > 0 && "..."}
        {before}
        <mark className="bg-yellow-300/40 text-inherit rounded px-0.5">{match}</mark>
        {after}
        {end < content.length && "..."}
      </>
    );
  };

  return (
    <div className="absolute inset-0 z-20 bg-[var(--background)]/80 backdrop-blur-sm flex flex-col">
      <div className="max-w-2xl w-full mx-auto mt-16 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
          <Search size={18} className="text-[var(--muted-foreground)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search messages..."
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            <X size={18} />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <p className="text-center text-sm text-[var(--muted-foreground)] py-8">Searching...</p>
          )}
          {!loading && query && results.length === 0 && (
            <p className="text-center text-sm text-[var(--muted-foreground)] py-8">No results found</p>
          )}
          {!loading && !query && (
            <p className="text-center text-sm text-[var(--muted-foreground)] py-8">Type to search messages</p>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onNavigate(r.channelId);
                onClose();
              }}
              className="w-full px-4 py-3 text-left hover:bg-[var(--muted)] border-b border-[var(--border)]/50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <Hash size={12} className="text-[var(--muted-foreground)]" />
                <span className="text-xs text-[var(--muted-foreground)]">{r.channelName}</span>
                <span className="text-xs text-[var(--muted-foreground)]">·</span>
                <span className="text-xs font-medium">{r.username}</span>
                <span className="text-xs text-[var(--muted-foreground)] ml-auto">
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-[var(--foreground)] line-clamp-2">
                {highlightMatch(r.content, query.trim())}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
