import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Braces,
  CheckCircle2,
  Download,
  FileJson2,
  LockKeyhole,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { challengeAuthoringStarterTemplate } from "../../../lib/challenge-authoring";
import { ChallengeTemplateAuthor } from "./challenge-template-author";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";

export const metadata: Metadata = {
  title: "Challenge authoring template",
  description: "Download AnaCode's typed, versioned local challenge-authoring template.",
};

const preview = JSON.stringify(challengeAuthoringStarterTemplate, null, 2);

export default function NewChallengeTemplatePage() {
  return (
    <>
      <SiteHeader active="problems" />
      <main className="page-main">
        <section className="principles-hero shell">
          <Link href="/problems" style={styles.backLink}><ArrowLeft size={15} /> Problem library</Link>
          <div className="eyebrow"><FileJson2 size={15} /> Local authoring workflow</div>
          <h1>Start from a real challenge contract.</h1>
          <p>
            Download a validated JSON template that covers the statement, schematic policy, instruments,
            fixed-topology checks, and hidden-corner intent. It is designed for review in source control—not
            as an executable plugin format.
          </p>
          <div style={styles.heroActions}>
            <a className="button button-primary" href="/api/challenge-template" download>
              <Download size={17} /> Download template v1
            </a>
            <span style={styles.status}><ShieldCheck size={16} /> Strict Zod schema · 64 KB maximum</span>
          </div>
        </section>

        <section className="shell principles-grid" aria-label="Challenge authoring workflow">
          <article>
            <Braces size={24} />
            <h2>1. Describe the engineering task</h2>
            <p>Write the objective and measurable specifications, then declare the allowed components, starter preset, required analysis, and named probes.</p>
          </article>
          <article>
            <LockKeyhole size={24} />
            <h2>2. Select an audited grader</h2>
            <p>The file may select a registered fixed-topology grader, but it cannot contain code, equations, model text, netlists, or simulator directives.</p>
          </article>
          <article>
            <Wrench size={24} />
            <h2>3. Validate and review locally</h2>
            <p>Use <code>parseChallengeAuthoringTemplate</code> in the codebase. Cross-reference checks bind component references, probes, analysis, preset, and grader version.</p>
          </article>
          <article>
            <CheckCircle2 size={24} />
            <h2>4. Implement before release</h2>
            <p>A new topology still needs a reviewed server-side grader, adversarial tests, content review, and registry integration before it can become a published problem.</p>
          </article>
        </section>

        <section className="shell" aria-label="Guided challenge template authoring">
          <ChallengeTemplateAuthor />
        </section>

        <section className="shell" style={styles.contractSection}>
          <div className="section-heading">
            <div className="eyebrow">Versioned JSON</div>
            <h2>Complete divider example</h2>
          </div>
          <div style={styles.notice} role="note">
            <LockKeyhole size={19} />
            <div>
              <strong>This page does not publish or persist challenges.</strong>
              <p style={styles.noticeCopy}>It provides local template tooling only. There is intentionally no upload endpoint or untrusted grader execution path.</p>
            </div>
          </div>
          <details style={styles.previewShell}>
            <summary style={styles.previewSummary}>Inspect the full starter JSON ({new TextEncoder().encode(preview).byteLength.toLocaleString()} bytes)</summary>
            <pre style={styles.preview}><code>{preview}</code></pre>
          </details>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

const styles = {
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 26,
    color: "#596579",
    fontSize: 12,
    fontWeight: 650,
  },
  heroActions: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 18,
    marginTop: 28,
  },
  status: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    color: "#667085",
    fontSize: 11,
    fontWeight: 630,
  },
  contractSection: {
    paddingBottom: 90,
  },
  notice: {
    display: "grid",
    gridTemplateColumns: "24px minmax(0, 1fr)",
    gap: 10,
    marginBottom: 18,
    padding: 16,
    color: "#78500d",
    border: "1px solid #e5cf97",
    borderRadius: 10,
    background: "#fff9e8",
    fontSize: 12,
  },
  noticeCopy: {
    margin: "4px 0 0",
    lineHeight: 1.55,
  },
  previewShell: {
    overflow: "hidden",
    border: "1px solid #d7dde5",
    borderRadius: 12,
    background: "#111b29",
  },
  previewSummary: {
    padding: "16px 18px",
    color: "#d5dde8",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 650,
  },
  preview: {
    maxHeight: 660,
    margin: 0,
    padding: 20,
    overflow: "auto",
    color: "#b8c8db",
    borderTop: "1px solid #29374a",
    background: "#0b1421",
    font: "11px/1.65 var(--font-geist-mono)",
    tabSize: 2,
  },
} satisfies Record<string, CSSProperties>;
