import Link from 'next/link';
import { Braces, CircuitBoard } from 'lucide-react';
import styles from './practice-track-nav.module.css';

export function PracticeTrackNav({ active }: { active: 'analog' | 'hdl' }) {
  return <nav className={styles.tracks} aria-label="Practice tracks">
    <Link href="/problems" aria-current={active === 'analog' ? 'page' : undefined}><CircuitBoard size={19}/><span>Analog circuits<small>Design, simulate and measure</small></span></Link>
    <Link href="/hdl" aria-current={active === 'hdl' ? 'page' : undefined}><Braces size={19}/><span>Verilog &amp; SystemVerilog<small>Write code, run tests and inspect waveforms</small></span></Link>
  </nav>;
}
