import Link from "next/link";
import { BrandMark } from "./brand-mark";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div>
          <BrandMark />
          <p>Practice circuit design against simulated specifications.</p>
        </div>
        <div className="footer-links">
          <Link href="/problems">Problems</Link>
          <Link href="/lab">Circuit Lab</Link>
          <Link href="/learn">Learning paths</Link>
          <Link href="/about">Engineering principles</Link>
        </div>
        <p className="footer-note">Simulation is a design aid, not a substitute for datasheets, measurements, or safety review.</p>
      </div>
    </footer>
  );
}
