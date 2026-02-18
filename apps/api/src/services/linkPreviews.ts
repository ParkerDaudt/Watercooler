import ogs from "open-graph-scraper";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getIO } from "../socket.js";
import type { LinkPreview } from "@watercooler/shared";

const URL_REGEX = /https?:\/\/[^\s<]+/g;

const BLOCKED_HOSTS = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[::1?\])$/i;

function isSafeUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (BLOCKED_HOSTS.test(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

const EMPTY_PREVIEW = (url: string): LinkPreview => ({
  url, title: null, description: null, image: null, siteName: null,
});

export function extractUrls(content: string): string[] {
  const matches = content.match(URL_REGEX);
  if (!matches) return [];
  return [...new Set(matches)].slice(0, 5);
}

async function fetchOgMetadata(url: string): Promise<LinkPreview> {
  if (!isSafeUrl(url)) return EMPTY_PREVIEW(url);

  // Check cache first (24h TTL)
  const [cached] = await db
    .select()
    .from(schema.linkPreviewCache)
    .where(eq(schema.linkPreviewCache.url, url))
    .limit(1);

  if (cached && Date.now() - cached.fetchedAt.getTime() < 24 * 60 * 60 * 1000) {
    return {
      url,
      title: cached.title,
      description: cached.description,
      image: cached.image,
      siteName: cached.siteName,
    };
  }

  try {
    const { result } = await ogs({
      url,
      timeout: 5000,
      fetchOptions: {
        headers: { "User-Agent": "bot" },
      },
    });

    const preview: LinkPreview = {
      url,
      title: result.ogTitle || null,
      description: result.ogDescription || null,
      image: result.ogImage?.[0]?.url || null,
      siteName: result.ogSiteName || null,
    };

    // Upsert into cache
    await db
      .insert(schema.linkPreviewCache)
      .values({
        url,
        title: preview.title,
        description: preview.description,
        image: preview.image,
        siteName: preview.siteName,
      })
      .onConflictDoUpdate({
        target: schema.linkPreviewCache.url,
        set: {
          title: preview.title,
          description: preview.description,
          image: preview.image,
          siteName: preview.siteName,
          fetchedAt: new Date(),
        },
      });

    return preview;
  } catch {
    return { url, title: null, description: null, image: null, siteName: null };
  }
}

/** Process link previews asynchronously (fire-and-forget) */
export function processLinkPreviews(messageId: string, channelId: string, content: string) {
  const urls = extractUrls(content);
  if (urls.length === 0) return;

  (async () => {
    try {
      const previews = await Promise.all(urls.map(fetchOgMetadata));
      const validPreviews = previews.filter((p) => p.title || p.description || p.image);

      if (validPreviews.length === 0) return;

      await db
        .update(schema.messages)
        .set({ linkPreviews: validPreviews })
        .where(eq(schema.messages.id, messageId));

      const io = getIO();
      io.to(`channel:${channelId}`).emit("message_updated", {
        id: messageId,
        channelId,
        linkPreviews: validPreviews,
      } as any);
    } catch (err) {
      console.error("Link preview processing failed:", err);
    }
  })();
}
