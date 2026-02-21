import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string(),
  SESSION_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3001),
  UPLOAD_MAX_MB: z.coerce.number().default(10),
  UPLOAD_DIR: z.string().default("/data/uploads"),
  CORS_ORIGIN: z.string().optional(),
  DOMAIN: z.string().optional(),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
});

const parsed = envSchema.parse(process.env);

// Derive CORS_ORIGIN automatically if not explicitly set:
// - In development: default to http://localhost:3000
// - In production: derive from DOMAIN (https for real domains, http for localhost/IPs)
function resolveCorsOrigin(): string {
  if (parsed.CORS_ORIGIN) return parsed.CORS_ORIGIN;
  if (parsed.NODE_ENV === "development") return "http://localhost:3000";
  const domain = parsed.DOMAIN || "localhost";
  const isLocal = domain === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(domain);
  return `${isLocal ? "http" : "https"}://${domain}`;
}

export const env = { ...parsed, CORS_ORIGIN: resolveCorsOrigin() };
