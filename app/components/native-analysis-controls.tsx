"use client";

import { useMemo, useState } from 'react';
import { circuitJsAnalysisOptions, type NativeAnalysisSettings, type NativeSourceOverride } from '../../lib/circuitjs-analysis';
import type { CircuitJsApi, CircuitJsElement } from '../../lib/circuitjs';
import { parseEngineeringNumber } from '../../lib/engineering';
import { stimulusPoints } from '../../lib/native-stimulus';
import styles from './circuitjs-workbench.module.css';

// Foreign native objects have stable identity but no permanent display ID.
// Weak keys keep each source's form attached through index changes and release
// the old form identity when its circuit is replaced.
const sourceFormKeys = new WeakMap<CircuitJsElement, number>();
let nextSourceFormKey = 0;
function sourceFormKey(element: CircuitJsElement) {
  let key = sourceFormKeys.get(element);
  if (key === undefined) { key = ++nextSourceFormKey; sourceFormKeys.set(element, key); }
  return key;
}

export function NativeAnalysisControls({ api, settings, onChange, onApplySource, section = 'all' }: {
  section?: 'all' | 'analysis' | 'sources';
  api: CircuitJsApi | null; settings: NativeAnalysisSettings; onChange: (settings: NativeAnalysisSettings) => void;
  onApplySource: (index: number, source: NativeSourceOverride | undefined, expectedElement?: CircuitJsElement) => void;
}) {
  const options = api ? circuitJsAnalysisOptions(api) : { sources: [], models: [] };
  const nativeElements = api?.getElements() ?? [];
  const [sourceElement, setSourceElement] = useState<CircuitJsElement | null>(null);
  // A paused native edit can change indices before its analysis callback remaps
  // settings. Retain each published settings map's original element association.
  const sourceOverrides = useMemo(() => new Map(Object.entries(settings.sourceOverrides ?? {}).flatMap(([index, source]) => {
    const element = api?.getElements()[Number(index)];
    return element ? [[element, source] as const] : [];
  })), [api, settings.sourceOverrides]);
  const [sweepOpen, setSweepOpen] = useState(section === 'all');
  const waveformSources = options.sources.filter(source => source.nativeType !== 'CurrentElm');
  const selected = sourceElement ? waveformSources.find(source => nativeElements[source.index] === sourceElement) : waveformSources[0];
  const selectedElement = selected ? nativeElements[selected.index] : undefined;
  const update = (patch: Partial<NativeAnalysisSettings>) => onChange({ ...settings, ...patch });
  return <div className={`${styles.analysisSettings} ${section === 'analysis' ? styles.quickAnalysis : ''}`}>
    {section !== 'sources' && <>
    <label>Analysis<select aria-label="Schematic analysis type" value={settings.type} onChange={event => { update({ type: event.target.value as NativeAnalysisSettings['type'] }); setSweepOpen(true); }}>
      <option value="transient">Transient waveform</option><option value="operating-point">DC operating point</option><option value="ac-sweep">AC frequency response</option><option value="dc-sweep">DC source sweep</option>
    </select></label>
    {settings.type === 'ac-sweep' && <details className={styles.sweepSettings} open={sweepOpen} onToggle={event => setSweepOpen(event.currentTarget.open)}><summary>AC sweep settings</summary><div className={styles.sweepFields}>
      <label>Excitation<select aria-label="AC excitation source" value={settings.acSource ?? options.sources[0]?.index ?? ''} onChange={event => update({ acSource: Number(event.target.value) })}>{options.sources.map(source => <option key={source.index} value={source.index}>{source.label}</option>)}</select></label>
      <label>Start (Hz)<input aria-label="AC start frequency" type="number" min="0.001" value={settings.startHz} onChange={event => update({ startHz: Number(event.target.value) })}/></label>
      <label>Stop (Hz)<input aria-label="AC stop frequency" type="number" min="0.001" value={settings.stopHz} onChange={event => update({ stopHz: Number(event.target.value) })}/></label>
      <label>Spacing<select aria-label="AC sweep spacing" value={settings.acScale ?? 'decade'} onChange={event => update({ acScale: event.target.value as NativeAnalysisSettings['acScale'] })}><option value="decade">Log · decade</option><option value="octave">Log · octave</option><option value="linear">Linear</option></select></label>
      <label>{settings.acScale === 'linear' ? 'Total points' : 'Points per interval'}<input aria-label="AC sweep points" type="number" min="2" max="2000" value={settings.acPoints ?? 100} onChange={event => update({ acPoints: Number(event.target.value) })}/></label>
      <label>Magnitude<input aria-label="AC excitation magnitude" type="number" step="any" value={settings.acMagnitude ?? 1} onChange={event => update({ acMagnitude: Number(event.target.value) })}/></label>
      <label>Phase (°)<input aria-label="AC excitation phase" type="number" step="any" value={settings.acPhaseDeg ?? 0} onChange={event => update({ acPhaseDeg: Number(event.target.value) })}/></label>
    </div></details>}
    {settings.type === 'dc-sweep' && <details className={styles.sweepSettings} open={sweepOpen} onToggle={event => setSweepOpen(event.currentTarget.open)}><summary>DC sweep settings</summary><div className={styles.sweepFields}>
      <label>Source<select aria-label="DC sweep source" value={settings.dcSource ?? options.sources[0]?.index ?? ''} onChange={event => update({ dcSource: Number(event.target.value) })}>{options.sources.map(source => <option key={source.index} value={source.index}>{source.label}</option>)}</select></label>
      {(['dcStart', 'dcStop', 'dcStep'] as const).map((key, index) => <label key={key}>{['Start', 'Stop', 'Step'][index]}<input aria-label={`DC sweep ${['start', 'stop', 'step'][index]}`} type="number" step="any" value={settings[key]} onChange={event => update({ [key]: Number(event.target.value) })}/></label>)}
    </div></details>}
    {section === 'all' && settings.type === 'transient' && <p>Uses the capture duration and sample count. Capture starts at time zero unless Current state is selected.</p>}
    </>}
    {section !== 'analysis' && options.models.length > 0 && <fieldset className={styles.modelFields}><legend>Device models · SPICE</legend>{options.models.map(device => <label key={device.index}>{device.label}<select aria-label={`SPICE model for ${device.label}`} title={device.choices.find(choice => choice.id === (settings.models?.[device.index] ?? device.defaultModel))?.description} value={settings.models?.[device.index] ?? device.defaultModel} onChange={event => update({ models: { ...settings.models, [device.index]: event.target.value } })}>{device.choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>)}<small>These models apply to SPICE analysis. The live editor uses its own device models.</small></fieldset>}
    {section !== 'analysis' && waveformSources.length > 0 && <fieldset className={styles.modelFields}><legend>Source waveform</legend>
      <label>Source<select aria-label="Waveform source" value={selected?.index ?? ''} onChange={event => setSourceElement(nativeElements[Number(event.target.value)] ?? null)}>{!selected && <option value="" disabled>Choose a replacement source</option>}{waveformSources.map(source => <option key={source.index} value={source.index}>{source.label}</option>)}</select></label>
      {selected && selectedElement ? <SourceEditor key={`${sourceFormKey(selectedElement)}:${JSON.stringify(sourceOverrides.get(selectedElement))}`} initial={sourceOverrides.get(selectedElement)} duration={settings.duration} onApply={source => onApplySource(selected.index, source, selectedElement)}/> : <p>The selected source was removed. Choose another source to edit.</p>}
    </fieldset>}
  </div>;
}

function SourceEditor({ initial, duration, onApply }: { initial?: NativeSourceOverride; duration: number; onApply: (source: NativeSourceOverride | undefined) => void }) {
  const [type, setType] = useState<NativeSourceOverride['type'] | 'native'>(initial?.type ?? 'native');
  const [pwl, setPwl] = useState(initial?.type === 'pwl' ? initial.points.map(point => `${point.timeS}, ${point.value}`).join('\n') : '0, 0\n1m, 0\n2m, 5\n4m, 5\n5m, 0');
  const [bits, setBits] = useState(initial?.type === 'bitstream' ? initial.bits : '10110010');
  const [period, setPeriod] = useState(initial?.type === 'bitstream' ? String(initial.bitPeriodS) : '1m');
  const [rise, setRise] = useState(initial?.type === 'bitstream' ? String(initial.riseS) : '1u');
  const [low, setLow] = useState(initial?.type === 'bitstream' ? String(initial.low) : '0');
  const [high, setHigh] = useState(initial?.type === 'bitstream' ? String(initial.high) : '5');
  const [delay, setDelay] = useState(initial?.type === 'bitstream' ? String(initial.delayS ?? 0) : '0');
  const [repeat, setRepeat] = useState(initial?.type === 'bitstream' ? initial.repeat === true : true);
  const [repeatPwl, setRepeatPwl] = useState(initial?.type === 'pwl' && initial.repeatPeriodS !== undefined);
  const [dc, setDc] = useState(initial?.type === 'dc' ? String(initial.value) : '5');
  const [offset, setOffset] = useState(initial?.type === 'sine' ? String(initial.offset) : '0');
  const [amplitude, setAmplitude] = useState(initial?.type === 'sine' ? String(initial.amplitude) : '1');
  const [frequency, setFrequency] = useState(initial?.type === 'sine' ? String(initial.frequencyHz) : '1k');
  const [phase, setPhase] = useState(initial?.type === 'sine' ? String(initial.phaseDeg ?? 0) : '0');
  const [error, setError] = useState<string | null>(null);
  const numeric = (value: string) => { const result = parseEngineeringNumber(value); if (result === null || !Number.isFinite(result)) throw new Error(`Invalid number: ${value}. Use a number or a suffix such as m, u, k.`); return result; };
  const field = (label: string, value: string, change: (value: string) => void) => <label>{label}<input aria-label={label} value={value} onChange={event => change(event.target.value)}/></label>;
  return <>
    <label>Waveform<select aria-label="Source waveform type" value={type} onChange={event => setType(event.target.value as typeof type)}><option value="native">Schematic source</option><option value="dc">DC</option><option value="sine">Sine</option><option value="pwl">PWL · time/value points</option><option value="bitstream">Bitstream</option></select></label>
    {type === 'dc' && field('DC level', dc, setDc)}
    {type === 'sine' && <>{field('Sine offset', offset, setOffset)}{field('Sine amplitude', amplitude, setAmplitude)}{field('Sine frequency (Hz)', frequency, setFrequency)}{field('Sine phase (°)', phase, setPhase)}</>}
    {type === 'pwl' && <label className={styles.pwlField}>Time (s), value · one point per line<textarea aria-label="PWL source points" spellCheck={false} rows={6} value={pwl} onChange={event => setPwl(event.target.value)}/><small>Times must increase. Engineering suffixes such as 1m and 10u are supported.</small></label>}
    {type === 'pwl' && <label><input type="checkbox" checked={repeatPwl} onChange={event => setRepeatPwl(event.target.checked)}/>Repeat PWL sequence<small>Start at 0 and finish at the starting value. The last time sets the period.</small></label>}
    {type === 'bitstream' && <>{field('Binary sequence', bits, setBits)}{field('Bit period (s)', period, setPeriod)}{field('Rise/fall time (s)', rise, setRise)}{field('Low level', low, setLow)}{field('High level', high, setHigh)}<label><input type="checkbox" checked={repeat} onChange={event => setRepeat(event.target.checked)}/>Repeat sequence</label>{!repeat && field('Delay (s)', delay, setDelay)}</>}
    <button type="button" onClick={() => {
      try {
        let source: NativeSourceOverride | undefined;
        if (type === 'dc') source = { type, value: numeric(dc) };
        if (type === 'sine') { source = { type, offset: numeric(offset), amplitude: numeric(amplitude), frequencyHz: numeric(frequency), phaseDeg: numeric(phase) }; if (source.frequencyHz <= 0 || source.amplitude < 0) throw new Error('Use a positive frequency and nonnegative amplitude.'); }
        if (type === 'pwl') source = { type, points: pwl.trim().split(/\n+/).map(line => { const pair = line.trim().split(/[\s,]+/); if (pair.length !== 2) throw new Error('Enter one time, value pair per line.'); return { timeS: numeric(pair[0]), value: numeric(pair[1]) }; }) };
        if (source?.type === 'pwl' && repeatPwl) source.repeatPeriodS = source.points.at(-1)?.timeS;
        if (type === 'bitstream') source = { type, bits: bits.replace(/\s/g, ''), bitPeriodS: numeric(period), low: numeric(low), high: numeric(high), riseS: numeric(rise), delayS: repeat ? 0 : numeric(delay), repeat };
        if (source?.type === 'pwl' || source?.type === 'bitstream') stimulusPoints(source, duration);
        onApply(source); setError(null);
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the source settings.'); }
    }}>Apply waveform</button>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </>;
}
