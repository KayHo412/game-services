# Game Services Backend & Interactive Test Dashboard

A full-stack, production-ready backend services platform designed for multiplayer gaming ecosystems. Built with **Next.js 15+**, **TypeScript**, **Better Auth**, **Drizzle ORM**, **PostgreSQL**, and **Server-Sent Events (SSE)** for realtime updates.

Includes a minimal, dark-themed **Interactive Frontend Dashboard** specifically designed to test, demonstrate, and audit all backend features, match logic, Elo rating calculations, and REST endpoints in real time.

---

## Key Features & Architecture

### 1. Player Profile & Stat Management
- **Automated Registration**: Profile setup with custom unique usernames and display names.
- **Rating & Record Tracking**: Default starting Elo (1200), total games played, wins, losses, draws, and presence status (`offline`, `online`, `in_queue`, `in_match`).

### 2. Smart Matchmaking Engine
- **Queue Management**: Multi-mode queue (`ranked_1v1`, `casual_1v1`) with status tracking.
- **Dynamic Rating Tolerance Expansion**: Automatically widens Elo match range over time (starting at ±100, expanding by +50 every 5 seconds up to ±1000) to prevent queue stagnation while maintaining competitive fairness.
- **Matchmaking Worker Pass (`POST /api/matchmaking/tick`)**: Idempotent algorithm that greedily pairs closely-rated queue candidates and creates active matches.

### 3. Elo Rating & Match Engine
- **Competitive Elo Formula**: Computes expected outcome scores and rating adjustments.
- **Dynamic K-Factor Scaling**: Provisional players (< 30 games) scale with $K=40$ for faster placement, established players with $K=20$, and masters ($\ge 2400$) with $K=10$.
- **Match Outcome Reporting**: Supports Win/Loss/Draw reporting, updating both participants' Elo ratings, records, and closing the match state atomically.

### 4. Social & Friends System
- **Bi-directional Friend Requests**: Send requests by username, receive realtime notifications.
- **Request Resolution**: Accept or decline pending incoming requests (`PATCH /api/friends/:id`).
- **Friendship Management**: Delete friends (`DELETE /api/friends/:id`) and view online status.

### 5. Public Leaderboard Service
- **Elo Rankings**: Fast, indexed database queries retrieving top players ranked by Elo rating (`GET /api/leaderboard`).

### 6. Realtime Server-Sent Events (SSE)
- **In-Process Pub/Sub Architecture**: Streams instant push notifications (`match_found`, `match_completed`, `friend_request`, `friend_accepted`, `presence`) directly to client browsers over persistent SSE stream (`GET /api/events`).

### 7. Interactive Frontend Test Dashboard
- **Live Matchmaking & Match Simulator**: Join queues, trigger worker ticks, and report match results.
- **Social & Friends Hub**: Manage friend requests live with realtime status badges.
- **Live SSE Event Feed**: Scrollable real-time JSON event stream monitor.
- **Raw API Tester**: Integrated REST client to execute and inspect raw JSON responses & HTTP status codes for any backend route.

---

## Tech Stack

- **Framework**: Next.js 15+ (App Router & Route Handlers)
- **Language**: TypeScript 5
- **Authentication**: Better Auth (Email & Password, Session management)
- **Database & ORM**: PostgreSQL, Drizzle ORM
- **Realtime**: Server-Sent Events (SSE) & Node.js EventEmitter Pub/Sub
- **Styling & UI**: Tailwind CSS v4, Lucide React, Shadcn/UI primitives, Sonner toasts

---

## API Endpoints Reference

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/*` | Better Auth endpoints (sign-in, sign-up, sign-out) | No |
| `GET` | `/api/players` | Get authenticated user's player profile | Yes |
| `POST` | `/api/players` | Create player profile (`username`, `displayName`) | Yes |
| `GET` | `/api/players/:id` | View public player profile | Yes |
| `GET` | `/api/matchmaking` | Get current queue status & waiting metrics | Yes |
| `POST` | `/api/matchmaking` | Join matchmaking queue (`gameMode`) | Yes |
| `DELETE` | `/api/matchmaking` | Leave matchmaking queue | Yes |
| `POST/GET`| `/api/matchmaking/tick` | Execute matchmaking pairing algorithm pass | Optional Secret |
| `GET` | `/api/matches` | List player's recent & active matches | Yes |
| `GET` | `/api/matches/:id` | Get match details and participant stats | Yes |
| `POST` | `/api/matches/:id` | Report match outcome (`winnerPlayerId` or `null` for draw) | Yes |
| `GET` | `/api/friends` | List player's friendships and pending requests | Yes |
| `POST` | `/api/friends` | Send friend request (`username`) | Yes |
| `PATCH` | `/api/friends/:id` | Accept or decline request (`action: "accept" "decline"`) | Yes |
| `DELETE` | `/api/friends/:id` | Remove friend or cancel request | Yes |
| `GET` | `/api/leaderboard` | Get public top players list sorted by Elo | No |
| `GET` | `/api/events` | Stream realtime Server-Sent Events (SSE) | Yes |

---

## Quick Start / Local Setup

### 1. Environment Setup
Create a `.env` file in the root directory:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/game_services"
BETTER_AUTH_SECRET="your-better-auth-secret-key"
BETTER_AUTH_URL="http://localhost:3000"
# Optional worker protection secret:
# WORKER_SECRET="your-worker-secret"
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Database Migrations / Schema Push
```bash
npx drizzle-kit push
```

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
