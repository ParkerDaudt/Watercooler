import postgres from "postgres";
import { hash } from "argon2";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql as dsql } from "drizzle-orm";
import * as schema from "./db/schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is required.");
  console.error("Usage: DATABASE_URL=postgresql://... npx tsx src/reset-password.ts <email-or-username> <new-password>");
  process.exit(1);
}

const identifier = process.argv[2];
const newPassword = process.argv[3];

if (!identifier || !newPassword) {
  console.error("Usage: npx tsx src/reset-password.ts <email-or-username> <new-password>");
  process.exit(1);
}

if (newPassword.length < 6) {
  console.error("Password must be at least 6 characters.");
  process.exit(1);
}

async function main() {
  const sql = postgres(connectionString!);
  const db = drizzle(sql, { schema });

  // Find user by email or username
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email, username: schema.users.username })
    .from(schema.users)
    .where(
      identifier!.includes("@")
        ? eq(schema.users.email, identifier!)
        : eq(schema.users.username, identifier!)
    )
    .limit(1);

  if (!user) {
    console.error(`No user found with ${identifier!.includes("@") ? "email" : "username"}: ${identifier}`);

    // List available users to help
    const users = await db
      .select({ email: schema.users.email, username: schema.users.username })
      .from(schema.users);

    if (users.length > 0) {
      console.log("\nExisting users:");
      for (const u of users) {
        console.log(`  - ${u.username} (${u.email})`);
      }
    }

    await sql.end();
    process.exit(1);
  }

  const passwordHash = await hash(newPassword!);
  await db
    .update(schema.users)
    .set({ passwordHash, tokenVersion: dsql`token_version + 1` })
    .where(eq(schema.users.id, user.id));

  console.log(`Password reset successfully for ${user.username} (${user.email}).`);
  console.log("All existing sessions have been invalidated.");
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to reset password:", err);
  process.exit(1);
});
