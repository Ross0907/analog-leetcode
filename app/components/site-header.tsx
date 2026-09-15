import Link from "next/link";
import { BookOpen, ChevronDown, FlaskConical, Gauge, Menu } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader({ active }: { active?: "problems" | "learn" | "lab" }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand-link" aria-label="AnaCode home">
          <BrandMark />
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <Link className={active === "problems" ? "nav-link active" : "nav-link"} href="/problems">Problems</Link>
          <Link className={active === "learn" ? "nav-link active" : "nav-link"} href="/learn">Learn</Link>
          <Link className={active === "lab" ? "nav-link active" : "nav-link"} href="/lab">Circuit Lab</Link>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <Link className="text-button desktop-only" href="/profile">Sign in</Link>
          <Link className="button button-small button-dark desktop-only" href="/problems/precision-voltage-divider">Start solving</Link>
          <details className="mobile-menu">
            <summary aria-label="Open navigation"><Menu size={20} /></summary>
            <nav aria-label="Mobile navigation">
              <Link href="/problems"><Gauge size={17} /> Problems</Link>
              <Link href="/learn"><BookOpen size={17} /> Learn</Link>
              <Link href="/lab"><FlaskConical size={17} /> Circuit Lab</Link>
              <Link href="/profile">Sign in <ChevronDown size={15} /></Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
