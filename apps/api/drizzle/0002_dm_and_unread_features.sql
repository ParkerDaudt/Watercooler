-- Add type column to channels and make communityId nullable for DMs
ALTER TABLE channels ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'channel';
ALTER TABLE channels ALTER COLUMN community_id DROP NOT NULL;

-- Create dm_participants table
CREATE TABLE IF NOT EXISTS dm_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS dm_participants_channel_idx ON dm_participants(channel_id);
CREATE INDEX IF NOT EXISTS dm_participants_user_idx ON dm_participants(user_id);

-- Create channel_read_states table
CREATE TABLE IF NOT EXISTS channel_read_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS channel_read_states_channel_user_idx ON channel_read_states(channel_id, user_id);