"use client";

import { useId, useMemo, useState } from 'react';
import type { Trace } from '../../lib/simulator-contract';
import { computeSpectrum, spectrumSignalStop, centeredSpectrumSpan, type WindowFunction } from '../../lib/waveform-analysis';
import { fftCaptureRequest, fftResolutionRequest, inspectFftSampling, prepareFftRecord } from '../../lib/fft-sampling';
import { formatEngineering } from '../../lib/engineering';
import { BrowserOscilloscope } from './browser-oscilloscope';
import { useInstrumentPanel, useTraceSelection, type CaptureRequest } from './instrument-state';
import styles from './spectrum-analyzer.module.css';

export function SpectrumAnalyzer({ time, traces, onRequestCapture, length: controlledLength, onLengthChange }: {
  time: number[]; traces: Trace[]; onRequestCapture?: (request: CaptureRequest) => void; length?: number; onLengthChange?: (length: number) => void;
}) {
  const id = useId(), panel = useInstrumentPanel('spectrum');
  const { selectedTraceId, selectTrace } = useTraceSelection();
  const [selectedId, setSelectedId] = useState(traces[0]?.id ?? '');
  const [localLength, setLocalLength] = useState<number | null>(null);
  const setLength = (value: number) => { setLocalLength(value); onLengthChange?.(value); };
  const [windowName, setWindowName] = useState<WindowFunction>('hann');
  const [removeDc, setRemoveDc] = useState(true), [logFrequency, setLogFrequency] = useState(false), [db, setDb] = useState(true);
  const [start, setStart] = useState(0), [stop, setStop] = useState(0), [marker, setMarker] = useState(0), [autoVersion, setAutoVersion] = useState(0);
  const [frequencyRange, setFrequencyRange] = useState<'signal' | 'full' | 'peak' | 'custom'>('peak');
  const [requestedDuration, setRequestedDuration] = useState<number | null>(null), [settleDuration, setSettleDuration] = useState(0);
  const signalRange = frequencyRange === 'signal';
  const samplingResult = useMemo(() => { try { return { sampling: inspectFftSampling(time), error: null }; } catch (cause) { return { sampling: null, error: cause instanceof Error ? cause.message : 'Invalid sample times.' }; } }, [time]);
  const sampling = samplingResult.sampling;
  const length = controlledLength ?? localLength ?? (sampling?.supportedLength || 1024);
  const usedLength = Math.min(length, sampling?.supportedLength ?? 0);
  const request = sampling && usedLength < length ? fftCaptureRequest(sampling, length, traces.length) : null;
  const autoSet = () => { setLength(sampling?.supportedLength || 64); setWindowName('hann'); setRemoveDc(true); setLogFrequency(false); setDb(true); setStart(0); setStop(0); setFrequencyRange('peak'); setMarker(0); setAutoVersion(version => version + 1); };
  const results = useMemo(() => {
    try {
      const record = usedLength >= 64 ? prepareFftRecord(time, usedLength) : null;
      return traces.map(trace => {
        try { return { trace, spectrum: record ? computeSpectrum(time, trace.values, { length: usedLength, window: windowName, removeDc, record }) : null, error: null }; }
        catch (cause) { return { trace, spectrum: null, error: cause instanceof Error ? cause.message : 'Spectrum could not be calculated.' }; }
      });
    } catch (cause) { return traces.map(trace => ({ trace, spectrum: null, error: cause instanceof Error ? cause.message : 'Invalid FFT record.' })); }
  }, [traces, time, usedLength, windowName, removeDc]);
  const signalStop = useMemo(() => spectrumSignalStop(results.flatMap(result => result.spectrum ? [result.spectrum] : [])), [results]);
  const focusedId = traces.some(trace => trace.id === selectedTraceId) ? selectedTraceId : selectedId;
  const focused = results.find(result => result.trace.id === focusedId) ?? results[0];
  const spectrum = focused?.spectrum, trace = focused?.trace;
  const centeredSpan = spectrum ? centeredSpectrumSpan(spectrum, logFrequency) : null;
  const visibleStart = frequencyRange === 'peak' ? centeredSpan?.start ?? 0 : start;
  const visibleStop = frequencyRange === 'peak' ? centeredSpan?.stop ?? signalStop ?? 0 : signalRange ? signalStop ?? 0 : stop;
  const maxDepth = 2 ** Math.floor(Math.log2(Math.min(131072, Math.floor(2097152 / (Math.max(1, traces.length) + 1)))));
  const desiredDuration = requestedDuration ?? (spectrum ? Math.min(8 / spectrum.binWidth, maxDepth / spectrum.sampleRate) : 0);
  const longerRequest = spectrum ? fftResolutionRequest(spectrum.sampleRate, spectrum.length, desiredDuration, settleDuration, traces.length) : null;
  const plots = useMemo(() => {
    const valid = results.filter(result => result.spectrum !== null);
    return [...new Set(valid.map(result => db ? 'dB' : result.trace.unit))].map(unit => {
      const group = valid.filter(result => (db ? 'dB' : result.trace.unit) === unit), first = group[0]!.spectrum!;
      const indices = first.frequencies.flatMap((frequency, i) => frequency >= visibleStart && (visibleStop <= 0 || frequency <= visibleStop) && (!logFrequency || frequency > 0) ? [i] : []);
      return { unit, x: indices.map(i => first.frequencies[i]!), traces: group.map(({ trace, spectrum }) => ({ ...trace, sourceId: trace.id, id: 'spectrum:' + trace.id, values: indices.map(i => (db ? spectrum!.decibels : spectrum!.amplitudes)[i]!), unit })) };
    });
  }, [results, visibleStart, visibleStop, logFrequency, db]);
  const markerIndex = spectrum ? Math.max(0, Math.min(spectrum.frequencies.length - 1, Math.round(marker / spectrum.binWidth))) : 0;
  const display = (value: number | null | undefined, unit: string) => value === null || value === undefined ? 'Unavailable' : formatEngineering(value, unit);

  return <section className={styles.panel} aria-label="Spectrum analyzer" hidden={panel.hidden} data-instrument-maximized={panel.maximized} data-fft-requested={length} data-fft-used={usedLength} data-record-start={spectrum?.recordStart} data-record-end={spectrum?.recordEnd} data-bin-width={spectrum?.binWidth}>
    <div className={styles.heading}><strong>Spectrum analyzer</strong><span>{usedLength.toLocaleString()} supported samples per trace</span>{(!plots.length || plots.every(plot => plot.x.length < 2)) && <button type="button" onClick={autoSet}>Auto set</button>}</div>
    <div className={styles.controls}>
      <label htmlFor={id + '-channel'}>Channel<select id={id + '-channel'} value={trace?.id ?? ''} onChange={event => { setSelectedId(event.target.value); selectTrace(event.target.value); }}>{traces.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
      <label htmlFor={id + '-length'}>FFT samples<select id={id + '-length'} value={length} onChange={event => setLength(Number(event.target.value))}>{[64,128,256,512,1024,2048,4096,8192,16384,32768,65536,131072].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label htmlFor={id + '-window'}>Window<select id={id + '-window'} value={windowName} onChange={event => setWindowName(event.target.value as WindowFunction)}><option value="rectangular">Rectangular</option><option value="hann">Hann</option><option value="hamming">Hamming</option><option value="blackman">Blackman</option><option value="blackman-harris">Blackman–Harris (low sidelobes)</option></select></label>
      <label className={styles.toggle}><input type="checkbox" checked={removeDc} onChange={event => setRemoveDc(event.target.checked)}/> Remove DC</label>
      <label className={styles.toggle}><input type="checkbox" checked={logFrequency} onChange={event => setLogFrequency(event.target.checked)}/> Log frequency</label>
      <label className={styles.toggle}><input type="checkbox" checked={db} onChange={event => setDb(event.target.checked)}/> Magnitude in dB</label>
      <label>Frequency range<select aria-label="Spectrum frequency range" value={frequencyRange} onChange={event => { const mode = event.target.value as typeof frequencyRange; setFrequencyRange(mode); setStart(mode === 'custom' ? visibleStart : 0); setStop(mode === 'custom' ? visibleStop : 0); }}><option value="signal">Fit signal band</option><option value="peak" disabled={!centeredSpan}>Center selected peak</option><option value="full">Full Nyquist range</option><option value="custom">Custom span</option></select></label>
      <label htmlFor={id + '-start'}>Start / Hz<input id={id + '-start'} type="number" min="0" value={Number(visibleStart.toPrecision(12))} onChange={event => { setFrequencyRange('custom'); setStop(visibleStop); setStart(Math.max(0, Number(event.target.value))); }}/></label>
      <label htmlFor={id + '-stop'}>Stop / Hz (0 = full)<input id={id + '-stop'} type="number" min="0" value={Number(visibleStop.toPrecision(12))} onChange={event => { setFrequencyRange('custom'); setStart(visibleStart); setStop(Math.max(0, Number(event.target.value))); }}/></label>
    </div>
    {samplingResult.error && <p role="alert" className={styles.note}>{samplingResult.error}</p>}
    {sampling && usedLength < length && <div className={styles.captureNotice} role="status"><p>Requested {length.toLocaleString()} FFT samples; {usedLength ? `showing ${usedLength.toLocaleString()} supported samples` : 'this record does not support a 64-point FFT'}. The record has {time.length.toLocaleString()} readings; adaptive solver steps do not all have equal spacing.</p>
      {request && onRequestCapture ? <button type="button" onClick={() => onRequestCapture(request)}>Capture more samples for {length.toLocaleString()}-point FFT</button> : <p>{request ? 'Choose a deeper capture with a smaller sample interval, then run again.' : `This depth exceeds this record's acquisition budget. Use up to ${sampling.supportedLength.toLocaleString()} supported FFT samples, or reduce the number of probes.`}</p>}
    </div>}
    {results.map(result => result.error && <p key={result.trace.id} role="status" className={styles.note}>{result.trace.name}: {result.error}</p>)}
    {signalRange && signalStop !== null && <p className={styles.note}>Showing the measured signal band through {formatEngineering(signalStop, 'Hz')}. This fits 99.9% of non-DC spectral power with margin. Choose Full Nyquist range to inspect higher-frequency noise and spurs; FFT data and measurements are unchanged.</p>}
    {frequencyRange === 'peak' && <p className={styles.note}>{centeredSpan ? "Centered on the selected channel's measured peak." : 'No interior peak can be centered; showing the available signal band.'} This is a display crop; Full Nyquist range restores every measured frequency bin.</p>}
    {spectrum && spectrum.periodicFrequency === null && <p className={styles.note}>This record does not establish a repeating waveform. Steps and settling responses have a broad spectrum; use a longer measured record to resolve repetitions. Increasing sample count alone cannot narrow these peaks.</p>}
    {spectrum && <div className={styles.recordSummary} aria-label="FFT record summary"><strong>{formatEngineering(1 / spectrum.binWidth, 's')} FFT window · {formatEngineering(spectrum.binWidth, 'Hz')} per bin</strong><span>Measured interval {formatEngineering(spectrum.recordStart, 's')} → {formatEngineering(spectrum.recordEnd, 's')} · {usedLength.toLocaleString()} samples · {formatEngineering(spectrum.sampleRate, 'Hz')} sample rate</span></div>}
    {plots.map(plot => plot.x.length > 1 ? <BrowserOscilloscope key={autoVersion + ':' + plot.unit + ':' + frequencyRange} instrumentId={'spectrum:' + plot.unit} onAutoSet={autoSet} x={plot.x} traces={plot.traces} title={plots.length > 1 ? 'FFT spectrum · ' + plot.unit : 'FFT spectrum'} domain="frequency" xScale={logFrequency ? 'log' : 'linear'} xLabel="Frequency" xUnit="Hz" yLabel="Peak amplitude" yUnit={plot.unit} height={300}/> : <p key={plot.unit} className={styles.note}>Select a frequency span containing at least two bins.</p>)}
    {spectrum && trace && <>
      <details className={styles.recordControls}><summary>Finer resolution &amp; settled capture</summary>
        <p>Frequency spacing is 1 / FFT window. More samples over the same duration increase bandwidth, not frequency resolution. A longer record narrows the peak; windowing and real startup transients can still produce skirts.</p>
        <div className={styles.controls}><label>Record length / s<input aria-label="FFT capture record length" type="number" min="0" max="10" step="any" value={Number(desiredDuration.toPrecision(12))} onChange={event => setRequestedDuration(Number(event.target.value))}/></label><label>Settle before record / s<input aria-label="FFT capture settling time" type="number" min="0" max="10" step="any" value={settleDuration} onChange={event => setSettleDuration(Number(event.target.value))}/></label><button type="button" disabled={!longerRequest || !onRequestCapture} onClick={() => { if (longerRequest && onRequestCapture) { setLength(longerRequest.fftLength); onRequestCapture(longerRequest); } }}>Capture longer FFT record</button></div>
        {longerRequest ? <p>Acquire {longerRequest.fftLength.toLocaleString()} real samples for approximately {formatEngineering(1 / desiredDuration, 'Hz')} bins. {onRequestCapture ? 'The circuit is simulated through the settling interval before recording.' : 'For a separate SPICE deck, edit its transient duration and start time, then run again.'}</p> : <p>Choose a longer window within 10 s including settling. This acquisition must preserve the current sample rate and fit the probe memory budget ({maxDepth.toLocaleString()} samples). At the limit, reduce the acquisition sample rate deliberately in capture settings to trade bandwidth for duration.</p>}
        <p>{spectrum.periodicFrequency === null ? 'No stable period is established in this record.' : `${formatEngineering(spectrum.periodicFrequency, 'Hz')} estimated repetition · ${(spectrum.periodicFrequency / spectrum.binWidth).toFixed(3)} cycles in this FFT window.`} {windowName === 'rectangular' ? 'Rectangular suppresses window spreading only for a settled signal with an integer number of cycles; otherwise leakage is real.' : `${windowName === 'hann' ? 'Hann' : windowName === 'hamming' ? 'Hamming' : windowName === 'blackman-harris' ? 'Blackman–Harris (four-term)' : 'Blackman'} reduces distant leakage by spreading each tone across neighboring bins. Use Rectangular only with a settled, coherent record.`} No bins are padded, smoothed or removed from the measurements.</p>
      </details>
      <div className={styles.controls}>
        <label htmlFor={id + '-marker'}>Marker / Hz<input id={id + '-marker'} type="number" min="0" max={spectrum.sampleRate / 2} step={spectrum.binWidth} value={marker} onChange={event => setMarker(Math.max(0, Number(event.target.value)))}/></label>
        <output>Marker: {display(spectrum.frequencies[markerIndex], 'Hz')} · {display((db ? spectrum.decibels : spectrum.amplitudes)[markerIndex], db ? 'dB' : trace.unit)} · {trace.name}</output>
        <output>Resolution {display(spectrum.binWidth, 'Hz')} · Nyquist {display(spectrum.sampleRate / 2, 'Hz')}</output>
      </div>
      <p className={styles.note}>Measurements below refer to {trace.name}. All enabled traces remain visible; select a trace to inspect its measurements.</p>
      <dl className={styles.metrics}><div><dt>Dominant bin</dt><dd>{display(spectrum.dominantFrequency, 'Hz')}</dd></div><div><dt>THD</dt><dd>{display(spectrum.thd, '%')}</dd></div><div><dt>SNR</dt><dd>{display(spectrum.snr, 'dB')}</dd></div><div><dt>SINAD</dt><dd>{display(spectrum.sinad, 'dB')}</dd></div><div><dt>SFDR</dt><dd>{display(spectrum.sfdr, 'dB')}</dd></div></dl>
      {spectrum.harmonics.length > 0 && <div className={styles.controls} aria-label="Harmonic amplitudes">{spectrum.harmonics.map(harmonic => <output key={harmonic.order}>H{harmonic.order}: {display(harmonic.frequency, 'Hz')} · {display(harmonic.amplitude, trace.unit)}</output>)}</div>}
      {spectrum.metricsReason && <p className={styles.note}>{spectrum.metricsReason}</p>}
      {spectrum.warnings.map(warning => <p className={styles.note} key={warning}>{warning}</p>)}
    </>}
  </section>;
}
