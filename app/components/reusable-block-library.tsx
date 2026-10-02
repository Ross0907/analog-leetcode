'use client';

import { useEffect, useState } from 'react';
import type { CircuitJsApi } from '../../lib/circuitjs';
import { validateCircuitJsText } from '../../lib/circuitjs';
import type { AdvancedCircuitJsApi } from '../../lib/circuitjs-advanced';
import { getChallenge } from '../../lib/challenges';
import styles from './reusable-block-library.module.css';

type SavedBlock = { name: string; circuit: string; challengeSlug?: string; savedAt: string };
const key = 'anacode.native-block-library.v1';
function readBlocks(): SavedBlock[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 2_000_000) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > 32) return [];
    return parsed.filter((value): value is SavedBlock => typeof value?.name === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(value.name) && typeof value?.circuit === 'string' && value.circuit.length <= 64_000 && typeof value.savedAt === 'string');
  } catch { return []; }
}

export default function ReusableBlockLibrary({ api, challengeSlug, onCircuitChange }: { api: CircuitJsApi | null; challengeSlug?: string; onCircuitChange: () => void }) {
  const challenge = challengeSlug ? getChallenge(challengeSlug) : undefined;
  const [blocks, setBlocks] = useState<SavedBlock[]>([]);
  const [name, setName] = useState(challenge?.reusableBlock?.name ?? 'MyBlock');
  const [message, setMessage] = useState('');
  useEffect(() => { let mounted = true; queueMicrotask(() => { if (mounted) setBlocks(readBlocks()); }); return () => { mounted = false; }; }, []);
  function save() {
    try {
      const native = api as AdvancedCircuitJsApi | null;
      if (!native?.exportNativeBlock) throw new Error('Wait for the schematic editor to load.');
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(name)) throw new Error('Start the block name with a letter and use only letters, digits, underscores or hyphens.');
      if (blocks.length >= 32) throw new Error('The library holds 32 blocks. Remove an unused block before saving another.');
      if (blocks.some(block => block.name === name)) throw new Error('Choose a new version name for this block.');
      const circuit = native.exportNativeBlock(name);
      validateCircuitJsText(circuit);
      if (circuit.length > 64_000) throw new Error('This block is too large; select a smaller group of components.');
      const next = [...blocks, { name, circuit, challengeSlug, savedAt: new Date().toISOString() }];
      const serialized = JSON.stringify(next);
      if (serialized.length > 2_000_000) throw new Error('The block library is full. Remove an unused block before saving another.');
      localStorage.setItem(key, serialized); setBlocks(next);
      setMessage(`${name} saved. It is available in other exercises on this browser.`);
      onCircuitChange();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The block could not be saved. Check its labeled ports.'); }
  }
  function insert(block: SavedBlock) {
    try {
      const native = api as AdvancedCircuitJsApi | null;
      if (!native?.insertNativeBlock) throw new Error('Wait for the schematic editor to load.');
      validateCircuitJsText(block.circuit);
      native.importCircuit(block.circuit, true);
      const error = native.insertNativeBlock(block.name); if (error) throw new Error(error);
      setMessage(`Place ${block.name} on the schematic, then wire its labeled terminals.`);
      onCircuitChange();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The block could not be inserted.'); }
  }
  function remove(block: SavedBlock) {
    try { const next = blocks.filter(candidate => candidate !== block); localStorage.setItem(key, JSON.stringify(next)); setBlocks(next); setMessage(`${block.name} removed from this browser’s library.`); }
    catch { setMessage('Browser storage is unavailable.'); }
  }
  return <details className={styles.library}>
    <summary>Reusable circuit blocks <span>{blocks.length}</span></summary>
    <div className={styles.body}>
      {challenge?.prerequisites?.length ? <p>Build first: {challenge.prerequisites.map((slug, index) => <span key={slug}>{index ? ' · ' : ''}<a href={`/problems/${slug}`}>{getChallenge(slug)?.title ?? slug}</a></span>)}</p> : null}
      {challenge?.reusableBlock ? <p>{challenge.reusableBlock.description} Ports: <strong>{challenge.reusableBlock.ports.join(', ')}</strong>.</p> : null}
      {challenge?.recommendedBlocks?.length ? <p>Recommended blocks: {challenge.recommendedBlocks.join(', ')}. Insert your own saved versions and connect the labeled pins.</p> : null}
      <p>Select the components and external node labels that make up your block. Leave test sources and loads outside the selection. With no selection, the whole circuit is saved. Ground symbols stay internal.</p>
      <div className={styles.row}><label>Block name <input aria-label="Reusable block name" value={name} onChange={event => setName(event.target.value)} maxLength={48}/></label><button type="button" disabled={!api} onClick={save}>Save selected circuit as block</button></div>
      {blocks.length ? <ul>{blocks.map(block => <li key={block.name}><strong>{block.name}</strong><button type="button" disabled={!api} onClick={() => insert(block)}>Insert {block.name}</button><button type="button" onClick={() => remove(block)} aria-label={`Remove ${block.name}`}>Remove</button></li>)}</ul> : <p>No saved blocks yet.</p>}
      {message ? <p role="status">{message}</p> : null}
    </div>
  </details>;
}
