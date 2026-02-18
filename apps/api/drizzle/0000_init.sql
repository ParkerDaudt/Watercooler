CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" varchar(255) NOT NULL UNIQUE,
  "username" varchar(32) NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "communities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(100) NOT NULL,
  "invite_only" boolean NOT NULL DEFAULT true,
  "request_to_join" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "community_id" uuid NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "role" varchar(20) NOT NULL DEFAULT 'member',
  "display_name" varchar(64),
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "timeout_until" timestamptz,
  "joined_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "memberships_user_community_idx" ON "memberships" ("user_id", "community_id");

CREATE TABLE IF NOT EXISTS "channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "community_id" uuid NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "name" varchar(64) NOT NULL,
  "is_private" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "channels_community_idx" ON "channels" ("community_id");

CREATE TABLE IF NOT EXISTS "channel_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "channel_members_channel_idx" ON "channel_members" ("channel_id");

CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "content" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "edited_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "messages_channel_created_idx" ON "messages" ("channel_id", "created_at");

CREATE TABLE IF NOT EXISTS "attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "filename" varchar(255) NOT NULL,
  "mime" varchar(128) NOT NULL,
  "size" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "community_id" uuid NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "location_text" varchar(500) NOT NULL DEFAULT '',
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "events_community_idx" ON "events" ("community_id");

CREATE TABLE IF NOT EXISTS "event_rsvps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(20) NOT NULL
);
CREATE INDEX IF NOT EXISTS "event_rsvps_event_idx" ON "event_rsvps" ("event_id");

CREATE TABLE IF NOT EXISTS "invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "community_id" uuid NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "code" varchar(32) NOT NULL UNIQUE,
  "max_uses" integer NOT NULL DEFAULT 0,
  "uses" integer NOT NULL DEFAULT 0,
  "expires_at" timestamptz,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "join_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "community_id" uuid NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "join_requests_community_idx" ON "join_requests" ("community_id");

CREATE TABLE IF NOT EXISTS "reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "community_id" uuid NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "reporter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "community_id" uuid NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "actor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "action" varchar(64) NOT NULL,
  "target_type" varchar(32) NOT NULL,
  "target_id" uuid NOT NULL,
  "metadata_json" jsonb DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "audit_logs_community_idx" ON "audit_logs" ("community_id", "created_at");

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "community_id" uuid NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "type" varchar(32) NOT NULL,
  "payload_json" jsonb DEFAULT '{}',
  "read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" ("user_id", "read_at");
