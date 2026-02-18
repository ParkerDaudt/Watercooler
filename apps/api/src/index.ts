import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { createServer } from "http";
import { env } from "./env.js";
import { setupSocketIO } from "./socket.js";
import { authRoutes } from "./routes/auth.js";
import { communityRoutes } from "./routes/community.js";
import { channelRoutes } from "./routes/channels.js";
import { messageRoutes } from "./routes/messages.js";
import { eventRoutes } from "./routes/events.js";
import { inviteRoutes } from "./routes/invites.js";
import { joinRequestRoutes } from "./routes/joinRequests.js";
import { moderationRoutes } from "./routes/moderation.js";
import { notificationRoutes } from "./routes/notifications.js";
import { uploadRoutes } from "./routes/uploads.js";
import { userRoutes } from "./routes/users.js";
import { categoryRoutes } from "./routes/categories.js";
import { searchRoutes } from "./routes/search.js";
import { roleRoutes } from "./routes/roles.js";
import { channelPermissionRoutes } from "./routes/channelPermissions.js";
import { ZodError } from "zod";
import { join } from "path";
import { readFileSync, existsSync } from "fs";

const app = Fastify({
  logger: true,
  serverFactory: (handler) => {
    const server = createServer(handler);
    setupSocketIO(server, env.CORS_ORIGIN);
    return server;
  },
});

await app.register(cors, {
  origin: env.CORS_ORIGIN,
  credentials: true,
});
await app.register(cookie);
await app.register(multipart, {
  limits: { fileSize: env.UPLOAD_MAX_MB * 1024 * 1024 },
});
await app.register(rateLimit, {
  max: 200,
  timeWindow: "1 minute",
  allowList: [],
});

// Stricter rate limit for auth endpoints
await app.register(
  async (instance) => {
    await instance.register(rateLimit, {
      max: 20,
      timeWindow: "1 minute",
    });
    await authRoutes(instance);
  },
  { prefix: "" }
);

// Zod error handler
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: "Validation error",
      details: error.errors,
    });
  }
  if (error.statusCode === 429) {
    return reply.code(429).send({ error: "Too many requests" });
  }
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message ?? "Internal server error" });
});

// Serve uploaded files
app.get("/uploads/*", async (request, reply) => {
  const filePath = (request.params as { "*": string })["*"];
  const fullPath = join(env.UPLOAD_DIR, filePath);
  if (!existsSync(fullPath)) {
    return reply.code(404).send({ error: "File not found" });
  }
  const data = readFileSync(fullPath);
  reply.send(data);
});

// Register routes
await communityRoutes(app);
await channelRoutes(app);
await messageRoutes(app);
await eventRoutes(app);
await inviteRoutes(app);
await joinRequestRoutes(app);
await moderationRoutes(app);
await notificationRoutes(app);
await uploadRoutes(app);
await userRoutes(app);
await categoryRoutes(app);
await searchRoutes(app);
await roleRoutes(app);
await channelPermissionRoutes(app);

// Health check
app.get("/api/health", async () => ({ status: "ok" }));

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  console.log(`API server running on port ${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
