# Watercooler

A self-hosted, real-time community chat platform built for local communities, organizations, and teams. Features text and voice channels, direct messages, threads, events with RSVP, rich user profiles, role-based moderation, and an invite system -- all deployable with a single `docker compose up`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20+, TypeScript, Fastify 5, Socket.IO 4 |
| Frontend | Next.js 15, React 19, Tailwind CSS 4 |
| Database | PostgreSQL 16 |
| ORM | Drizzle |
| Auth | JWT (jose) + HTTP-only cookies, Argon2 password hashing |
| Reverse Proxy | Caddy 2 (automatic HTTPS) |
| Containerization | Docker & Docker Compose |

## Features

### Real-Time Chat
- Instant messaging via WebSockets (Socket.IO)
- Message editing and deletion
- Markdown-style formatting (bold, italic, strikethrough, code blocks, blockquotes, lists)
- @username mentions with notification badges
- Emoji reactions on messages
- Message replies and threads with reply counts
- Pin important messages
- Rich link previews (OpenGraph metadata with image, title, description)
- Typing indicators
- File and image uploads (configurable size limit)
- Full-text message search

### Channels & Direct Messages
- Public and private channels
- Announcement channels (read-only for non-staff)
- Channel categories with custom sort order
- Direct messages between users
- Unread message tracking per channel
- Channel-level permission overrides per role

### Voice Channels
- WebRTC peer-to-peer mesh audio and video
- Socket.IO-based signaling (offer/answer/ICE relay)
- Optional video with camera toggle (starts audio-only, no renegotiation needed)
- Automatic fallback to audio-only when no camera is available
- Local video preview with mirror effect
- Remote video tiles with responsive grid layout
- Mute, deafen, camera, and disconnect controls
- Voice channel participants visible in sidebar with camera/mute/deafen indicators
- Persistent voice status bar with camera toggle when connected
- STUN server support for NAT traversal

### User Presence & Profiles
- Online / away / do not disturb / invisible status
- Custom status messages
- User profiles with bio, avatar, banner image, and pronouns
- Connected links (social accounts displayed on profile)
- User badges with custom icons and colors
- Personal notes on other users (private, per-viewer)
- Member list with roles and join dates

### Events
- Create events with title, description, location, and date/time
- RSVP system: Going / Interested / Not Going
- Event list with attendance counts

### Moderation & Roles
- Default roles: Owner, Moderator, Member
- Custom roles with configurable colors and 11 granular permissions
- Role hierarchy with position ordering
- Kick, ban, and timeout users
- User warnings with severity levels (warning, caution, strike)
- Message reporting (members report, staff reviews)
- Full audit log of all moderation actions

### Access Control
- Invite links with configurable max uses and expiration
- "Request to Join" mode with staff approval workflow
- Private channels visible only to assigned roles/members
- Session invalidation on password change (token versioning)
- Recovery key for password reset (generated once at account creation)

### Accessibility
- Focus trapping in modals
- ARIA roles and labels on navigation, message list, and actions
- Keyboard navigation (Escape to close modals, Enter to send)
- Screen reader support with live regions for typing indicators
- Global error boundary
- Light and dark mode

---

## Quick Start (Local Development)

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- pnpm (run `corepack enable` to activate)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for PostgreSQL)

### 1. Start PostgreSQL

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts a PostgreSQL 16 instance on `localhost:5432` with user `watercooler`, password `watercooler`, database `watercooler`.

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

Create `apps/api/.env`:

```env
DATABASE_URL=postgresql://watercooler:watercooler@localhost:5432/watercooler
SESSION_SECRET=dev_secret_change_in_production_32chars
PORT=3001
UPLOAD_MAX_MB=10
UPLOAD_DIR=./data/uploads
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
```

### 4. Run database migrations

```bash
pnpm db:migrate
```

### 5. Start dev servers

```bash
pnpm dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:3001 |

### 6. Bootstrap your community

Open http://localhost:3000. The bootstrap wizard will guide you through creating the first admin (owner) account and naming your community. Default channels (announcements, general, events, buy-sell) are created automatically.

---

## Production Deployment (Docker Compose)

### 1. Clone and configure

```bash
git clone https://github.com/ParkerDaudt/Watercooler && cd Watercooler
cp infra/.env.example .env
```

Edit `.env` with your production values:

```env
DOMAIN=chat.yourdomain.com
POSTGRES_PASSWORD=<strong-random-password>
DATABASE_URL=postgresql://watercooler:<same-password>@postgres:5432/watercooler
SESSION_SECRET=<run: openssl rand -hex 32>
CORS_ORIGIN=https://chat.yourdomain.com
```

### 2. Deploy

```bash
docker compose up -d --build
```

This starts four services:

| Service | Description |
|---------|-------------|
| **postgres** | PostgreSQL 16 with persistent volume and healthcheck |
| **api** | Fastify API server (auto-runs migrations on startup) |
| **web** | Next.js frontend (standalone production build) |
| **caddy** | Reverse proxy with automatic HTTPS via Let's Encrypt |

### 3. Bootstrap

Visit your domain. The bootstrap wizard appears on first run to create the owner account and community.

### Local/LAN deployment (no domain, HTTP only)

For home servers or LAN use without a public domain:

```bash
# Use the HTTP-only Caddyfile
cp infra/Caddyfile.local infra/Caddyfile

