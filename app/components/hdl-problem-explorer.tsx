"use client";
import Link from 'next/link';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowUpRight, CheckCircle2, Circle, Search } from 'lucide-react';
import type { HdlChallenge } from '@/lib/hdl-challenges';
import { HDL_PROGRESS_KEY, parseHdlProgress } from '@/lib/hdl-practice';
import styles from '../hdl/page.module.css';

const subscribe = (listener: () => void) => { window.addEventListener('storage',listener);window.addEventListener('anacode-hdl-progress',listener);return()=>{window.removeEventListener('storage',listener);window.removeEventListener('anacode-hdl-progress',listener);}; };
const snapshot = () => { try { return localStorage.getItem(HDL_PROGRESS_KEY) ?? ''; } catch { return ''; } };
type Problem = Pick<HdlChallenge,'slug'|'title'|'topic'|'level'|'checks'|'description'>;
export function HdlProblemExplorer({ problems }: { problems: Problem[] }) {
  const [query,setQuery]=useState(''), [level,setLevel]=useState('All'), [topic,setTopic]=useState('All'), [status,setStatus]=useState('All');
  const stored=useSyncExternalStore(subscribe,snapshot,()=>''), progress=useMemo(()=>parseHdlProgress(stored),[stored]);
  const filtered=problems.filter(problem=>(level==='All'||problem.level===level)&&(topic==='All'||problem.topic===topic)&&(status==='All'||(status==='Passed'?progress[problem.slug]?.passed:!progress[problem.slug]?.passed))&&`${problem.title} ${problem.topic} ${problem.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section aria-label="HDL exercises">
    <div className={styles.filters}>
      <label className={styles.search}><Search size={16}/><input aria-label="Search HDL problems" placeholder="Search problems or topics" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <select aria-label="HDL difficulty" value={level} onChange={event=>setLevel(event.target.value)}>{['All','Easy','Medium','Hard'].map(value=><option key={value} value={value}>{value==='All'?'All difficulties':value}</option>)}</select>
      <select aria-label="HDL topic" value={topic} onChange={event=>setTopic(event.target.value)}>{['All',...new Set(problems.map(problem=>problem.topic))].map(value=><option key={value} value={value}>{value==='All'?'All topics':value}</option>)}</select>
      <select aria-label="HDL status" value={status} onChange={event=>setStatus(event.target.value)}>{['All','Passed','Unsolved'].map(value=><option key={value} value={value}>{value==='All'?'All statuses':value}</option>)}</select>
    </div>
    <p className={styles.count}>{filtered.length} problems · {problems.filter(problem=>progress[problem.slug]?.passed).length} passed in this browser <span>Local practice progress</span></p>
    <div className={styles.list}>{filtered.map(problem=><Link key={problem.slug} href={`/hdl/${problem.slug}`} className={styles.row}>
      <span className={styles.progress} aria-label={progress[problem.slug]?.passed?'Passed in this browser':'Not passed'}>{progress[problem.slug]?.passed?<CheckCircle2 size={18}/>:<Circle size={18}/>}</span>
      <span className={styles.title}>{problem.title}<small>{problem.topic}</small></span><span className={styles.level} data-level={problem.level}>{problem.level}</span><span className={styles.checks}>{problem.checks.toLocaleString()} checks</span><ArrowUpRight size={18}/>
    </Link>)}{filtered.length===0&&<p className={styles.noResults}>No matching problems. Try another topic or search.</p>}</div>
  </section>;
}
