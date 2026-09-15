import type { Metadata } from "next";
import { BarChart3, Target } from "lucide-react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";

export const metadata: Metadata = { title: "Community activity", description: "Status of future public AnaCode community statistics." };

export default function LeaderboardPage() {
  return (
    <>
      <SiteHeader />
      <main className="page-main">
        <section className="leaderboard-hero shell">
          <div className="eyebrow"><BarChart3 size={15} /> Community activity</div>
          <h1>Public rankings are not live.</h1>
          <p>AnaCode is focused on the editor, simulator, challenge quality, and trustworthy result checking before adding competitive features.</p>
        </section>
        <section className="shell leaderboard-shell">
          <div className="season-card"><div><Target size={22} /><span>Product status</span></div><strong>A leaderboard will open only when it reflects real participation</strong><p>No seeded accounts, invented activity, or placeholder acceptance rates will be presented as community data.</p></div>
          <div className="leaderboard-table">
            <div className="leaderboard-empty"><BarChart3 size={24} /><strong>No public community statistics yet</strong><span>When enabled, statistics will be derived only from saved, server-verified submissions with clear scoring rules.</span></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
