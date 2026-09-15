import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, CircleGauge, FlaskConical, LockKeyhole, Waves } from "lucide-react";
import { challenges, getChallenge } from "../../../lib/challenges";
import { BrandMark } from "../../components/brand-mark";
import { ChallengeWorkbench } from "../../components/challenge-workbench";
import { ChallengeSplitWorkspace } from "../../components/challenge-split-workspace";
import { ThemeToggle } from "../../components/theme-toggle";

export function generateStaticParams() {
  return challenges.map((challenge) => ({ slug: challenge.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const challenge = getChallenge(slug);
  return challenge ? { title: challenge.title, description: challenge.summary } : { title: "Problem not found" };
}

export default async function ChallengePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const challenge = getChallenge(slug);
  if (!challenge) notFound();
  const previous = challenges.find((item) => item.id === challenge.id - 1);
  const next = challenges.find((item) => item.id === challenge.id + 1);

  return (
    <main className="challenge-page">
      <header className="challenge-appbar">
        <div className="challenge-appbar-inner">
          <Link href="/" className="challenge-brand" aria-label="AnaCode home">
            <BrandMark compact />
          </Link>
          <span className="challenge-appbar-divider" aria-hidden="true" />
          <div className="challenge-context">
            <Link href="/problems"><ArrowLeft size={15} /> Problems</Link>
            <strong aria-label={`Problem ${challenge.id}`}>{String(challenge.id).padStart(2, "0")}</strong>
          </div>
          <nav className="challenge-nav-buttons" aria-label="Adjacent challenges">
            {previous ? <Link href={`/problems/${previous.slug}`} aria-label={`Previous: ${previous.title}`}><ChevronLeft size={16} /></Link> : <span aria-hidden="true" />}
            {next ? <Link href={`/problems/${next.slug}`} aria-label={`Next: ${next.title}`}><ChevronRight size={16} /></Link> : <span aria-hidden="true" />}
          </nav>
          <div className="challenge-appbar-actions">
            <div className="challenge-quickstats">
              <span className={`difficulty difficulty-${challenge.difficulty.toLowerCase()}`}>{challenge.difficulty}</span>
              <span><CircleGauge size={14} /> {challenge.acceptance !== null && challenge.attempts > 0 ? `${challenge.acceptance}% acceptance` : "New problem"}</span>
              <span><Waves size={14} /> {challenge.analysis}</span>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <ChallengeSplitWorkspace>
        <section className="brief-pane">
          <div className="brief-tabs" role="tablist" aria-label="Problem information">
            <button className="active" role="tab" aria-selected="true"><BookOpen size={15} /> Description</button>
          </div>
          <div className="brief-scroll">
            <div className="problem-kicker">PROBLEM {String(challenge.id).padStart(2, "0")} · {challenge.domain.toUpperCase()}</div>
            <h1>{challenge.title}</h1>
            <p className="problem-summary">{challenge.summary}</p>

            <div className="brief-section">
              <h2>Design objective</h2>
              <p>{challenge.objective}</p>
            </div>

            <div className="brief-section">
              <h2>Constraints</h2>
              <ul className="constraint-list">
                {challenge.constraints.map((constraint) => <li key={constraint}><CheckCircle2 size={16} /> {constraint}</li>)}
              </ul>
            </div>

            <div className="analysis-card">
              <div className="analysis-icon"><FlaskConical size={19} /></div>
              <div><span>Required analysis</span><strong>{challenge.analysis}</strong></div>
              <small>Probe: V({challenge.probe})</small>
            </div>

            <div className="brief-section">
              <h2>Concepts</h2>
              <div className="topic-row large">{challenge.topics.map((topic) => <em key={topic}>{topic}</em>)}</div>
            </div>

            <div className="judge-note">
              <LockKeyhole size={18} />
              <div><strong>{challenge.judge ? "Automated checks available" : "Simulation practice available"}</strong><p>{challenge.judge ? "AnaCode submits the complete, size-bounded CircuitDocument. The server recompiles it, verifies exact connectivity and allowed values, and never trusts generated solver text or browser results." : "This advanced checker is still under benchmark validation; the complete browser instruments remain available for practice."}</p></div>
            </div>
          </div>
        </section>

        <section className="simulator-pane schematic-challenge-pane">
          <ChallengeWorkbench starterNetlist={challenge.starterNetlist} probe={challenge.probe} challengeSlug={challenge.slug} judge={challenge.judge} />
        </section>
      </ChallengeSplitWorkspace>
    </main>
  );
}
