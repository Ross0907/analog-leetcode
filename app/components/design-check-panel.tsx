'use client';
import type { SimulationPayload } from '../../lib/simulator-contract';
import { evaluateDesignChecks, type DesignCheck } from '../../lib/design-checks';
export default function DesignCheckPanel({ checks, result }: { checks: readonly DesignCheck[]; result: SimulationPayload | null }) {
  const outcomes = result ? evaluateDesignChecks(checks, result) : [];
  return <section aria-label="Circuit design checks"><h3>Circuit design checks</h3><p>Run your current schematic to check these targets. These are local practice checks.</p><ul>{checks.map(check => { const outcome = outcomes.find(item => item.id === check.id); return <li key={check.id}><strong>{outcome ? outcome.passed ? 'Pass · ' : 'Needs work · ' : ''}{check.label}</strong> — {outcome?.message ?? `${check.min}–${check.max} ${check.unit}`}</li>; })}</ul></section>;
}
