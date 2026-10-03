"use client";

import { memo, useState } from 'react';
import type { SimulationPayload } from '../../lib/simulator-contract';
import { BrowserOscilloscope, type OscilloscopeDomain } from './browser-oscilloscope';
import { SpectrumAnalyzer } from './spectrum-analyzer';
import { LogicAnalyzer } from './logic-analyzer';
import { TraceAppearanceProvider, TraceSelectionProvider, InstrumentPresentationProvider, useInstrumentPanel, type CaptureRequest } from './instrument-state';
import { DcReadout } from './dc-readout';
import instrumentStyles from './instrument-workspace.module.css';

export type ScopeResultProps = {
  payload: SimulationPayload;
  preferredInstrument?: 'scope' | 'logic' | 'dc';
  recordDuration?: number;
  onMaximizedChange?: (maximized: boolean) => void;
  selectedTraceId?: string | null;
  onSelectTrace?: (id: string | null) => void;
  onRequestCapture?: (request: CaptureRequest) => void;
  view?: InstrumentView;
  onViewChange?: (view: InstrumentView) => void;
  fftLength?: number;
  onFftLengthChange?: (length: number) => void;
};
export type InstrumentView = 'scope' | 'spectrum' | 'logic' | 'dc' | 'all';

export const ScopeResult = memo(function ScopeResult({ payload, preferredInstrument = 'scope', recordDuration, onMaximizedChange, selectedTraceId, onSelectTrace, ...controls }: ScopeResultProps) {
  return <TraceSelectionProvider selectedTraceId={selectedTraceId} onSelectTrace={onSelectTrace}><TraceAppearanceProvider><InstrumentPresentationProvider key={payload.analysis + ':' + preferredInstrument} onMaximizedChange={onMaximizedChange}><ResultViews payload={payload} preferredInstrument={preferredInstrument} recordDuration={recordDuration} {...controls}/></InstrumentPresentationProvider></TraceAppearanceProvider></TraceSelectionProvider>;
});

function ResultViews({ payload, preferredInstrument, recordDuration, onRequestCapture, view: controlledView, onViewChange, fftLength, onFftLengthChange }: ScopeResultProps) {
  const [localView, setLocalView] = useState<InstrumentView>(preferredInstrument ?? 'scope');
  const view = controlledView ?? localView;
  const panels = useInstrumentPanel('measurement-views');
  if (payload.analysis === "dc") return <DcReadout values={payload.operatingPoint}/>;
  if (payload.analysis === "ac") {
    const magnitude = payload.traces.filter((trace) => trace.quantity === "magnitude");
    const phase = payload.traces.filter((trace) => trace.quantity === "phase");
    return (
      <div className="scope-host bode-analyzer-stack">
        <BrowserOscilloscope
          key={`magnitude:${magnitude.map((trace) => trace.id).join("|")}`}
          instrumentId="bode-magnitude"
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
          instrumentId="bode-phase"
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
        {(['scope', 'spectrum', 'logic', 'dc', 'all'] as const).map((value) => <button type="button" key={value} aria-pressed={view === value} onClick={() => { panels.restore(); setLocalView(value); onViewChange?.(value); }}>{value === 'all' ? 'Scope + FFT' : value === 'scope' ? 'Oscilloscope' : value === 'spectrum' ? 'Spectrum' : value === 'logic' ? 'Logic analyzer' : 'DC readings'}</button>)}
      </div>}
      {(payload.analysis !== "transient" || view === 'all' || view === 'scope') && groups.map((group) => <BrowserOscilloscope
        key={`${payload.analysis}:${group.unit}:${group.traces.map((trace) => trace.id).join("|")}`}
        instrumentId={`${payload.analysis}:${group.unit}`}
        recordDuration={recordDuration}
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
      {payload.analysis === "transient" && (view === 'all' || view === 'spectrum') && <SpectrumAnalyzer time={payload.x} traces={payload.traces} onRequestCapture={onRequestCapture} length={fftLength} onLengthChange={onFftLengthChange}/>}
      {payload.analysis === "transient" && view === 'logic' && <LogicAnalyzer payload={payload} recordDuration={recordDuration}/>}
      {payload.analysis === "transient" && view === 'dc' && <DcReadout sampleTime={payload.x.at(-1)} values={payload.traces.map(trace => ({ id: trace.id, name: trace.name, color: trace.color, value: trace.values.at(-1) ?? NaN, unit: trace.unit }))}/>}
    </div>
  );
}
