"use client";

import { memo, useState } from 'react';
import type { SimulationPayload } from '../../lib/simulator-contract';
import { formatEngineering } from '../../lib/engineering';
import { BrowserOscilloscope, type OscilloscopeDomain } from './browser-oscilloscope';
import { SpectrumAnalyzer } from './spectrum-analyzer';
import { LogicAnalyzer } from './logic-analyzer';
import { TraceAppearanceProvider } from './instrument-state';
import instrumentStyles from './instrument-workspace.module.css';

export const ScopeResult = memo(function ScopeResult({ payload, preferredInstrument = 'scope' }: { payload: SimulationPayload; preferredInstrument?: 'scope' | 'logic' }) {
  return <TraceAppearanceProvider><ResultViews key={preferredInstrument} payload={payload} preferredInstrument={preferredInstrument}/></TraceAppearanceProvider>;
});

function ResultViews({ payload, preferredInstrument }: { payload: SimulationPayload; preferredInstrument: 'scope' | 'logic' }) {
  const [view, setView] = useState<'all' | 'scope' | 'spectrum' | 'logic'>(preferredInstrument);
  if (payload.analysis === "dc") return <div className="op-grid">{payload.operatingPoint.map((point) => <div key={point.name}><span>{point.name}</span><strong>{formatEngineering(point.value, point.unit ?? "V")}</strong></div>)}</div>;
  if (payload.analysis === "ac") {
    const magnitude = payload.traces.filter((trace) => trace.quantity === "magnitude");
    const phase = payload.traces.filter((trace) => trace.quantity === "phase");
    return (
      <div className="scope-host bode-analyzer-stack">
        <BrowserOscilloscope
          key={`magnitude:${magnitude.map((trace) => trace.id).join("|")}`}
          x={payload.x}
          traces={magnitude}
          domain="frequency"
          xScale="log"
          xLabel={payload.xLabel}
          xUnit={payload.xUnit}
          yLabel="Magnitude"
          yUnit="dB"
          title="Bode magnitude"
          height={270}
        />
        <BrowserOscilloscope
          key={`phase:${phase.map((trace) => trace.id).join("|")}`}
          x={payload.x}
          traces={phase}
          domain="frequency"
          xScale="log"
          xLabel={payload.xLabel}
          xUnit={payload.xUnit}
          yLabel="Phase"
          yUnit="°"
          title="Bode phase"
          height={270}
        />
      </div>
    );
  }
  const domain: OscilloscopeDomain = payload.analysis === "dc-sweep" ? "sweep" : "time";
  const title = payload.analysis === "dc-sweep" ? "Curve tracer" : "Oscilloscope";
  const groups = [...new Set(payload.traces.map((trace) => trace.unit))].map((unit) => ({ unit, traces: payload.traces.filter((trace) => trace.unit === unit) }));
  return (
    <div className="scope-host">
      {payload.analysis === "transient" && <div className={instrumentStyles.views} role="group" aria-label="Measurement view">
        {(['all', 'scope', 'spectrum', 'logic'] as const).map((value) => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}>{value === 'all' ? 'Scope + FFT' : value === 'scope' ? 'Oscilloscope' : value === 'spectrum' ? 'Spectrum' : 'Logic analyzer'}</button>)}
      </div>}
      {(payload.analysis !== "transient" || view === 'all' || view === 'scope') && groups.map((group) => <BrowserOscilloscope
        key={`${payload.analysis}:${group.unit}:${group.traces.map((trace) => trace.id).join("|")}`}
        x={payload.x}
        traces={group.traces}
        domain={domain}
        xScale="linear"
        xLabel={payload.xLabel}
        xUnit={payload.xUnit}
        yLabel={group.unit === "A" ? "Current" : payload.yLabel}
        yUnit={group.unit}
        title={`${title}${groups.length > 1 ? ` · ${group.unit === "A" ? "Current" : "Voltage"}` : ""}`}
        height={360}
      />)}
      {payload.analysis === "transient" && (view === 'all' || view === 'spectrum') && <SpectrumAnalyzer time={payload.x} traces={payload.traces} />}
      {payload.analysis === "transient" && view === 'logic' && <LogicAnalyzer payload={payload}/>}
    </div>
  );
}
