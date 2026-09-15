import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Circle, Gauge, GraduationCap, LockKeyhole } from "lucide-react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";

export const metadata: Metadata = { title: "Learning paths", description: "Structured analog electronics learning paths built around deliberate circuit practice." };

const paths = [
  { title: "Circuit foundations", level: "Begin here", progress: 0, lessons: 12, color: "amber", topics: ["KCL & KVL", "Thevenin equivalents", "RC time constants"] },
  { title: "Practical op-amps", level: "Intermediate", progress: 0, lessons: 15, color: "blue", topics: ["Feedback", "Stability", "Noise & offset"] },
  { title: "Discrete analog", level: "Intermediate", progress: 0, lessons: 18, color: "green", topics: ["Diodes", "BJT biasing", "MOSFET stages"] },
  { title: "Precision & robustness", level: "Advanced", progress: 0, lessons: 14, color: "purple", topics: ["Tolerance corners", "Monte Carlo", "Error budgets"] },
];

export default function LearnPage() {
  return (
    <>
      <SiteHeader active="learn" />
      <main className="page-main">
        <section className="learn-hero shell">
          <div className="eyebrow"><GraduationCap size={15} /> Guided curriculum</div>
          <h1>Build intuition in the right order.</h1>
          <p>Short explanations lead directly into circuits you must make work. Every path mixes analysis, design, debugging, and review.</p>
        </section>
        <section className="shell learning-grid">
          {paths.map((path, index) => (
            <article className={`learning-card ${path.color}`} key={path.title}>
              <div className="learning-index">0{index + 1}</div>
              <div className="learning-meta"><span>{path.level}</span><span>{path.lessons} lessons</span></div>
              <h2>{path.title}</h2>
              <ul>{path.topics.map((topic) => <li key={topic}><Circle size={12} />{topic}</li>)}</ul>
              <div className="path-progress"><span style={{ width: `${path.progress}%` }} /></div>
              <Link href={index === 0 ? "/problems/precision-voltage-divider" : "/problems"}>{index === 0 ? "Start path" : "Preview problems"}<ArrowRight size={16} /></Link>
            </article>
          ))}
        </section>
        <section className="shell learn-callout">
          <Gauge size={26} /><div><h2>Placement diagnostic</h2><p>Solve a short mixed set and get a suggested starting point. No inflated level badges—just evidence from your work.</p></div><button className="button button-dark" type="button" disabled><LockKeyhole size={15} /> Coming after launch</button>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
