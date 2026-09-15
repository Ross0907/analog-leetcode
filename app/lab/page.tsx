import type { Metadata } from "next";
import { FlaskConical, ShieldCheck, Waves } from "lucide-react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { VisualCircuitLab } from "../components/visual-circuit-lab";

export const metadata: Metadata = {
  title: "Circuit Lab",
  description: "Draw textbook-style schematics and inspect circuit behavior with professional browser instruments.",
};

export default function LabPage() {
  return (
    <>
      <SiteHeader active="lab" />
      <main className="page-main lab-page">
        <section className="lab-hero shell-wide">
          <div>
            <div className="eyebrow"><FlaskConical size={15} /> Free circuit sandbox</div>
            <h1>Your circuit workbench.</h1>
            <p>Build with CircuitJS components, probe any node, and compare waveforms. Use SPICE analysis for operating points, frequency response, and sweeps.</p>
          </div>
          <div className="lab-trust"><span><ShieldCheck size={15} /> CircuitJS1</span><span><Waves size={15} /> ngspice</span></div>
        </section>
        <section className="shell-wide"><VisualCircuitLab /></section>
      </main>
      <SiteFooter />
    </>
  );
}
