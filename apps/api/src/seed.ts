import { db, schema } from "./db/index.js";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Checking if seed is needed...");

  const [community] = await db.select().from(schema.communities).limit(1);
  if (!community) {
    console.log("No community found. Run bootstrap first.");
    process.exit(0);
  }

  const defaultChannels = ["announcements", "general", "events", "buy-sell"];
  for (const name of defaultChannels) {
    const [existing] = await db
      .select()
      .from(schema.channels)
      .where(eq(schema.channels.name, name))
      .limit(1);
    if (!existing) {
      await db.insert(schema.channels).values({ communityId: community.id, name });
      console.log(`Created channel #${name}`);
    } else {
      console.log(`Channel #${name} already exists`);
    }
  }

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
