import { eq } from "drizzle-orm";
import { getUser } from "../../auth";
import { userProblemProgress } from "../../../db/schema";

export async function GET() {
  const user = await getUser();
  const headers = { "cache-control": "private, no-store", vary: "Cookie", "x-content-type-options": "nosniff" };
  if (!user) return Response.json({ authenticated: false, available: true, solvedSlugs: [] }, { headers });
  try {
    const { getDb } = await import("../../../db");
    const progress = await getDb().select({ problemSlug: userProblemProgress.problemSlug, solvedAt: userProblemProgress.solvedAt })
      .from(userProblemProgress).where(eq(userProblemProgress.userId, user.userId));
    const solvedSlugs = progress.filter((item) => item.solvedAt !== null).map((item) => item.problemSlug);
    return Response.json({ authenticated: true, available: true, solvedSlugs }, { headers });
  } catch {
    return Response.json({ authenticated: true, available: false, solvedSlugs: [] }, { headers, status: 503 });
  }
}
