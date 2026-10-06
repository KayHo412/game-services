# Game Services Backend & Developer Sandbox

[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F?style=flat-square&logo=drizzle)](https://orm.drizzle.team/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)
[![GitHub Actions](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=flat-square&logo=githubactions)](https://github.com/features/actions)
[![Better Auth](https://img.shields.io/badge/Auth-Better_Auth-purple?style=flat-square)](https://www.better-auth.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)

A modular, production-ready backend services platform designed for competitive multiplayer gaming ecosystems. It provides matchmaking queues with dynamic Elo tolerance expansion, match outcome processing, rating calculations, social friend networks, public leaderboards, and Server-Sent Events (SSE) for realtime push notifications.

The project features a **dark-themed Developer Control Sandbox** (`/`) allowing engineers to audit, simulate, and test all backend domain logic, match flows, and REST endpoints interactively.

---

## Core System Modules

### 1. Player Profile & Presence Management
- **Automatic Identity Association**: Seamlessly binds a competitive player profile to an authenticated user account (`userId`).
- **Input Validation**: Strictly enforces alphanumeric usernames (3–20 characters, letters, numbers, underscores) and ensures global uniqueness.
- **State Tracking**: Manages player presence states across the game lifecycle: `offline`, `online`, `in_queue`, and `in_match`.
- **Default Baseline**: Automatically seeds new competitive players at **1200 Elo**.

### 2. Dynamic Matchmaking Engine
- **Multi-Mode Queuing**: Supports distinct game modes (`ranked_1v1`, `casual_1v1`).
- **Dynamic Rating Tolerance Expansion**:
  To balance match quality with queue wait times, the search rating tolerance widens dynamically based on time spent in queue:
  $$\text{Tolerance}(t) = \min\left(1000,\, 100 + \left\lfloor\frac{t}{5}\right\rfloor \times 50\right)$$
  - Starts at $\pm 100$ Elo points.
  - Expands by $+50$ points every 5 seconds.
  - Caps at a maximum of $\pm 1000$ points.
- **Idempotent Worker Tick Pass (`POST /api/matchmaking/tick`)**:
  - Scans active `searching` tickets ordered by enqueue time.
  - Sorts candidates by rating and pairs adjacent compatible players within reciprocal tolerance.
  - Atomically creates `match` and `match_player` records, transitions tickets to `matched`, sets players to `in_match`, and triggers realtime `match_found` notifications.
  - Protected by an optional `WORKER_SECRET` header for secure execution via cron jobs or background schedulers.

### Concurrency Guarantees
- Matchmaking ticks use a PostgreSQL transaction and advisory lock, so concurrent workers cannot create duplicate matches.
- Queue joins are idempotent, and PostgreSQL enforces one searching ticket per player.
- Queue cancellation, match creation, participant membership, and player status changes are protected by conditional transactional updates.
- Match results lock the match and player records; the first valid result wins and later submissions return `409`.
- Player profiles and undirected friendship pairs are protected by unique database constraints.
- Realtime events are published only after a transaction commits. SSE remains best-effort and process-local.

When applying these schema changes to an existing database, inspect and reconcile duplicate player profiles, active tickets, match memberships, and friendship pairs before applying the new unique constraints.

### 3. Elo Rating & Match Engine
- **Standard Elo Formula**:
  Expected score for Player A against Player B:
  $$E_A = \frac{1}{1 + 10^{(R_B - R_A) / 400}}$$
  Updated rating calculation:
  $$R'_A = R_A + K \times (S_A - E_A)$$
  where $S_A \in \{1 \text{ (Win)},\, 0.5 \text{ (Draw)},\, 0 \text{ (Loss)}\}$.
- **Experience-Scaled K-Factor**:
  - **Provisional ($< 30$ games played)**: $K = 40$ (accelerated rating calibration).
  - **Established**: $K = 20$ (standard rating volatility).
  - **Master ($\ge 2400$ rating)**: $K = 10$ (stable high-tier rating).
- **Match Outcome Resolution**: Reports results, updates player records (wins, losses, draws, games played, status), calculates rating deltas, and closes matches atomically.

### 4. Social & Friends Network
- **Bi-directional Friendships**: Supports sending, accepting, declining, and removing friendship relations.
- **Realtime Notifications**: Notifies recipients instantly via SSE when friend requests or acceptances occur.
- **Safety Checks**: Prevents self-friending, duplicate pending requests, and unauthorized responses.

### 5. Public Leaderboards
- **Fast Indexed Queries**: Backed by `idx_player_rating` index on PostgreSQL for high-speed retrieval of top players.
- **Calculated Standings**: Returns ranks, ratings, display names, and W/L/D records.

### 6. Realtime Event Streaming (SSE)
- **Zero External Dependencies**: Implements an in-process EventEmitter pub/sub stream over HTTP Server-Sent Events (`/api/events`).
- **Automatic Heartbeats & Reconnects**: Dispatches keep-alive pings every 15 seconds to prevent proxy timeouts, with client-side auto-reconnect.
- **Event Types**: `match_found`, `match_completed`, `queue_update`, `friend_request`, `friend_accepted`, and `presence`.

### 7. Developer Test Sandbox (`/`)
- Interactive control panel built with Tailwind CSS and Radix/Shadcn primitives.
- Allows live testing of queue join/leave, manual worker ticks, match outcome simulation, friend request flows, and raw REST API execution with JSON response inspection.

---

## Database Schema

Designed with Drizzle ORM and PostgreSQL:

```
[user] (Better Auth)
  ├── id (PK, text)
  ├── email (unique, text)
  ├── name (text)
  └── createdAt, updatedAt (timestamp)

[session] (Better Auth)
  ├── id (PK, text)
  ├── userId (FK -> user.id, cascade)
  ├── token (unique, text)
  └── expiresAt (timestamp)

[player]
  ├── id (PK, text)
  ├── userId (FK -> user.id)
  ├── username (unique, text)
  ├── displayName (text)
  ├── rating (integer, default 1200, indexed)
  ├── wins, losses, draws, gamesPlayed (integer)
  └── status ('offline' | 'online' | 'in_queue' | 'in_match')

[matchmaking_ticket]
  ├── id (PK, text)
  ├── playerId (FK -> player.id)
  ├── userId (text)
  ├── gameMode ('ranked_1v1' | 'casual_1v1')
  ├── rating (integer)
  ├── status ('searching' | 'matched' | 'cancelled', indexed)
  └── enqueuedAt (timestamp)

[match]
  ├── id (PK, text)
  ├── gameMode (text)
  ├── status ('active' | 'completed' | 'cancelled')
  ├── winnerPlayerId (text, nullable)
  ├── result ('win' | 'draw', nullable)
  └── createdAt, completedAt (timestamp)

[match_player]
  ├── id (PK, text)
  ├── matchId (FK -> match.id, indexed)
  ├── playerId (FK -> player.id)
  ├── team (integer)
  ├── ratingBefore, ratingAfter, ratingDelta (integer)
  └── outcome ('win' | 'loss' | 'draw')

[friendship]
  ├── id (PK, text)
  ├── requesterId (FK -> player.id)
  ├── addresseeId (FK -> player.id)
  └── status ('pending' | 'accepted' | 'declined')
```

---

## REST API Reference

All responses return standard JSON envelopes `{ ok: true, data: ... }` or `{ ok: false, error: ... }`.

| Method | Endpoint | Description | Request Body | Auth Required |
| :--- | :--- | :--- | :--- | :---: |
| `POST` | `/api/auth/*` | Better Auth endpoints (sign-in, sign-up, sign-out) | `{ email, password, name? }` | No |
| `GET` | `/api/players` | Fetch authenticated user's player profile | None | Yes |
| `POST` | `/api/players` | Create player profile | `{ username: string, displayName?: string }` | Yes |
| `GET` | `/api/players/:id` | Get public player profile by ID | None | Yes |
| `GET` | `/api/matchmaking` | Get active queue ticket status & wait duration | None | Yes |
| `POST` | `/api/matchmaking` | Join matchmaking queue | `{ gameMode: "ranked_1v1" \| "casual_1v1" }` | Yes |
| `DELETE`| `/api/matchmaking` | Cancel search & leave matchmaking queue | None | Yes |
| `POST` | `/api/matchmaking/tick` | Run matchmaking pairing pass (worker/cron) | None (Optional `Bearer <WORKER_SECRET>`) | Optional |
| `GET` | `/api/matches` | Get authenticated player's recent matches | Query: `?limit=20` | Yes |
| `GET` | `/api/matches/:id` | Get match details and player participants | None | Yes |
| `POST` | `/api/matches/:id` | Report match outcome (calculates Elo) | `{ winnerPlayerId: string \| null }` | Yes |
| `GET` | `/api/friends` | List friendships and incoming/outgoing requests | None | Yes |
| `POST` | `/api/friends` | Send friend request by username | `{ username: string }` | Yes |
| `PATCH`| `/api/friends/:id` | Accept or decline incoming friend request | `{ action: "accept" \| "decline" }` | Yes |
| `DELETE`| `/api/friends/:id` | Remove friend or cancel request | None | Yes |
| `GET` | `/api/leaderboard` | Get top players ranked by rating | Query: `?limit=20` | No |
| `GET` | `/api/events` | Realtime Server-Sent Events stream | None (text/event-stream) | Yes |

---

## Quick Start with Docker Compose

Use this workflow when you open the project and want to run the complete application with PostgreSQL.

### Prerequisites
- Docker Desktop with Docker Compose
- Node.js 20+ (needed for the one-time schema command)

### First-time setup

#### 1. Open a terminal in the project folder
```bash
git clone https://github.com/KayHo412/game-services.git
cd game-services
```

#### 2. Create the environment file

Copy the example file and replace the placeholder secret with a long random value:
```bash
cp .env.example .env
```

#### 3. Install host dependencies

The host install is needed so `drizzle-kit` is available to initialize the database:
```bash
npm install
```

#### 4. Start the containers
```bash
docker compose up --build -d
```

The app is available at [http://localhost:3000](http://localhost:3000).

#### 5. Initialize the database schema

Run this once after creating a new database volume:
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/game_services" npx drizzle-kit push
```

Then open [http://localhost:3000/sign-up](http://localhost:3000/sign-up) to create an account.

### Normal daily startup

After the first-time setup, use:
```bash
docker compose up -d
```

Check service status or application logs when needed:
```bash
docker compose ps
docker compose logs -f app
```

### Stop and restart

Stop the containers without deleting database data:
```bash
docker compose down
```

Start them again later with:
```bash
docker compose up -d
```

To delete the database and start from an empty database, use this only intentionally:
```bash
docker compose down -v
```

## Alternative: run Next.js locally

If you already have PostgreSQL running locally, configure `DATABASE_URL` in `.env`, apply the schema with `npx drizzle-kit push`, and run:
```bash
npm run dev
```

---

## Testing & Quality Assurance

The project includes unit and API tests with Jest:

```bash
# Run all tests with code coverage
npm test

# Run tests in watch mode during development
npm run test:watch

# Run linter
npm run lint

# Run type check without emitting files
npx tsc --noEmit
```

---

## CI/CD Pipeline (GitHub Actions)

The automated CI workflow (`.github/workflows/ci.yml`) executes on every `push` and `pull_request` against `main` and `master`:

1. **Environment Setup**: Provisions Node.js 22 and PostgreSQL 16 service container with health checks.
2. **Dependency Installation**: Runs `npm ci` with dependency caching.
3. **Linting**: Verifies code quality via ESLint (`npm run lint`).
4. **Database Verification**: Validates schema push against PostgreSQL (`npx drizzle-kit push`).
5. **Test Execution**: Runs Jest test suites with coverage (`npm test -- --runInBand`).
6. **Next.js Standalone Build**: Verifies that the production application compiles cleanly (`npm run build`).
7. **Docker Image Build**: Utilizes `docker/build-push-action` to validate that the multi-stage `Dockerfile` builds without regression.

---

## Repository Structure

```
.
├── .github/
│   └── workflows/
│       └── ci.yml               # Automated CI workflow
├── app/
│   ├── api/                     # Next.js App Router REST API handlers
│   │   ├── auth/[...all]/       # Better Auth route
│   │   ├── events/              # Server-Sent Events endpoint
│   │   ├── friends/             # Friends & friend requests endpoints
│   │   ├── leaderboard/         # Leaderboard endpoint
│   │   ├── matches/             # Matches & match outcome reporting
│   │   ├── matchmaking/         # Queue & worker tick endpoints
│   │   └── players/             # Player profile CRUD endpoints
│   ├── layout.tsx               # Root application layout
│   ├── page.tsx                 # Home page (loads Developer Sandbox)
│   ├── sign-in/                 # Authentication sign-in page
│   └── sign-up/                 # Authentication sign-up page
├── components/
│   ├── auth-form.tsx            # Sign-in & sign-up forms
│   ├── dashboard/
│   │   ├── dashboard.tsx        # Developer Test Sandbox component
│   │   ├── create-player.tsx    # Player profile creation wizard
│   │   └── use-realtime.ts      # Client-side SSE hook
│   └── ui/                      # Shadcn / Radix UI primitives
├── lib/
│   ├── api.ts                   # Standard API response & error wrappers
│   ├── auth.ts                  # Better Auth server configuration
│   ├── auth-client.ts           # Better Auth client library
│   ├── client.ts                # Typed client-side fetch wrapper
│   ├── db/
│   │   ├── index.ts             # Drizzle ORM client initialization
│   │   └── schema.ts            # Complete PostgreSQL database schema
│   ├── elo.ts                   # Elo rating mathematics & K-factor logic
│   ├── events.ts                # EventEmitter in-memory pub/sub
│   ├── session.ts               # Session helpers & HttpError class
│   └── services/
│       ├── friends.ts           # Friendship domain service
│       ├── matches.ts           # Match retrieval & outcome service
│       └── matchmaking.ts       # Matchmaking queue & pairing worker
├── tests/                       # Jest test suites
├── Dockerfile                   # Multi-stage production container definition
├── docker-compose.yml           # Multi-container local/staging orchestration
├── drizzle.config.ts            # Drizzle Kit CLI configuration
└── next.config.mjs              # Next.js standalone build configuration
```

---

## License

This project is licensed under the MIT License.
