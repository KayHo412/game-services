import { pgTable, text, timestamp, boolean, integer, index } from "drizzle-orm/pg-core"

/* -------------------------------------------------------------------------- */
/*  Better Auth tables (do not rename columns — Better Auth expects these)     */
/* -------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updatedAt")
    .$defaultFn(() => new Date())
    .notNull(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt").$defaultFn(() => new Date()),
})

/* -------------------------------------------------------------------------- */
/*  Matchmaking domain tables                                                  */
/* -------------------------------------------------------------------------- */

// A player is a game profile tied to an authenticated user.
export const player = pgTable(
  "player",
  {
    id: text("id").primaryKey(),
    userId: text("userId").notNull(),
    username: text("username").notNull().unique(),
    displayName: text("displayName").notNull(),
    rating: integer("rating").default(1200).notNull(),
    wins: integer("wins").default(0).notNull(),
    losses: integer("losses").default(0).notNull(),
    draws: integer("draws").default(0).notNull(),
    gamesPlayed: integer("gamesPlayed").default(0).notNull(),
    // offline | online | in_queue | in_match
    status: text("status").default("offline").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => ({
    ratingIdx: index("idx_player_rating").on(t.rating),
  }),
)

// A ticket represents a player's request to be matched.
export const matchmakingTicket = pgTable(
  "matchmaking_ticket",
  {
    id: text("id").primaryKey(),
    playerId: text("playerId").notNull(),
    userId: text("userId").notNull(),
    gameMode: text("gameMode").default("ranked_1v1").notNull(),
    rating: integer("rating").notNull(),
    // searching | matched | cancelled
    status: text("status").default("searching").notNull(),
    matchId: text("matchId"),
    enqueuedAt: timestamp("enqueuedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => ({
    statusModeIdx: index("idx_ticket_status_mode").on(t.status, t.gameMode),
  }),
)

// A match groups players together for a game.
export const match = pgTable("match", {
  id: text("id").primaryKey(),
  gameMode: text("gameMode").default("ranked_1v1").notNull(),
  // active | completed | cancelled
  status: text("status").default("active").notNull(),
  winnerPlayerId: text("winnerPlayerId"),
  // e.g. "win" | "draw"
  result: text("result"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
})

// Join table: which players are in a match, with rating deltas.
export const matchPlayer = pgTable(
  "match_player",
  {
    id: text("id").primaryKey(),
    matchId: text("matchId").notNull(),
    playerId: text("playerId").notNull(),
    userId: text("userId").notNull(),
    team: integer("team").default(0).notNull(),
    ratingBefore: integer("ratingBefore").notNull(),
    ratingAfter: integer("ratingAfter"),
    ratingDelta: integer("ratingDelta"),
    // win | loss | draw
    outcome: text("outcome"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    matchIdx: index("idx_match_player_match").on(t.matchId),
  }),
)

// Friendships between players (requester -> addressee).
export const friendship = pgTable("friendship", {
  id: text("id").primaryKey(),
  requesterId: text("requesterId").notNull(),
  addresseeId: text("addresseeId").notNull(),
  // pending | accepted | declined
  status: text("status").default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
})

export type Player = typeof player.$inferSelect
export type MatchmakingTicket = typeof matchmakingTicket.$inferSelect
export type Match = typeof match.$inferSelect
export type MatchPlayer = typeof matchPlayer.$inferSelect
export type Friendship = typeof friendship.$inferSelect
