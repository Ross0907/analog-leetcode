import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";
import { SiteHeader } from "../components/site-header";
import { VisualCircuitLab } from "../components/visual-circuit-lab";

export const metadata: Metadata = {
  title: "Circuit Lab",
  description: "Draw textbook-style schematics and inspect circuit behavior with professional browser instruments.",
};

export default function LabPage() {
  return (
    <>
      <SiteHeader active="lab" compact />
      <main className="lab-studio">
        <div className="lab-studio-title"><FlaskConical size={15}/><h1>Circuit Lab</h1><span>Draw, probe and measure</span></div>
        <VisualCircuitLab />
      </main>
    </>
  );
}
