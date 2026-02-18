"use client";
import { useState } from "react";
import type { Channel, ChannelCategory } from "@watercooler/shared";
import { Hash, Lock, User, Plus, Megaphone, ChevronDown, ChevronRight, Settings } from "lucide-react";

interface Props {
  channels: Channel[];
  categories?: ChannelCategory[];
  activeChannelId: string | null;
  onSelect: (id: string) => void;
  communityName: string;
  unreadCounts?: Record<string, number>;
  onNewDmClick?: () => void;
  onSettingsClick?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function ChannelSidebar({ channels, categories = [], activeChannelId, onSelect, communityName, unreadCounts, onNewDmClick, onSettingsClick, mobileOpen, onMobileClose }: Props) {
  const communityChannels = channels.filter(ch => ch.communityId);
  const dmChannels = channels.filter(ch => !ch.communityId);

  // Group community channels by categoryId
  const uncategorized = communityChannels.filter(ch => !ch.categoryId);
  const sortedCategories = [...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const channelsByCategory = new Map<string, Channel[]>();
  for (const cat of sortedCategories) {
    channelsByCategory.set(
      cat.id,
      communityChannels
        .filter(ch => ch.categoryId === cat.id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    );
  }

  return (
    <div className={`w-60 bg-[var(--card)] border-r border-[var(--border)] flex flex-col shrink-0 ${
      mobileOpen ? "fixed inset-y-0 left-0 z-40" : "hidden md:flex"
    }`} role="navigation" aria-label="Channel list">
      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
        <h2 className="font-semibold text-sm truncate">{communityName}</h2>
        {onSettingsClick && (
          <button onClick={onSettingsClick} className="p-1 rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]" title="Server Settings">
            <Settings size={16} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* Uncategorized channels */}
        {uncategorized.length > 0 && categories.length > 0 && (
          <CategorySection label="Channels" channels={uncategorized} activeChannelId={activeChannelId} unreadCounts={unreadCounts} onSelect={onSelect} />
        )}

        {/* If no categories at all, show flat like before */}
        {categories.length === 0 && communityChannels.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)] px-2 py-1">
              Channels
            </p>
            {communityChannels.map((ch) => (
              <ChannelButton
                key={ch.id}
                channel={ch}
                isActive={ch.id === activeChannelId}
                unreadCount={unreadCounts?.[ch.id] || 0}
                onClick={() => onSelect(ch.id)}
              />
            ))}
          </div>
        )}

        {/* Categorized channels */}
        {sortedCategories.map((cat) => {
          const catChannels = channelsByCategory.get(cat.id) || [];
          if (catChannels.length === 0) return null;
          return (
            <CategorySection
              key={cat.id}
              label={cat.name}
              channels={catChannels}
              activeChannelId={activeChannelId}
              unreadCounts={unreadCounts}
              onSelect={onSelect}
            />
          );
        })}

        {/* DMs */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
              Direct Messages
            </p>
            {onNewDmClick && (
              <button
                onClick={onNewDmClick}
                className="p-1 rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                title="New message"
                aria-label="Start new direct message"
              >
                <Plus size={14} />
              </button>
            )}
          </div>
          {dmChannels.map((ch) => (
            <ChannelButton
              key={ch.id}
              channel={ch}
              isActive={ch.id === activeChannelId}
              unreadCount={unreadCounts?.[ch.id] || 0}
              onClick={() => onSelect(ch.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface CategorySectionProps {
  label: string;
  channels: Channel[];
  activeChannelId: string | null;
  unreadCounts?: Record<string, number>;
  onSelect: (id: string) => void;
}

function CategorySection({ label, channels, activeChannelId, unreadCounts, onSelect }: CategorySectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1 text-[10px] uppercase font-semibold text-[var(--muted-foreground)] px-2 py-1 w-full hover:text-[var(--foreground)] transition-colors"
      >
        {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        {label}
      </button>
      {!collapsed && channels.map((ch) => (
        <ChannelButton
          key={ch.id}
          channel={ch}
          isActive={ch.id === activeChannelId}
          unreadCount={unreadCounts?.[ch.id] || 0}
          onClick={() => onSelect(ch.id)}
        />
      ))}
    </div>
  );
}

interface ChannelButtonProps {
  channel: Channel;
  isActive: boolean;
  unreadCount: number;
  onClick: () => void;
}

function ChannelButton({ channel, isActive, unreadCount, onClick }: ChannelButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors relative ${
        isActive
          ? "bg-[var(--muted)] text-[var(--foreground)]"
          : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
      }`}
    >
      {channel.type === "dm" ? <User size={14} /> : channel.isAnnouncement ? <Megaphone size={14} /> : channel.isPrivate ? <Lock size={14} /> : <Hash size={14} />}
      <span className="truncate">{channel.name}</span>
      {unreadCount > 0 && (
        <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
