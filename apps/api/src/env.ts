import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string(),
  SESSION_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3001),
  UPLOAD_MAX_MB: z.coerce.number().default(10),
  UPLOAD_DIR: z.string().default("/data/uploads"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
});

export const env = envSchema.parse(process.env);
