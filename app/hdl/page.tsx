import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Braces, CircuitBoard, Waves } from 'lucide-react';
import { SiteHeader } from '../components/site-header';
import { SiteFooter } from '../components/site-footer';
import { HDL_CHALLENGES } from '@/lib/hdl-challenges';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'HDL practice', description: 'Write Verilog and SystemVerilog, simulate with Icarus, and inspect real logic waveforms.' };
export default function HdlPage() {
  return <><SiteHeader active="hdl"/><main className="page-main shell-wide">
    <section className={styles.hero}><div className="eyebrow"><Braces size={15}/> Digital design practice</div><h1>Write the logic.<br/>See every transition.</h1><p>From your first multiplexer to ADC control logic. Write Verilog or SystemVerilog, run a real testbench, and follow each signal through time.</p><div className={styles.heroActions}><Link className="button button-dark" href="/hdl/word-multiplexer">Start practicing <ArrowUpRight size={16}/></Link><Link className="button" href="/hdl/playground">Open playground</Link></div></section>
    <div className={styles.track}><span><Braces size={16}/>Verilog & SystemVerilog</span><span><CircuitBoard size={16}/>Icarus simulation</span><span><Waves size={16}/>VCD waveforms</span></div>
    <section aria-label="HDL exercises" className={styles.list}>{HDL_CHALLENGES.map(challenge=><Link key={challenge.slug} href={`/hdl/${challenge.slug}`} className={styles.row}><span className={styles.title}>{challenge.title}<small>{challenge.topic}</small></span><span className={styles.level}>{challenge.level}</span><span className={styles.checks}>{challenge.checks.toLocaleString()} checks</span><ArrowUpRight size={18}/></Link>)}</section>
    <section className={styles.resources}><h2>A complete hardware learning loop.</h2><p>Pair converter circuits with digital control exercises. Download an OSS CAD Suite project to simulate locally, synthesize with Yosys, or open traces in GTKWave.</p><p>The coding workflow takes inspiration from <a href="https://www.edaplayground.com/">EDA Playground</a> and <a href="https://hdlbits.01xz.net/wiki/Main_Page">HDLBits</a>. These exercises are original AnaCode problems. The in-browser tools are Icarus Verilog, CodeMirror and VCDrom.</p></section>
  </main><SiteFooter/></>;
}
