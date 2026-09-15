import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  CircuitBoard,
  FlaskConical,
  LockKeyhole,
  Play,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  Waves,
} from "lucide-react";
import { SiteHeader } from "./components/site-header";
import { SiteFooter } from "./components/site-footer";
import { SchematicGlyph } from "./components/schematic-symbol";
import { liveChallenges } from "../lib/challenges";

export const metadata: Metadata = {
  description: "Solve analog electronics challenges with bounded browser simulation and server-verified engineering constraints.",
};

const featured = liveChallenges.slice(0, 4);

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero shell">
          <div className="hero-copy">
            <div className="eyebrow"><span className="live-dot" /> Interactive electronics practice</div>
            <h1>Learn circuit design by <span>making it pass.</span></h1>
            <p className="hero-lede">Start with real analog briefs, simulate instantly, then submit component choices against server-side supply and tolerance corners.</p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/problems/precision-voltage-divider">Solve your first circuit <ArrowRight size={18} /></Link>
              <Link className="button button-quiet" href="/problems">Browse problems</Link>
            </div>
            <div className="trust-row" aria-label="Platform highlights">
              <span><Check size={15} /> No install required</span>
              <span><Check size={15} /> Real engineering units</span>
              <span><Check size={15} /> Free practice lab</span>
            </div>
          </div>

          <div className="hero-workbench" aria-label="Example voltage divider challenge">
            <div className="workbench-topbar">
              <div className="window-dots" aria-hidden="true"><i /><i /><i /></div>
              <span>01 · Precision voltage divider</span>
              <span className="status-pill"><span /> Sim ready</span>
            </div>
            <div className="hero-workbench-body">
              <div className="hero-circuit-panel">
                <div className="panel-label">Schematic</div>
                <div className="divider-circuit" aria-hidden="true">
                  <span className="rail rail-top" />
                  <span className="source-node">5V</span>
                  <span className="hero-resistor hero-resistor-one"><SchematicGlyph kind="resistor" /><span>R1 <b>10 kΩ</b></span></span>
                  <span className="circuit-node node-output" />
                  <span className="output-label">VOUT <b>2.500 V</b></span>
                  <span className="hero-resistor hero-resistor-two"><SchematicGlyph kind="resistor" /><span>R2 <b>10 kΩ</b></span></span>
                  <span className="rail rail-bottom" />
                  <span className="ground-symbol">⏚</span>
                </div>
              </div>
              <div className="hero-results-panel">
                <div className="panel-label">Hidden checks</div>
                <div className="check-line"><span className="check-icon"><Check size={13} /></span><span>Nominal ratio</span><b>PASS</b></div>
                <div className="check-line"><span className="check-icon"><Check size={13} /></span><span>Supply corners</span><b>PASS</b></div>
                <div className="check-line"><span className="check-icon"><Check size={13} /></span><span>Current budget</span><b>PASS</b></div>
                <div className="accept-card">
                  <div><Sparkles size={16} /> Accepted</div>
                  <strong>100<span>/100</span></strong>
                </div>
              </div>
            </div>
            <div className="hero-workbench-footer">
              <span>Visual schematic workspace</span>
              <span><Play size={13} fill="currentColor" /> Run 12 ms</span>
            </div>
          </div>
        </section>

        <section className="proof-strip">
          <div className="shell proof-grid">
            <div><strong>9</strong><span>curated launch problems</span></div>
            <div><strong>4</strong><span>analysis modes</span></div>
            <div><strong>3</strong><span>server-checked problems</span></div>
            <div><strong>25</strong><span>standard schematic symbols</span></div>
          </div>
        </section>

        <section className="section shell">
          <div className="section-heading split-heading">
            <div>
              <div className="eyebrow">A better practice loop</div>
              <h2>Specifications, not multiple choice.</h2>
            </div>
            <p>AnaCode turns the messy, iterative work of circuit design into a deliberate practice loop—with fast feedback and honest constraints.</p>
          </div>
          <div className="feature-grid">
            <article className="feature-card feature-card-large">
              <div className="feature-icon amber"><CircuitBoard size={22} /></div>
              <span className="step-number">01</span>
              <h3>Read the design brief</h3>
              <p>Every problem names the operating envelope, measurable targets, component limits, and failure conditions.</p>
              <div className="spec-sheet">
                <span>Gain</span><b>−10 V/V ±1%</b>
                <span>Input Z</span><b>≥ 8 kΩ</b>
                <span>Output swing</span><b>≥ 8 Vpp</b>
              </div>
            </article>
            <article className="feature-card">
              <div className="feature-icon blue"><Waves size={22} /></div>
              <span className="step-number">02</span>
              <h3>Simulate in the browser</h3>
              <p>Run operating-point, sweep, transient, and AC analysis without leaving the workspace.</p>
              <div className="mini-wave" aria-hidden="true">
                {Array.from({ length: 32 }, (_, index) => <i key={index} style={{ height: `${16 + Math.sin(index / 3) * 11 + index * 0.4}px` }} />)}
              </div>
            </article>
            <article className="feature-card">
              <div className="feature-icon green"><Target size={22} /></div>
              <span className="step-number">03</span>
              <h3>Face the hidden corners</h3>
              <p>The server judge recomputes trusted metrics across versioned cases that are never accepted from the browser.</p>
              <div className="corner-chips"><span>VDD −10%</span><span>R −0.1%</span><span>C +0.5%</span><span>Worst case</span></div>
            </article>
          </div>
        </section>

        <section className="section section-tint">
          <div className="shell">
            <div className="section-heading row-heading">
              <div>
                <div className="eyebrow">Problem set · Launch collection</div>
                <h2>From first principles to real tradeoffs.</h2>
              </div>
              <Link className="inline-link" href="/problems">View all problems <ArrowRight size={16} /></Link>
            </div>
            <div className="problem-preview-list">
              {featured.map((challenge) => (
                <Link href={`/problems/${challenge.slug}`} className="problem-preview" key={challenge.slug}>
                  <span className="problem-number">{String(challenge.id).padStart(2, "0")}</span>
                  <div className="problem-main"><strong>{challenge.title}</strong><span>{challenge.summary}</span></div>
                  <span className={`difficulty difficulty-${challenge.difficulty.toLowerCase()}`}>{challenge.difficulty}</span>
                  <span className="problem-domain">{challenge.domain}</span>
                  <span className="acceptance">{challenge.acceptance !== null && challenge.attempts > 0 ? `${challenge.acceptance}%` : challenge.judge ? "Checked" : "Practice"}</span>
                  <ChevronRight className="problem-arrow" size={18} />
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="section shell">
          <div className="assurance-grid">
            <div className="assurance-copy">
              <div className="eyebrow">Built for serious practice</div>
              <h2>Fast feedback. Defensible results.</h2>
              <p>The interactive workbench helps you iterate; supported problems submit a strict circuit document that server-side checkers recompile and verify for both topology and values.</p>
              <Link className="inline-link" href="/about">Read our engineering principles <ArrowRight size={16} /></Link>
            </div>
            <div className="assurance-list">
              <div><ShieldCheck size={21} /><span><b>Server-authoritative grading</b>Client waveforms never decide acceptance or score.</span></div>
              <div><LockKeyhole size={21} /><span><b>Constrained submissions</b>No shell, file, library, or executable directives enter the judge.</span></div>
              <div><TimerReset size={21} /><span><b>Bounded simulations</b>Input size, topology, iterations, and runtime are limited.</span></div>
              <div><BarChart3 size={21} /><span><b>Versioned evidence</b>Every result records problem and grader versions.</span></div>
            </div>
          </div>
        </section>

        <section className="cta-section">
          <div className="shell cta-inner">
            <div className="cta-art" aria-hidden="true"><FlaskConical size={38} /><span /><span /><span /></div>
            <div><div className="eyebrow light">Your next circuit starts here</div><h2>Stop memorizing. Start designing.</h2></div>
            <Link className="button button-light" href="/problems/precision-voltage-divider">Open challenge 01 <ArrowRight size={18} /></Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