# Set CORS_ORIGIN in .env to your server's IP
CORS_ORIGIN=http://192.168.1.100

docker compose up -d --build
```

Access at `http://your-server-ip`.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | -- | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | -- | JWT signing secret (min 32 characters) |
| `PORT` | No | `3001` | API server port |
| `UPLOAD_MAX_MB` | No | `10` | Max file upload size in MB |
| `UPLOAD_DIR` | No | `/data/uploads` | Upload storage directory |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin (must match how users access the site) |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `DOMAIN` | No | `localhost` | Domain for Caddy TLS (Docker only) |
| `POSTGRES_USER` | No | `watercooler` | PostgreSQL user (Docker only) |
| `POSTGRES_PASSWORD` | No | `changeme` | PostgreSQL password (Docker only) |
| `POSTGRES_DB` | No | `watercooler` | PostgreSQL database name (Docker only) |
| `NEXT_PUBLIC_API_URL` | No | `http://api:3001` | API URL for Next.js (Docker internal networking) |

---

## CLI Tools

### Reset a user's password

For admin recovery when a user can't log in:

```bash
# Local development
DATABASE_URL=postgresql://watercooler:watercooler@localhost:5432/watercooler npx tsx apps/api/src/reset-password.ts <email-or-username> <new-password>

# Inside Docker
docker compose exec api node /app/node_modules/tsx/dist/cli.mjs src/reset-password.ts <email-or-username> <new-password>
```

This resets the password and invalidates all existing sessions for that user. If the user is not found, the script lists all existing users to help identify the correct one.

### Seed default channels

If you need to recreate default channels:

```bash
pnpm db:seed
```

Creates: #announcements, #general, #events, #buy-sell (skips if community doesn't exist yet).

---

## Backups

### Create a backup

```bash
./infra/backup.sh
```

Or manually:

```bash
docker compose exec -T postgres pg_dump -U watercooler -d watercooler | gzip > backup_$(date +%Y%m%d).sql.gz
```

The backup script automatically retains the last 30 backups. Set up a cron job for automated daily backups:

```bash
0 3 * * * /path/to/project/infra/backup.sh
```

### Restore a backup

```bash
./infra/restore.sh /data/backups/watercooler_backup_20240101_030000.sql.gz
```

This will overwrite the current database. There is a 5-second delay before executing to allow cancellation with Ctrl+C.

---

## Project Structure

