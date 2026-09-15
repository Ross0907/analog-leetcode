import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { BarChart3, CheckCircle2, CircuitBoard, LogOut, Target, UserRound } from "lucide-react";
import { requireChatGPTUser, chatGPTSignOutPath } from "../chatgpt-auth";
import { getDb } from "../../db";
import { submissions, userProblemProgress } from "../../db/schema";
import { getChallenge } from "../../lib/challenges";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your profile", description: "Your saved AnaCode progress and design checks." };

export default async function ProfilePage() {
  const user = await requireChatGPTUser("/profile");
  const data = await loadProfile(user.userId);
  const solved = data.progress.filter((item) => item.solvedAt).length;

  return (
    <>
      <SiteHeader />
      <main className="page-main profile-page">
        <section className="profile-hero shell">
          <div className="profile-avatar"><UserRound size={30} /></div>
          <div><span>Signed-in engineer</span><h1>{user.displayName}</h1><p>{user.email}</p></div>
          <Link className="text-button" href={chatGPTSignOutPath("/")}><LogOut size={15} /> Sign out</Link>
        </section>
        <section className="shell profile-stats">
          <div><CheckCircle2 size={20} /><span>Verified solves</span><strong>{solved}</strong></div>
          <div><Target size={20} /><span>Total attempts</span><strong>{data.progress.reduce((sum, item) => sum + item.attemptCount, 0)}</strong></div>
          <div><CircuitBoard size={20} /><span>Problems started</span><strong>{data.progress.length}</strong></div>
          <div><BarChart3 size={20} /><span>Best score</span><strong>{Math.max(0, ...data.progress.map((item) => item.bestScore))}</strong></div>
        </section>
        <section className="shell profile-history">
          <div className="section-heading"><div><div className="eyebrow">Submission history</div><h2>Your latest design checks</h2></div></div>
          {data.recent.length ? data.recent.map((item) => {
            const challenge = getChallenge(item.problemSlug);
            return <Link key={item.id} href={`/problems/${item.problemSlug}`} className="history-row"><span className={item.status === "accepted" ? "history-status accepted" : "history-status rejected"}>{item.status}</span><div><strong>{challenge?.title ?? item.problemSlug}</strong><small>{item.graderVersion} · {item.createdAt}</small></div><b>{item.score}/100</b></Link>;
          }) : <div className="empty-state"><Target size={26} /><h3>No submissions yet</h3><p>Your verified attempts will appear here.</p><Link className="button button-primary" href="/problems/precision-voltage-divider">Solve challenge 01</Link></div>}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

async function loadProfile(userId: string) {
  try {
    const db = getDb();
    const [progress, recent] = await Promise.all([
      db.select().from(userProblemProgress).where(eq(userProblemProgress.userId, userId)),
      db.select().from(submissions).where(eq(submissions.userId, userId)).orderBy(desc(submissions.createdAt)).limit(20),
    ]);
    return { progress, recent };
  } catch {
    return { progress: [], recent: [] };
  }
}
