import { and, eq, sql } from "drizzle-orm";
import { getUser } from "../../auth";
import { submissions, userProblemProgress, users } from "../../../db/schema";
import {
  adaptD1RateLimitDatabase,
  consumeD1FixedWindow,
  GRADE_RATE_WINDOW_MS,
  GRADE_RATE_WINDOW_REQUESTS,
  hmacRateLimitSubject,
  pruneExpiredD1RateLimits,
  shouldPruneRateLimitBuckets,
} from "../../../lib/grade-rate-limit.server";
import { gradeRequestSchema, gradeResultSchema, gradeSolution, type GradeResult } from "../../../lib/grader.server";

const MAX_BODY_BYTES = 8_192;
const MAX_RATE_BUCKETS = 4_096;
const rateBuckets = new Map<string, { startedAt: number; count: number }>();

export async function POST(request: Request) {
  const requestStarted = performance.now();
  const rejection = validateWriteRequest(request);
  if (rejection) return rejection;
  const rateLimitResponse = await enforceRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  let bodyText: string;
  try {
    const boundedBody = await readBoundedText(request);
    if (boundedBody === null) return json({ error: "Request body exceeds 8 KB." }, 413);
    bodyText = boundedBody;
  } catch {
    return json({ error: "Request body must be valid UTF-8." }, 400);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }
  const parsed = gradeRequestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Submission schema is invalid." }, 400);

  const result = gradeSolution(parsed.data);
  const runtimeMs = Math.max(0, Math.round(performance.now() - requestStarted));
  const user = await getUser();
  let persisted = false;

  if (user) {
    const solutionJson = JSON.stringify({ circuitDocument: parsed.data.circuitDocument });
    try {
      // Keep the Cloudflare-only `cloudflare:workers` binding out of the
      // anonymous grading path and portable integration tests.
      const { getDb } = await import("../../../db");
      const db = getDb();
      const existing = await findExistingSubmission(db, user.userId, parsed.data.idempotencyKey);
      if (existing) {
        if (!sameSubmission(existing, parsed.data.problemSlug, parsed.data.problemVersion, solutionJson)) {
          return json({ error: "That idempotency key already belongs to a different submission." }, 409);
        }
        return json({ ...storedGrade(existing.resultJson, result), persisted: true, replayed: true }, 200);
      }

      const userWrite = db.insert(users).values({
        id: user.userId,
        email: user.email,
        displayName: user.displayName.slice(0, 120),
      }).onConflictDoUpdate({
        target: users.id,
        set: { email: user.email, displayName: user.displayName.slice(0, 120), lastSeenAt: sql`CURRENT_TIMESTAMP` },
      });

      const submissionWrite = db.insert(submissions).values({
        id: crypto.randomUUID(),
        userId: user.userId,
        problemSlug: parsed.data.problemSlug,
        problemVersion: parsed.data.problemVersion,
        status: result.passed ? "accepted" : "rejected",
        solutionJson,
        resultJson: JSON.stringify(result),
        score: result.score,
        runtimeMs,
        graderVersion: result.graderVersion,
        idempotencyKey: parsed.data.idempotencyKey,
      });

      const progressWrite = db.insert(userProblemProgress).values({
        userId: user.userId,
        problemSlug: parsed.data.problemSlug,
        bestScore: result.score,
        attemptCount: 1,
        solvedAt: result.passed ? sql`CURRENT_TIMESTAMP` : null,
      }).onConflictDoUpdate({
        target: [userProblemProgress.userId, userProblemProgress.problemSlug],
        set: {
          bestScore: sql`MAX(${userProblemProgress.bestScore}, excluded.best_score)`,
          attemptCount: sql`${userProblemProgress.attemptCount} + 1`,
          solvedAt: result.passed ? sql`COALESCE(${userProblemProgress.solvedAt}, CURRENT_TIMESTAMP)` : userProblemProgress.solvedAt,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });

      // D1 batches are transactional. Submission and aggregate progress either
      // commit together or neither is applied.
      await db.batch([userWrite, submissionWrite, progressWrite]);
      persisted = true;
    } catch (error) {
      // A concurrent retry can win the unique idempotency-key race. Replay it
      // when it is the same request; never increment progress twice.
      try {
        const { getDb } = await import("../../../db");
        const raced = await findExistingSubmission(getDb(), user.userId, parsed.data.idempotencyKey);
        if (raced) {
          if (!sameSubmission(raced, parsed.data.problemSlug, parsed.data.problemVersion, solutionJson)) {
            return json({ error: "That idempotency key already belongs to a different submission." }, 409);
          }
          return json({ ...storedGrade(raced.resultJson, result), persisted: true, replayed: true }, 200);
        }
      } catch {
        // Fall through to a non-persisted practice result. Do not log user data.
      }
      console.error("grade persistence failed", error instanceof Error ? error.name : "UnknownError");
    }
  }

  return json({ ...result, persisted }, 200);
}

function validateWriteRequest(request: Request): Response | null {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader && !/^\d+$/.test(contentLengthHeader)) return json({ error: "Content-Length is invalid." }, 400);
  const contentLength = Number(contentLengthHeader ?? "0");
  if (contentLength > MAX_BODY_BYTES) return json({ error: "Request body exceeds 8 KB." }, 413);
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return json({ error: "Content-Type must be application/json." }, 415);
  const contentEncoding = request.headers.get("content-encoding")?.trim().toLowerCase();
  if (contentEncoding && contentEncoding !== "identity") return json({ error: "Compressed request bodies are not accepted." }, 415);
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin !== url.origin) return json({ error: "A same-origin Origin header is required." }, 403);
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return json({ error: "Cross-site submissions are not allowed." }, 403);
  return null;
}