```
watercooler/
├── apps/
│   ├── api/                        # Backend (Fastify + Socket.IO)
│   │   ├── src/
│   │   │   ├── index.ts            # Server setup and route registration
│   │   │   ├── env.ts              # Environment variable validation
│   │   │   ├── auth.ts             # JWT tokens, auth hooks, session management
│   │   │   ├── socket.ts           # Socket.IO real-time event handlers
│   │   │   ├── migrate.ts          # Database migration runner
│   │   │   ├── seed.ts             # Default channel seeder
│   │   │   ├── reset-password.ts   # CLI password reset tool
│   │   │   ├── db/
│   │   │   │   ├── schema.ts       # Drizzle ORM table definitions
│   │   │   │   └── index.ts        # Database client
│   │   │   ├── routes/             # REST API endpoints
│   │   │   │   ├── auth.ts         # Login, signup, bootstrap, password reset
│   │   │   │   ├── community.ts    # Community settings
│   │   │   │   ├── channels.ts     # Channel CRUD, DM creation
│   │   │   │   ├── categories.ts   # Channel categories
│   │   │   │   ├── messages.ts     # Messages, pins, threads
│   │   │   │   ├── users.ts        # Profiles, settings, avatar upload
│   │   │   │   ├── events.ts       # Events CRUD, RSVP
│   │   │   │   ├── invites.ts      # Invite code management
│   │   │   │   ├── joinRequests.ts # Join request approval workflow
│   │   │   │   ├── moderation.ts   # Kick, ban, timeout, warnings, reports
│   │   │   │   ├── roles.ts        # Custom role management
│   │   │   │   ├── channelPermissions.ts
│   │   │   │   ├── search.ts       # Full-text message search
│   │   │   │   ├── notifications.ts
│   │   │   │   └── uploads.ts      # File upload handler
│   │   │   └── services/
│   │   │       ├── permissions.ts  # Permission computation engine
│   │   │       └── linkPreviews.ts # OpenGraph scraping and caching
│   │   ├── drizzle/                # SQL migration files (0000-0011)
│   │   ├── entrypoint.sh           # Docker entrypoint (migrate + start)
│   │   └── Dockerfile
│   │
│   └── web/                        # Frontend (Next.js 15)
│       ├── src/
│       │   ├── app/                # Next.js app router
│       │   │   ├── page.tsx        # Main application page
│       │   │   ├── layout.tsx      # Root layout
│       │   │   └── error.tsx       # Error boundary
│       │   ├── components/
│       │   │   ├── AppShell.tsx     # Main layout with navigation
│       │   │   ├── AuthForm.tsx     # Login / signup forms
│       │   │   ├── BootstrapForm.tsx# First-run setup wizard
│       │   │   ├── ChatPanel.tsx    # Message list and input
│       │   │   ├── MessageBubble.tsx# Message rendering with reactions
│       │   │   ├── ChannelSidebar.tsx
│       │   │   ├── VoiceChannel.tsx # Voice channel view with controls
│       │   │   ├── VoiceStatusBar.tsx # Persistent voice status in sidebar
│       │   │   ├── EventsPanel.tsx  # Events display and RSVP
│       │   │   ├── AdminPanel.tsx   # Moderation dashboard
│       │   │   ├── ThreadPanel.tsx  # Thread view
│       │   │   ├── SearchPanel.tsx  # Message search
│       │   │   ├── UserProfileModal.tsx
│       │   │   ├── UserSettingsModal.tsx
│       │   │   ├── ServerSettingsModal.tsx
│       │   │   └── ...
│       │   ├── hooks/
│       │   │   └── useVoice.ts     # WebRTC + signaling hook
│       │   └── lib/
│       │       ├── api.ts          # HTTP API client
│       │       ├── socket.ts       # Socket.IO client
│       │       ├── useAuth.ts      # Auth context and hooks
│       │       ├── theme.tsx       # Theme provider (light/dark)
│       │       └── useFocusTrap.ts # Accessibility focus trap hook
│       └── Dockerfile
│
├── packages/
│   └── shared/                     # Shared between frontend and backend
│       └── src/
│           ├── types.ts            # TypeScript interfaces
│           ├── schemas.ts          # Zod validation schemas
│           └── index.ts
│
├── infra/
│   ├── .env.example                # Environment variable template
│   ├── Caddyfile                   # Reverse proxy config (HTTPS)
│   ├── Caddyfile.local             # Reverse proxy config (HTTP, for LAN)
│   ├── backup.sh                   # Database backup script
│   └── restore.sh                  # Database restore script
│
├── docker-compose.yml              # Production deployment
├── docker-compose.dev.yml          # Development (PostgreSQL only)
└── pnpm-workspace.yaml             # Monorepo workspace config
```

---

## API Reference

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/status` | Check if community is bootstrapped |
| POST | `/api/auth/bootstrap` | First-run setup (creates owner + community) |
| POST | `/api/auth/signup` | Register with invite code |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/logout` | Log out (clears session cookie) |
| GET | `/api/auth/me` | Get current authenticated user |
| POST | `/api/auth/reset-password` | Reset password with recovery key |
| GET | `/api/auth/token` | Get session token for Socket.IO auth |

### Community

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/community` | Get community info |
| PATCH | `/api/community` | Update settings (owner only) |

### Channels

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/channels` | List all accessible channels |
| POST | `/api/channels` | Create channel |
| PATCH | `/api/channels/:id` | Update channel |
| DELETE | `/api/channels/:id` | Delete channel |
| POST | `/api/channels/dm` | Create or get DM channel |

### Messages

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/channels/:id/messages` | Get message history (paginated) |
| POST | `/api/channels/:id/messages` | Send message (REST) |
| POST | `/api/channels/:id/upload` | Upload file attachment |
| GET | `/api/channels/:id/pinned` | Get pinned messages |
| GET | `/api/channels/:id/messages/:msgId/thread` | Get thread replies |

### Users

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users/:id/profile` | Get user profile (bio, badges, activity stats) |
| PATCH | `/api/users/me` | Update profile (username, bio, email, pronouns) |
| POST | `/api/users/me/password` | Change password |
| POST | `/api/users/me/avatar` | Upload avatar |
| POST | `/api/users/me/banner` | Upload profile banner image |
| PUT | `/api/users/:id/note` | Set personal note on a user |
| DELETE | `/api/users/:id/note` | Remove personal note |
| GET | `/api/users/search` | Search users by username |

