import { notFound } from 'next/navigation';
import Link from 'next/link';
import { HDL_CHALLENGES, type HdlChallenge } from '@/lib/hdl-challenges';
import { SiteHeader } from '../../components/site-header';
import { HdlWorkspace } from '../../components/hdl-workspace';
import styles from './workspace-page.module.css';

const playground: HdlChallenge = {
  ...HDL_CHALLENGES[2], slug:'playground', title:'Your digital design playground',
  description:'Experiment with an enabled counter, or replace it with your own design. Edit the stimulus in tb.sv and inspect the resulting VCD waveforms.',
  starter:HDL_CHALLENGES[2].solution,
};
export async function generateMetadata({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  return {title:slug==='playground'?'HDL playground':HDL_CHALLENGES.find(c=>c.slug===slug)?.title??'HDL practice'};
}
export default async function HdlProblemPage({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  const challenge=slug==='playground'?playground:HDL_CHALLENGES.find(c=>c.slug===slug);
  if(!challenge)notFound();
  const {solution: _solution,...clientChallenge}=challenge;
  void _solution;
  const index=HDL_CHALLENGES.findIndex(item=>item.slug===slug), previous=HDL_CHALLENGES[index-1], next=HDL_CHALLENGES[index+1];
  return <div className={styles.shell}><SiteHeader active="hdl" compact/><main className={styles.workbench}><div className={styles.breadcrumb}><span><Link href="/hdl">HDL</Link><span aria-hidden="true"> / </span>{challenge.title}</span><nav aria-label="HDL problem navigation">{previous&&<Link href={`/hdl/${previous.slug}`}>← Previous</Link>}<Link href="/hdl">Problem list</Link>{next&&<Link href={`/hdl/${next.slug}`}>Next →</Link>}<Link href="/hdl/playground">Playground</Link></nav></div><HdlWorkspace key={slug} challenge={clientChallenge} playground={slug==='playground'}/></main></div>;
}