async function readBoundedText(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel("body limit exceeded");
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function enforceRateLimit(request: Request): Promise<Response | null> {
  // Cloudflare strips and supplies this header at the trusted edge. Local
  // previews do not have it and retain a bounded in-process fallback. A header
  // that is present takes the edge path and must have both D1 and a secret.
  const connectingIp = request.headers.get("cf-connecting-ip");
  if (connectingIp === null) return enforceSoftRateLimit("local-preview");

  try {
    const { env } = await import("cloudflare:workers");
    if (!env.DB) throw new Error("D1 rate-limit binding is unavailable.");

    const now = Date.now();
    const subjectHash = await hmacRateLimitSubject(connectingIp, env.RATE_LIMIT_HMAC_SECRET);
    const softLimit = enforceSoftRateLimit(subjectHash);
    if (softLimit) return softLimit;

    const database = adaptD1RateLimitDatabase(env.DB);
    const decision = await consumeD1FixedWindow(database, {
      subjectHash,
      nowMs: now,
      windowMs: GRADE_RATE_WINDOW_MS,
      maxRequests: GRADE_RATE_WINDOW_REQUESTS,
    });

    // Deterministic sampling avoids a cleanup query on every request while
    // bounding retention of expired pseudonymous buckets.
    if (shouldPruneRateLimitBuckets(subjectHash)) {
      await pruneExpiredD1RateLimits(database, now);
    }

    if (decision.allowed) return null;
    return json(
      { error: "Too many grading requests. Try again shortly." },
      429,
      { "retry-after": String(decision.retryAfterSeconds) },
    );
  } catch (error) {
    console.error("grade rate limiter unavailable", error instanceof Error ? error.name : "UnknownError");
    return json(
      { error: "Grading is temporarily unavailable. Try again shortly." },
      503,
      { "retry-after": "30" },
    );
  }
}

function enforceSoftRateLimit(subject: string): Response | null {
  const now = Date.now();
  const current = rateBuckets.get(subject);
  if (!current || now - current.startedAt >= GRADE_RATE_WINDOW_MS) {
    if (!current && rateBuckets.size >= MAX_RATE_BUCKETS) evictRateBucket(now);
    rateBuckets.set(subject, { startedAt: now, count: 1 });
    return null;
  }
  current.count += 1;
  if (current.count <= GRADE_RATE_WINDOW_REQUESTS) return null;
  const retryAfter = Math.max(1, Math.ceil((GRADE_RATE_WINDOW_MS - (now - current.startedAt)) / 1_000));
  return json({ error: "Too many grading requests. Try again shortly." }, 429, { "retry-after": String(retryAfter) });
}

function evictRateBucket(now: number) {
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.startedAt >= GRADE_RATE_WINDOW_MS) rateBuckets.delete(key);
  }
  if (rateBuckets.size >= MAX_RATE_BUCKETS) {
    const oldest = rateBuckets.keys().next().value as string | undefined;
    if (oldest) rateBuckets.delete(oldest);
  }
}

function json(payload: unknown, status: number, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(payload, { status, headers });
}

type GradeDatabase = ReturnType<typeof import("../../../db")["getDb"]>;

async function findExistingSubmission(db: GradeDatabase, userId: string, idempotencyKey: string) {
  return (await db.select({
    problemSlug: submissions.problemSlug,
    problemVersion: submissions.problemVersion,
    solutionJson: submissions.solutionJson,
    resultJson: submissions.resultJson,
  }).from(submissions).where(and(
    eq(submissions.userId, userId),
    eq(submissions.idempotencyKey, idempotencyKey),
  )).limit(1))[0];
}

function sameSubmission(
  existing: NonNullable<Awaited<ReturnType<typeof findExistingSubmission>>>,
  problemSlug: string,
  problemVersion: number,
  solutionJson: string,
) {
  return existing.problemSlug === problemSlug &&
    existing.problemVersion === problemVersion &&
    existing.solutionJson === solutionJson;
}

function storedGrade(resultJson: string, fallback: GradeResult): GradeResult {
  try {
    const parsed = gradeResultSchema.safeParse(JSON.parse(resultJson));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}
