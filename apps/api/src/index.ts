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
import { join, resolve, extname } from "path";
import { readFileSync, existsSync } from "fs";

// In development, accept both localhost and 127.0.0.1
const allowedOrigins = [env.CORS_ORIGIN];
if (env.NODE_ENV === "development") {
  const alt = env.CORS_ORIGIN.replace("localhost", "127.0.0.1");
  if (alt !== env.CORS_ORIGIN) allowedOrigins.push(alt);
}

const app = Fastify({
  logger: true,
  serverFactory: (handler) => {
    const server = createServer(handler);
    setupSocketIO(server, allowedOrigins);
    return server;
  },
});

await app.register(cors, {
  origin: allowedOrigins,
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

// CSRF: verify Origin header on state-changing requests
app.addHook("onRequest", async (request, reply) => {
  const method = request.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const origin = request.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    reply.code(403).send({ error: "Invalid origin" });
  }
});

// Security headers
app.addHook("onSend", async (_request, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("X-XSS-Protection", "0"); // modern browsers use CSP instead
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  reply.header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' wss: ws:; frame-ancestors 'none'");
  if (env.NODE_ENV === "production") {
    reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
});

// Stricter rate limit for auth endpoints
await app.register(
  async (instance) => {
    await instance.register(rateLimit, {
      max: env.NODE_ENV === "development" ? 30 : 5,
      timeWindow: "1 minute",
    });
    await authRoutes(instance);
  },
  { prefix: "" }
);

// Zod error handler
app.setErrorHandler((error: unknown, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: "Validation error",
      details: error.errors,
    });
  }
  const fastifyError = error as { statusCode?: number; message?: string };
  if (fastifyError.statusCode === 429) {
    return reply.code(429).send({ error: "Too many requests" });
  }
  app.log.error(error);
  const status = fastifyError.statusCode ?? 500;
  const message = status >= 500 && env.NODE_ENV === "production"
    ? "Internal server error"
    : (fastifyError.message ?? "Internal server error");
  reply.code(status).send({ error: message });
});

// MIME type map for uploaded files
const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".gif": "image/gif",
  ".webp": "image/webp", ".pdf": "application/pdf",
};

// Serve uploaded files
app.get("/uploads/*", async (request, reply) => {
  const filePath = (request.params as { "*": string })["*"];
  const fullPath = resolve(env.UPLOAD_DIR, filePath);
  if (!fullPath.startsWith(resolve(env.UPLOAD_DIR))) {
    return reply.code(400).send({ error: "Invalid path" });
  }
  if (!existsSync(fullPath)) {
    return reply.code(404).send({ error: "File not found" });
  }
  const ext = extname(fullPath).toLowerCase();
  const mime = MIME_MAP[ext] || "application/octet-stream";
  const disposition = mime.startsWith("image/") ? "inline" : "attachment";
  reply.header("Content-Type", mime);
  reply.header("Content-Disposition", disposition);
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
