import type { FastifyInstance } from "fastify";
import { authHook, communityHook, requireNotTimedOut, verifyChannelAccess, type AuthedRequest } from "../auth.js";
import { env } from "../env.js";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join, extname, resolve } from "path";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Magic byte signatures for allowed file types
const MAGIC_BYTES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: "image/jpeg", bytes: [0xFF, 0xD8, 0xFF] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF....WEBP
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
];

function detectMime(buffer: Buffer): string | null {
  for (const sig of MAGIC_BYTES) {
    const offset = sig.offset ?? 0;
    if (buffer.length < offset + sig.bytes.length) continue;
    if (sig.mime === "image/webp") {
      // RIFF at 0, WEBP at 8
      if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
          buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return "image/webp";
      }
      continue;
    }
    const match = sig.bytes.every((b, i) => buffer[offset + i] === b);
    if (match) return sig.mime;
  }
  return null;
}

export async function uploadRoutes(app: FastifyInstance) {
  const preHandler = [authHook, communityHook, requireNotTimedOut];

  app.post("/api/channels/:channelId/upload", { preHandler }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { channelId } = request.params as { channelId: string };

    if (!UUID_RE.test(channelId)) {
      return reply.code(400).send({ error: "Invalid channel ID" });
    }

    const access = await verifyChannelAccess(channelId, req.user.id, req.communityId);
    if (!access.ok) return reply.code(access.code).send({ error: access.error });

    const data = await request.file();
    if (!data) return reply.code(400).send({ error: "No file provided" });

    const maxBytes = env.UPLOAD_MAX_MB * 1024 * 1024;
    const buffer = await data.toBuffer();
    if (buffer.length > maxBytes) {
      return reply.code(413).send({ error: `File too large. Max ${env.UPLOAD_MAX_MB}MB` });
    }

    const allowedMimes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
    ];
    if (!allowedMimes.includes(data.mimetype)) {
      return reply.code(400).send({ error: "File type not allowed" });
    }

    // Verify actual file content matches claimed MIME type
    const detectedMime = detectMime(buffer);
    if (!detectedMime || !allowedMimes.includes(detectedMime)) {
      return reply.code(400).send({ error: "File content does not match allowed types" });
    }

    const fileId = randomUUID();
    const safeExt = extname(data.filename).replace(/[^a-zA-Z0-9.]/g, "") || ".bin";
    const filename = `${fileId}${safeExt}`;
    const uploadDir = resolve(env.UPLOAD_DIR, channelId);
    if (!uploadDir.startsWith(resolve(env.UPLOAD_DIR))) {
      return reply.code(400).send({ error: "Invalid channel ID" });
    }
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), buffer);

    // Return file metadata — attachment record is created when the message is sent
    return {
      url: `/uploads/${channelId}/${filename}`,
      filename: data.filename,
      mime: data.mimetype,
      size: buffer.length,
    };
  });
}
