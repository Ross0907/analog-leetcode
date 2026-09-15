import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  problemSlug: text("problem_slug").notNull(),
  problemVersion: integer("problem_version").notNull(),
  status: text("status", { enum: ["accepted", "rejected"] }).notNull(),
  solutionJson: text("solution_json").notNull(),
  resultJson: text("result_json").notNull().default("{}"),
  score: integer("score").notNull(),
  runtimeMs: integer("runtime_ms").notNull(),
  graderVersion: text("grader_version").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_submissions_user_idempotency").on(table.userId, table.idempotencyKey),
  index("idx_submissions_user_created").on(table.userId, table.createdAt),
  index("idx_submissions_problem_score").on(table.problemSlug, table.score),
]);

export const userProblemProgress = sqliteTable("user_problem_progress", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  problemSlug: text("problem_slug").notNull(),
  bestScore: integer("best_score").notNull().default(0),
  attemptCount: integer("attempt_count").notNull().default(0),
  solvedAt: text("solved_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.userId, table.problemSlug] }),
  index("idx_progress_problem_score").on(table.problemSlug, table.bestScore),
]);

/**
 * A small, shared fixed-window throttle for write APIs. The subject is a
 * one-way digest of the edge-provided client address; raw addresses are never
 * persisted. Expiry is explicit so old buckets can be pruned opportunistically.
 */
export const apiRateLimits = sqliteTable("api_rate_limits", {
  subjectHash: text("subject_hash").primaryKey(),
  windowStartedAtMs: integer("window_started_at_ms").notNull(),
  requestCount: integer("request_count").notNull(),
  expiresAtMs: integer("expires_at_ms").notNull(),
}, (table) => [
  index("idx_api_rate_limits_expiry").on(table.expiresAtMs),
]);
