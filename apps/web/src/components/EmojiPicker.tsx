"use client";

import { useState, useMemo } from "react";
import { EMOJI_CATEGORIES } from "@/lib/emojiData";

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(0);

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return EMOJI_CATEGORIES;

    const query = search.toLowerCase().trim();
    return EMOJI_CATEGORIES.map((category) => ({
      ...category,
      emojis: category.emojis.filter((entry) =>
        entry.keywords.some((kw) => kw.toLowerCase().includes(query))
      ),
    })).filter((category) => category.emojis.length > 0);
  }, [search]);

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    onClose();
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        marginBottom: "0.5rem",
        width: "320px",
        height: "320px",
        display: "flex",
        flexDirection: "column",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "0.5rem",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        overflow: "hidden",
        zIndex: 50,
      }}
    >
      {/* Search */}
      <div style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
        <input
          type="text"
          placeholder="Search emoji..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setActiveCategory(0);
          }}
          autoFocus
          style={{
            width: "100%",
            padding: "0.375rem 0.5rem",
            fontSize: "0.8125rem",
            background: "var(--muted)",
            color: "var(--foreground)",
            border: "1px solid var(--border)",
            borderRadius: "0.375rem",
            outline: "none",
          }}
        />
      </div>

      {/* Category tabs */}
      {!search.trim() && (
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            padding: "0 0.25rem",
            gap: "0",
          }}
        >
          {EMOJI_CATEGORIES.map((cat, idx) => (
            <button
              key={cat.name}
              title={cat.name}
              onClick={() => setActiveCategory(idx)}
              style={{
                flex: 1,
                padding: "0.375rem 0",
                fontSize: "0.875rem",
                background: "transparent",
                border: "none",
                borderBottom:
                  activeCategory === idx
                    ? "2px solid var(--primary)"
                    : "2px solid transparent",
                cursor: "pointer",
                opacity: activeCategory === idx ? 1 : 0.5,
                transition: "opacity 0.15s",
              }}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0.375rem",
        }}
      >
        {(search.trim() ? filteredCategories : [EMOJI_CATEGORIES[activeCategory]]).map(
          (category) =>
            category && (
              <div key={category.name}>
                <div
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: "var(--muted-foreground, var(--foreground))",
                    opacity: 0.6,
                    padding: "0.25rem 0.25rem 0.375rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {category.name}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(8, 1fr)",
                    gap: "0",
                  }}
                >
                  {category.emojis.map((entry) => (
                    <button
                      key={entry.emoji}
                      onClick={() => handleSelect(entry.emoji)}
                      title={entry.keywords.join(", ")}
                      style={{
                        padding: "0.25rem",
                        fontSize: "1.25rem",
                        lineHeight: 1,
                        background: "transparent",
                        border: "none",
                        borderRadius: "0.25rem",
                        cursor: "pointer",
                        textAlign: "center",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--muted)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      {entry.emoji}
                    </button>
                  ))}
                </div>
              </div>
            )
        )}

        {search.trim() && filteredCategories.length === 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--foreground)",
              opacity: 0.5,
              fontSize: "0.8125rem",
            }}
          >
            No emojis found
          </div>
        )}
      </div>
    </div>
  );
}
