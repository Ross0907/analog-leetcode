import type { Metadata } from "next";
import Link from "next/link";
import { CircuitBoard, FileJson2, ShieldCheck } from "lucide-react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { ProblemExplorer } from "../components/problem-explorer";

export const metadata: Metadata = {
  title: "Analog circuit problems",
  description: "Practice DC, AC, semiconductor, op-amp, and mixed-signal circuit design.",
};

export default function ProblemsPage() {
  return (
    <>
      <SiteHeader active="problems" />
      <main className="page-main">
        <section className="catalog-hero shell">
          <div>
            <div className="eyebrow"><CircuitBoard size={15} /> Challenge library</div>
            <h1>Analog circuit problems</h1>
            <p>Design to a specification, inspect the waveforms, then submit against cases you have not seen.</p>
          </div>
          <div className="catalog-legend">
            <span><span className="ranked-dot" /> Automated checks available</span>
            <span><ShieldCheck size={15} /> Server verified</span>
            <Link className="button button-small button-dark" href="/problems/new"><FileJson2 size={15} /> Author a template</Link>
          </div>
        </section>
        <section className="shell catalog-section">
          <ProblemExplorer />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
