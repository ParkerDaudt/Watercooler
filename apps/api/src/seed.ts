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

  // Seed default badges
  const defaultBadges = [
    { name: "Early Member", description: "Joined within the first month", icon: "star", color: "#f59e0b" },
    { name: "Top Contributor", description: "Sent over 1000 messages", icon: "trophy", color: "#10b981" },
    { name: "Event Organizer", description: "Created 5+ events", icon: "calendar", color: "#6366f1" },
    { name: "Helper", description: "Recognized for helping others", icon: "heart", color: "#ec4899" },
    { name: "Moderator", description: "Community moderator", icon: "shield", color: "#3b82f6" },
  ];
  for (const badge of defaultBadges) {
    const [existing] = await db
      .select()
      .from(schema.badges)
      .where(eq(schema.badges.name, badge.name))
      .limit(1);
    if (!existing) {
      await db.insert(schema.badges).values(badge);
      console.log(`Created badge: ${badge.name}`);
    } else {
      console.log(`Badge "${badge.name}" already exists`);
    }
  }

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
