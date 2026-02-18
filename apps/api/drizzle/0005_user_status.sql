-- User status: online/away/dnd/invisible + custom status text
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'online';
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_status TEXT DEFAULT '';
