"use client";

import { useId, useMemo, useState } from "react";
import type { Trace } from "../../lib/simulator-contract";
import { computeSpectrum, type WindowFunction } from "../../lib/waveform-analysis";
import { formatEngineering } from "../../lib/engineering";
import { BrowserOscilloscope } from "./browser-oscilloscope";
import styles from "./spectrum-analyzer.module.css";

export function SpectrumAnalyzer({ time, traces }: { time: number[]; traces: Trace[] }) {
  const id = useId();
  const [selectedId, setSelectedId] = useState(traces[0]?.id ?? "");
  const [length, setLength] = useState(() => Math.max(64, Math.min(1024, 2 ** Math.floor(Math.log2(Math.max(1, time.length))))));
  const [windowName, setWindowName] = useState<WindowFunction>("hann");
  const [removeDc, setRemoveDc] = useState(true);
  const [logFrequency, setLogFrequency] = useState(false);
  const [db, setDb] = useState(true);
  const [start, setStart] = useState(0);
  const [stop, setStop] = useState(0);
  const [marker, setMarker] = useState(0);
  const trace = traces.find((candidate) => candidate.id === selectedId) ?? traces[0];
  const result = useMemo(() => {
    if (!trace) return { spectrum: null, error: "Add a waveform probe and capture samples first." };
    try { return { spectrum: computeSpectrum(time, trace.values, { length, window: windowName, removeDc }), error: null }; }
    catch (error) { return { spectrum: null, error: error instanceof Error ? error.message : "Spectrum could not be calculated." }; }
  }, [trace, time, length, windowName, removeDc]);
  const spectrum = result.spectrum;
  const filtered = useMemo(() => {
    if (!spectrum || !trace) return { x: [], values: [] };
    const indices = spectrum.frequencies.flatMap((frequency, i) => frequency >= start && (stop <= 0 || frequency <= stop) && (!logFrequency || frequency > 0) ? [i] : []);
    return { x: indices.map((i) => spectrum.frequencies[i]!), values: indices.map((i) => (db ? spectrum.decibels : spectrum.amplitudes)[i]!) };
  }, [spectrum, trace, start, stop, logFrequency, db]);
  const markerIndex = spectrum ? Math.max(0, Math.min(spectrum.frequencies.length - 1, Math.round(marker / spectrum.binWidth))) : 0;
  const display = (value: number | null | undefined, unit: string) => value === null || value === undefined ? "Unavailable" : formatEngineering(value, unit);

  return <section className={styles.panel} aria-label="Spectrum analyzer">
    <div className={styles.heading}><strong>Spectrum analyzer</strong><span>FFT of captured simulator samples</span></div>
    <div className={styles.controls}>
      <label htmlFor={`${id}-channel`}>Channel<select id={`${id}-channel`} value={trace?.id ?? ""} onChange={(event) => setSelectedId(event.currentTarget.value)}>{traces.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
      <label htmlFor={`${id}-length`}>FFT samples<select id={`${id}-length`} value={length} onChange={(event) => setLength(Number(event.currentTarget.value))}>{[64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label htmlFor={`${id}-window`}>Window<select id={`${id}-window`} value={windowName} onChange={(event) => setWindowName(event.currentTarget.value as WindowFunction)}><option value="rectangular">Rectangular</option><option value="hann">Hann</option><option value="hamming">Hamming</option><option value="blackman">Blackman</option></select></label>
      <label className={styles.toggle}><input type="checkbox" checked={removeDc} onChange={(event) => setRemoveDc(event.currentTarget.checked)} /> Remove DC</label>
      <label className={styles.toggle}><input type="checkbox" checked={logFrequency} onChange={(event) => setLogFrequency(event.currentTarget.checked)} /> Log frequency</label>
      <label className={styles.toggle}><input type="checkbox" checked={db} onChange={(event) => setDb(event.currentTarget.checked)} /> Magnitude in dB</label>
      <label htmlFor={`${id}-start`}>Start / Hz<input id={`${id}-start`} type="number" min="0" value={start} onChange={(event) => setStart(Math.max(0, Number(event.currentTarget.value)))} /></label>
      <label htmlFor={`${id}-stop`}>Stop / Hz (0 = full)<input id={`${id}-stop`} type="number" min="0" value={stop} onChange={(event) => setStop(Math.max(0, Number(event.currentTarget.value)))} /></label>
    </div>
    {result.error && <p role="status" className={styles.note}>{result.error}</p>}
    {spectrum && trace && <>
      {filtered.x.length > 1 ? <BrowserOscilloscope x={filtered.x} traces={[{ ...trace, id: `spectrum:${trace.id}`, values: filtered.values, unit: db ? "dB" : trace.unit }]} title="FFT spectrum" domain="frequency" xScale={logFrequency ? "log" : "linear"} xLabel="Frequency" xUnit="Hz" yLabel="Peak amplitude" yUnit={db ? "dB" : trace.unit} height={300} /> : <p className={styles.note}>Select a frequency span containing at least two bins.</p>}
      <div className={styles.controls}>
        <label htmlFor={`${id}-marker`}>Marker / Hz<input id={`${id}-marker`} type="number" min="0" max={spectrum.sampleRate / 2} step={spectrum.binWidth} value={marker} onChange={(event) => setMarker(Math.max(0, Number(event.currentTarget.value)))} /></label>
        <output>Marker: {display(spectrum.frequencies[markerIndex], "Hz")} · {display((db ? spectrum.decibels : spectrum.amplitudes)[markerIndex], db ? "dB" : trace.unit)}</output>
        <output>Resolution {display(spectrum.binWidth, "Hz")} · Nyquist {display(spectrum.sampleRate / 2, "Hz")}</output>
      </div>
      <dl className={styles.metrics}><div><dt>Dominant bin</dt><dd>{display(spectrum.dominantFrequency, "Hz")}</dd></div><div><dt>THD</dt><dd>{display(spectrum.thd, "%")}</dd></div><div><dt>SNR</dt><dd>{display(spectrum.snr, "dB")}</dd></div><div><dt>SINAD</dt><dd>{display(spectrum.sinad, "dB")}</dd></div><div><dt>SFDR</dt><dd>{display(spectrum.sfdr, "dB")}</dd></div></dl>
      {spectrum.harmonics.length > 0 && <div className={styles.controls} aria-label="Harmonic amplitudes">{spectrum.harmonics.map((harmonic) => <output key={harmonic.order}>H{harmonic.order}: {display(harmonic.frequency, "Hz")} · {display(harmonic.amplitude, trace.unit)}</output>)}</div>}
      {spectrum.metricsReason && <p className={styles.note}>{spectrum.metricsReason}</p>}
      {spectrum.warnings.map((warning) => <p className={styles.note} key={warning}>{warning}</p>)}
    </>}
  </section>;
}
