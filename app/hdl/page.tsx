import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Braces, CircuitBoard, Waves } from 'lucide-react';
import { SiteHeader } from '../components/site-header';
import { SiteFooter } from '../components/site-footer';
import { PracticeTrackNav } from '../components/practice-track-nav';
import { HdlProblemExplorer } from '../components/hdl-problem-explorer';
import { HDL_CHALLENGES } from '@/lib/hdl-challenges';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'Verilog & SystemVerilog problems', description: 'Practice digital design: write Verilog or SystemVerilog, run real Icarus testbenches and inspect logic waveforms.' };
export default function HdlPage() {
  const problems=HDL_CHALLENGES.map(({slug,title,topic,level,checks,description})=>({slug,title,topic,level,checks,description}));
  return <><SiteHeader active="hdl"/><main className="page-main shell-wide">
    <PracticeTrackNav active="hdl"/>
    <section className={styles.hero}><div className="eyebrow"><Braces size={15}/> HDL problem library</div><h1>Verilog &amp; SystemVerilog practice</h1><p>Read a hardware specification, write the module, then submit it to real testbench checks. Debug a failure in the console and follow the actual signals in the waveform viewer.</p><div className={styles.heroActions}><Link className="button button-dark" href="/hdl/word-multiplexer">Solve your first HDL problem <ArrowUpRight size={16}/></Link><Link className="button" href="/hdl/playground">Open HDL playground</Link></div></section>
    <div className={styles.track}><span><Braces size={16}/>Code and test cases</span><span><CircuitBoard size={16}/>Real Icarus simulation</span><span><Waves size={16}/>Interactive VCD waveforms</span></div>
    <HdlProblemExplorer problems={problems}/>
    <section className={styles.resources}><h2>From logic fundamentals to converter control.</h2><p>Start with combinational circuits, add clocked state, then build a flash encoder, PWM DAC or SAR controller. Each problem includes an editable testbench, supplied checks and a local draft. Submit uses the supplied tests; these are local practice results, not server-verified rankings.</p><p>The workflow takes inspiration from <a href="https://hdlbits.01xz.net/wiki/Main_Page">HDLBits</a> and <a href="https://www.edaplayground.com/">EDA Playground</a>. These are original AnaCode exercises, using Icarus Verilog, CodeMirror and <a href="https://github.com/wavedrom/vcdrom">VCDrom</a>. Download any project to continue in OSS CAD Suite.</p></section>
  </main><SiteFooter/></>;
}
