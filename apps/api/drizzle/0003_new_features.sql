-- User profiles: add bio
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';

-- Channel permissions: read-only announcements
ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_announcement BOOLEAN NOT NULL DEFAULT false;

-- Community customization: logo and accent
ALTER TABLE communities ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20) DEFAULT '#6366f1';