### Events

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events` | List events |
| POST | `/api/events` | Create event |
| PATCH | `/api/events/:id` | Update event |
| DELETE | `/api/events/:id` | Delete event |
| POST | `/api/events/:id/rsvp` | RSVP to event |

### Members & Invites

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/members` | List community members |
| PATCH | `/api/members/:id/role` | Change member role (owner) |
| GET | `/api/invites` | List invite codes |
| POST | `/api/invites` | Create invite code |
| DELETE | `/api/invites/:id` | Revoke invite |
| POST | `/api/invites/join` | Join via invite code |
| GET | `/api/join-requests` | List join requests |
| POST | `/api/join-requests` | Submit join request |
| PATCH | `/api/join-requests/:id` | Approve or deny request |

### Moderation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/mod/kick` | Kick member |
| POST | `/api/mod/ban` | Ban member |
| POST | `/api/mod/timeout` | Timeout member |
| POST | `/api/mod/delete-message` | Delete a message |
| GET | `/api/mod/warnings/:userId` | Get user warnings |
| POST | `/api/mod/warnings` | Issue a warning |
| POST | `/api/reports` | Report a message |
| GET | `/api/reports` | List reports |
| PATCH | `/api/reports/:id` | Update report status |
| GET | `/api/audit-logs` | View audit log |

### Roles & Permissions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/roles` | List roles |
| POST | `/api/roles` | Create custom role |
| PATCH | `/api/roles/:id` | Update role |
| DELETE | `/api/roles/:id` | Delete role |
| POST | `/api/roles/:id/assign` | Assign role to member |
| DELETE | `/api/roles/:id/assign/:membershipId` | Remove role from member |
| GET | `/api/channels/:id/permissions` | Get channel permission overrides |
| PUT | `/api/channels/:id/permissions` | Set channel permission overrides |

### Other

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/search` | Search messages |
| GET | `/api/notifications` | List notifications |
| GET | `/api/notifications/unread-count` | Get unread count |
| POST | `/api/notifications/mark-read` | Mark notifications as read |
| GET | `/api/categories` | List channel categories |
| POST | `/api/categories` | Create category |
| PATCH | `/api/categories/:id` | Update category |
| DELETE | `/api/categories/:id` | Delete category |

### Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `join_channel` | Client -> Server | Subscribe to channel messages |
| `leave_channel` | Client -> Server | Unsubscribe from channel |
| `send_message` | Client -> Server | Send a message |
| `edit_message` | Client -> Server | Edit own message |
| `delete_message` | Client -> Server | Delete own message |
| `add_reaction` | Client -> Server | Add emoji reaction |
| `remove_reaction` | Client -> Server | Remove emoji reaction |
| `typing` | Client -> Server | Broadcast typing indicator |
| `pin_message` | Client -> Server | Pin or unpin a message |
| `set_status` | Client -> Server | Update presence status |
| `get_online_users` | Client -> Server | Fetch online user list |
| `mark_read` | Client -> Server | Mark channel as read |
| `new_message` | Server -> Client | New message in channel |
| `message_updated` | Server -> Client | Message edited or link previews added |
| `message_deleted` | Server -> Client | Message was deleted |
| `message_pinned` / `message_unpinned` | Server -> Client | Pin state changed |
| `reaction_added` / `reaction_removed` | Server -> Client | Reaction changed |
| `user_typing` | Server -> Client | Someone is typing |
| `presence_update` | Server -> Client | User came online/offline |
| `user_banned` / `user_timeout` | Server -> Client | Moderation action |
| `notification` | Server -> Client | New notification |
| `voice_join` | Client -> Server | Join a voice channel |
| `voice_leave` | Client -> Server | Leave current voice channel |
| `voice_offer` | Client -> Server | Send WebRTC offer to a peer |
| `voice_answer` | Client -> Server | Send WebRTC answer to a peer |
| `voice_ice_candidate` | Client -> Server | Relay ICE candidate to a peer |
| `voice_state_update` | Bidirectional | Update/broadcast mute/deafen/video state |
| `get_voice_states` | Client -> Server | Fetch all voice channel participants |
| `voice_user_joined` | Server -> Client | User joined a voice channel |
| `voice_user_left` | Server -> Client | User left a voice channel |

---

## Available Scripts

From the project root:

```bash
pnpm dev              # Start all dev servers (API + Web)
pnpm dev:api          # Start API server only
pnpm dev:web          # Start frontend only
pnpm build            # Build all packages
pnpm db:migrate       # Run database migrations
pnpm db:seed          # Seed default channels
pnpm db:generate      # Generate new migration from schema changes
pnpm lint             # Lint all packages
```

---

## License

MIT
