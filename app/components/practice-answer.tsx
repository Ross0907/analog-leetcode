"use client";

import { useState } from "react";
import { parseEngineeringNumber, formatEngineering } from "../../lib/engineering";
import { markPracticeSolved } from "../../lib/practice-progress";
import type { PracticeSolution } from "../../lib/practice-challenges";

export function PracticeAnswer({ slug, solution }: { slug: string; solution: PracticeSolution }) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<string | null>(null);
  return <section className="practice-answer brief-section" aria-label="Check your calculation">
    <h2>Check your calculation</h2>
    <form onSubmit={(event) => {
      event.preventDefault();
      const numeric = parseEngineeringNumber(answer.replace(/µ/g, "u"));
      if (numeric === null) { setResult("Enter a number using the stated unit, for example 0.002 or 2m."); return; }
      const correct = Math.abs(numeric - solution.value) <= Math.max(1e-12, Math.abs(solution.value) * solution.tolerance);
      setResult(correct ? "Correct. This practice problem is complete on this device." : "That value is outside the accepted tolerance. Check the connections, units, and sign.");
      if (correct) markPracticeSolved(slug);
    }}>
      <label htmlFor={`answer-${slug}`}>{solution.quantity} ({solution.unit})</label>
      <div><input id={`answer-${slug}`} value={answer} onChange={(event) => { setAnswer(event.target.value); setResult(null); }} placeholder="Your answer" autoComplete="off" required maxLength={40} /><button type="submit">Check answer</button></div>
    </form>
    {result && <p role="status">{result}</p>}
    <details><summary>Worked solution</summary><p><strong>{formatEngineering(solution.value, solution.unit)}</strong></p><p>{solution.explanation}</p><p>Accepted tolerance: ±{solution.tolerance * 100}%. This calculation check records local practice progress.</p></details>
  </section>;
}
