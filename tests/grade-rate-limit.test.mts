import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import test from "node:test";
import {
  consumeD1FixedWindow,
  GRADE_RATE_WINDOW_MS,
  GRADE_RATE_WINDOW_REQUESTS,
  hmacRateLimitSubject,
  pruneExpiredD1RateLimits,
  shouldPruneRateLimitBuckets,
  type RateLimitDatabase,
  type RateLimitPreparedStatement,
} from "../lib/grade-rate-limit.server";

const TEST_SECRET = "test-only-rate-limit-key-32-bytes-minimum";

function wrapStatement(statement: StatementSync, values: unknown[] = []): RateLimitPreparedStatement {
  return {
    bind(...nextValues) {
      return wrapStatement(statement, nextValues);
    },
    async first<T>() {
      return (statement.get(...values as SQLInputValue[]) as T | undefined) ?? null;
    },
    async run() {
      return statement.run(...values as SQLInputValue[]);
    },
  };
}

function createRateLimitDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE api_rate_limits (
      subject_hash TEXT PRIMARY KEY NOT NULL,
      window_started_at_ms INTEGER NOT NULL,
      request_count INTEGER NOT NULL,
      expires_at_ms INTEGER NOT NULL
    );
    CREATE INDEX api_rate_limits_expires_at_idx ON api_rate_limits (expires_at_ms);
  `);
  const database: RateLimitDatabase = {
    prepare(query) {
      return wrapStatement(sqlite.prepare(query));
    },
  };
  return { database, sqlite };
}

test("rate-limit subjects are secret-keyed, domain-separated, and validated", async () => {
  const first = await hmacRateLimitSubject("203.0.113.8", TEST_SECRET);
  const replay = await hmacRateLimitSubject("203.0.113.8", TEST_SECRET);
  const anotherAddress = await hmacRateLimitSubject("203.0.113.9", TEST_SECRET);
  const anotherSecret = await hmacRateLimitSubject("203.0.113.8", `${TEST_SECRET}-rotated`);

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, replay);
  assert.notEqual(first, anotherAddress);
  assert.notEqual(first, anotherSecret);
  await assert.rejects(() => hmacRateLimitSubject("203.0.113.8", "too-short"), /at least 32 bytes/);
  await assert.rejects(() => hmacRateLimitSubject("203.0.113.8, 198.51.100.2", TEST_SECRET), /invalid/);
});

test("the shared SQLite window allows exactly the configured request budget", async (context) => {
  const { database, sqlite } = createRateLimitDatabase();
  context.after(() => sqlite.close());
  const subjectHash = await hmacRateLimitSubject("203.0.113.8", TEST_SECRET);
  const nowMs = 1_900_000_000_000;

  for (let request = 1; request <= GRADE_RATE_WINDOW_REQUESTS; request += 1) {
    const decision = await consumeD1FixedWindow(database, {
      subjectHash,
      nowMs,
      windowMs: GRADE_RATE_WINDOW_MS,
      maxRequests: GRADE_RATE_WINDOW_REQUESTS,
    });
    assert.equal(decision.allowed, true, `request ${request} should be allowed`);
    assert.equal(decision.requestCount, request);
  }

  const denied = await consumeD1FixedWindow(database, {
    subjectHash,
    nowMs,
    windowMs: GRADE_RATE_WINDOW_MS,
    maxRequests: GRADE_RATE_WINDOW_REQUESTS,
  });
  assert.equal(denied.allowed, false);
  assert.equal(denied.requestCount, GRADE_RATE_WINDOW_REQUESTS + 1);
  assert.ok(denied.retryAfterSeconds >= 1 && denied.retryAfterSeconds <= 60);
});

test("a new fixed window resets atomically and subjects remain independent", async (context) => {
  const { database, sqlite } = createRateLimitDatabase();
  context.after(() => sqlite.close());
  const firstSubject = await hmacRateLimitSubject("203.0.113.8", TEST_SECRET);
  const secondSubject = await hmacRateLimitSubject("198.51.100.4", TEST_SECRET);
  const nowMs = 1_900_000_000_000;

  const first = await consumeD1FixedWindow(database, {
    subjectHash: firstSubject,
    nowMs,
    windowMs: GRADE_RATE_WINDOW_MS,
    maxRequests: 1,
  });
  const denied = await consumeD1FixedWindow(database, {
    subjectHash: firstSubject,
    nowMs,
    windowMs: GRADE_RATE_WINDOW_MS,
    maxRequests: 1,
  });
  const independent = await consumeD1FixedWindow(database, {
    subjectHash: secondSubject,
    nowMs,
    windowMs: GRADE_RATE_WINDOW_MS,
    maxRequests: 1,
  });
  const reset = await consumeD1FixedWindow(database, {
    subjectHash: firstSubject,
    nowMs: nowMs + GRADE_RATE_WINDOW_MS,
    windowMs: GRADE_RATE_WINDOW_MS,
    maxRequests: 1,
  });

  assert.equal(first.allowed, true);
  assert.equal(denied.allowed, false);
  assert.equal(independent.allowed, true);
  assert.equal(reset.allowed, true);
  assert.equal(reset.requestCount, 1);
  assert.notEqual(reset.windowStartedAtMs, first.windowStartedAtMs);
});

test("expired pseudonymous buckets are pruned without touching live buckets", async (context) => {
  const { database, sqlite } = createRateLimitDatabase();
  context.after(() => sqlite.close());
  sqlite.prepare("INSERT INTO api_rate_limits VALUES (?, ?, ?, ?)").run("a".repeat(64), 1, 1, 100);
  sqlite.prepare("INSERT INTO api_rate_limits VALUES (?, ?, ?, ?)").run("b".repeat(64), 1, 1, 500);

  await pruneExpiredD1RateLimits(database, 200);
  const rows = sqlite.prepare("SELECT subject_hash FROM api_rate_limits ORDER BY subject_hash").all();
  assert.deepEqual(rows.map((row) => row.subject_hash), ["b".repeat(64)]);
});

test("invalid limiter state is rejected before any database query", async () => {
  const neverDatabase: RateLimitDatabase = {
    prepare() {
      throw new Error("database should not be reached");
    },
  };
  await assert.rejects(() => consumeD1FixedWindow(neverDatabase, {
    subjectHash: "not-an-hmac",
    nowMs: 0,
    windowMs: GRADE_RATE_WINDOW_MS,
    maxRequests: GRADE_RATE_WINDOW_REQUESTS,
  }), /32-byte hexadecimal HMAC/);
  assert.equal(typeof shouldPruneRateLimitBuckets("0".repeat(64)), "boolean");
  assert.equal(shouldPruneRateLimitBuckets("invalid"), false);
});
