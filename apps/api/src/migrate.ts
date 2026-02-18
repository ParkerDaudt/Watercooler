import postgres from "postgres";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const connectionString = process.env.DATABASE_URL!;
  const sql = postgres(connectionString);

  console.log("Running migrations...");

  const migrationFiles = [
    "0000_init.sql",
    "0001_realtime_features.sql",
    "0002_dm_and_unread_features.sql",
    "0003_new_features.sql",
    "0004_search_pins_categories_threads.sql",
    "0005_user_status.sql",
    "0006_user_avatars.sql",
    "0007_custom_roles.sql",
    "0008_warnings.sql",
    "0009_recovery_keys.sql",
    "0010_token_version.sql",
    "0011_link_previews.sql",
  ];
  for (const file of migrationFiles) {
    const migrationSql = readFileSync(join(__dirname, `../drizzle/${file}`), "utf-8");
    await sql.unsafe(migrationSql);
  }

  console.log("Migrations complete.");
  await sql.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
