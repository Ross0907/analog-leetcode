const RATE_SUBJECT_CONTEXT = "anacode-grade-v2:";
const MINIMUM_HMAC_SECRET_BYTES = 32;

export const GRADE_RATE_WINDOW_MS = 60_000;
export const GRADE_RATE_WINDOW_REQUESTS = 30;

export interface RateLimitPreparedStatement {
  bind(...values: unknown[]): RateLimitPreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface RateLimitDatabase {
  prepare(query: string): RateLimitPreparedStatement;
}

export interface FixedWindowInput {
  subjectHash: string;
  nowMs: number;
  windowMs: number;
  maxRequests: number;
}

export interface FixedWindowDecision {
  allowed: boolean;
  requestCount: number;
  retryAfterSeconds: number;
  windowStartedAtMs: number;
}

interface StoredRateLimitBucket {
  windowStartedAtMs: number;
  requestCount: number;
}

const UPSERT_FIXED_WINDOW_SQL = `
INSERT INTO api_rate_limits (
  subject_hash,
  window_started_at_ms,
  request_count,
  expires_at_ms
)
VALUES (?, ?, 1, ?)
ON CONFLICT(subject_hash) DO UPDATE SET
  window_started_at_ms = CASE
    WHEN window_started_at_ms < excluded.window_started_at_ms
      THEN excluded.window_started_at_ms
    ELSE window_started_at_ms
  END,
  request_count = CASE
    WHEN window_started_at_ms < excluded.window_started_at_ms THEN 1
    ELSE request_count + 1
  END,
  expires_at_ms = MAX(expires_at_ms, excluded.expires_at_ms)
RETURNING
  window_started_at_ms AS windowStartedAtMs,
  request_count AS requestCount
`;

const PRUNE_EXPIRED_BUCKETS_SQL = `
DELETE FROM api_rate_limits
WHERE expires_at_ms < ?
`;

/**
 * Wrap the small portion of D1 used by the limiter. Keeping this boundary tiny
 * lets the fixed-window state machine run against an in-memory SQLite D1 fake
 * in regression tests without importing the Cloudflare runtime into Node.
 */
export function adaptD1RateLimitDatabase(database: D1Database): RateLimitDatabase {
  return {
    prepare(query) {
      return adaptD1Statement(database.prepare(query));
    },
  };
}

/**
 * Convert the edge-provided address into a keyed, domain-separated identifier.
 * The raw address is never used as a durable key and the secret is nonextractable.
 */
export async function hmacRateLimitSubject(
  connectingIp: string,
  secretValue: unknown,
): Promise<string> {
  if (
    connectingIp.length === 0 ||
    connectingIp.length > 64 ||
    /[\s,]/u.test(connectingIp) ||
    Array.from(connectingIp).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    throw new Error("Trusted connecting address is invalid.");
  }

  const secret = requireRateLimitHmacSecret(secretValue);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${RATE_SUBJECT_CONTEXT}${connectingIp}`),
  ));
  return Array.from(signature, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function requireRateLimitHmacSecret(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("RATE_LIMIT_HMAC_SECRET is unavailable.");
  }
  if (new TextEncoder().encode(value).byteLength < MINIMUM_HMAC_SECRET_BYTES) {
    throw new Error("RATE_LIMIT_HMAC_SECRET must contain at least 32 bytes.");
  }
  return value;
}

/**
 * Atomically increment one shared D1 bucket and return the resulting decision.
 * The UPSERT is one SQLite statement, so concurrent isolates cannot lose an
 * increment between a separate read and write.
 */
export async function consumeD1FixedWindow(
  database: RateLimitDatabase,
  input: FixedWindowInput,
): Promise<FixedWindowDecision> {
  assertFixedWindowInput(input);
  const windowStartedAtMs = Math.floor(input.nowMs / input.windowMs) * input.windowMs;
  const expiresAtMs = windowStartedAtMs + input.windowMs * 2;
  const bucket = await database
    .prepare(UPSERT_FIXED_WINDOW_SQL)
    .bind(input.subjectHash, windowStartedAtMs, expiresAtMs)
    .first<StoredRateLimitBucket>();

  if (
    !bucket ||
    !Number.isSafeInteger(bucket.windowStartedAtMs) ||
    !Number.isSafeInteger(bucket.requestCount) ||
    bucket.requestCount < 1
  ) {
    throw new Error("D1 rate limiter returned an invalid bucket.");
  }

  return {
    allowed: bucket.requestCount <= input.maxRequests,
    requestCount: bucket.requestCount,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((bucket.windowStartedAtMs + input.windowMs - input.nowMs) / 1_000),
    ),
    windowStartedAtMs: bucket.windowStartedAtMs,
  };
}

export async function pruneExpiredD1RateLimits(
  database: RateLimitDatabase,
  nowMs: number,
): Promise<void> {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error("Rate-limit cleanup time is invalid.");
  }
  await database.prepare(PRUNE_EXPIRED_BUCKETS_SQL).bind(nowMs).run();
}

export function shouldPruneRateLimitBuckets(subjectHash: string): boolean {
  return /^[0-9a-f]{64}$/u.test(subjectHash) && Number.parseInt(subjectHash.slice(0, 2), 16) < 4;
}

function adaptD1Statement(statement: D1PreparedStatement): RateLimitPreparedStatement {
  return {
    bind(...values) {
      return adaptD1Statement(statement.bind(...values));
    },
    first<T>() {
      return statement.first<T>();
    },
    run() {
      return statement.run();
    },
  };
}

function assertFixedWindowInput(input: FixedWindowInput): void {
  if (!/^[0-9a-f]{64}$/u.test(input.subjectHash)) {
    throw new Error("Rate-limit subject must be a 32-byte hexadecimal HMAC.");
  }
  if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0) {
    throw new Error("Rate-limit clock is invalid.");
  }
  if (!Number.isSafeInteger(input.windowMs) || input.windowMs < 1_000) {
    throw new Error("Rate-limit window is invalid.");
  }
  if (!Number.isSafeInteger(input.maxRequests) || input.maxRequests < 1) {
    throw new Error("Rate-limit request cap is invalid.");
  }
}
