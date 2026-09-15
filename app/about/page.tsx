import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Boxes, Scale, ShieldCheck } from "lucide-react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";

export const metadata: Metadata = { title: "Engineering principles", description: "How AnaCode approaches simulation fidelity, fair verification, safety, and honest product claims." };

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main className="page-main">
        <section className="principles-hero shell"><div className="eyebrow"><BadgeCheck size={15} /> Engineering principles</div><h1>Trust is a feature we have to earn.</h1><p>AnaCode is being built as an engineering tool: explicit limits, reproducible evidence, and no claims the system cannot support.</p></section>
        <section className="shell principles-grid">
          <article><ShieldCheck size={24} /><h2>The server verifies results</h2><p>Browser simulations provide immediate learning feedback. Supported problems submit only constrained design parameters, which are recomputed across versioned server-side cases.</p></article>
          <article><Boxes size={24} /><h2>Simulation has boundaries</h2><p>Every engine and model has a validity envelope. The lab’s visual standard is inspired by <a href="https://analog-canvas.tokenzhang.com/editor" target="_blank" rel="noreferrer">Analog Canvas</a>, but its hosted code and exports are not trusted or embedded.</p></article>
          <article><Scale size={24} /><h2>Security is layered</h2><p>We minimize inputs, isolate expensive work, bound resources, preserve ownership checks, pin dependencies, and keep patching. No honest team promises “unexploitable.”</p></article>
          <article><BadgeCheck size={24} /><h2>Novelty without hype</h2><p>Related circuit education and challenge products already exist. Our focus is the underserved intersection: analog-first design, textbook schematics, hidden engineering corners, and a polished practice loop.</p></article>
        </section>
        <section className="shell about-cta"><h2>Put the principles to work.</h2><Link className="button button-primary" href="/problems/precision-voltage-divider">Solve challenge 01 <ArrowRight size={17} /></Link></section>
      </main>
      <SiteFooter />
    </>
  );
}
