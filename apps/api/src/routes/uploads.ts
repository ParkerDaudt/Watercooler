import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { authHook, communityHook, requireNotTimedOut, type AuthedRequest } from "../auth.js";
import { env } from "../env.js";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join, extname } from "path";

export async function uploadRoutes(app: FastifyInstance) {
  const preHandler = [authHook, communityHook, requireNotTimedOut];

  app.post("/api/channels/:channelId/upload", { preHandler }, async (request, reply) => {
    const req = request as AuthedRequest;
    const { channelId } = request.params as { channelId: string };

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

    const fileId = randomUUID();
    const ext = extname(data.filename) || ".bin";
    const filename = `${fileId}${ext}`;
    const uploadDir = join(env.UPLOAD_DIR, channelId);
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), buffer);

    // Create message with attachment
    const [message] = await db
      .insert(schema.messages)
      .values({
        channelId,
        userId: req.user.id,
        content: `[file: ${data.filename}]`,
      })
      .returning();

    const [attachment] = await db
      .insert(schema.attachments)
      .values({
        messageId: message.id,
        url: `/uploads/${channelId}/${filename}`,
        filename: data.filename,
        mime: data.mimetype,
        size: buffer.length,
      })
      .returning();

    return {
      ...message,
      createdAt: message.createdAt.toISOString(),
      editedAt: null,
      user: { id: req.user.id, username: req.user.username, avatarUrl: req.user.avatarUrl },
      attachments: [attachment],
    };
  });
}
