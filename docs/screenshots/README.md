# Workbench review captures

These captures document the native editor and real simulator workflows exercised by the browser tests. They are not mockups. The login capture shows the deliberately unconfigured Supabase state; it is not evidence of a live account connection.

- `native-wire-branch.png`: a native branch at 5 V, restored using CircuitJS Undo/Redo.
- `multiple-probe-oscilloscope.png`: seven voltage channels from six distinct divider taps plus the input. A separate current plot is exercised in the same test.
- `fft-analyzer.png`: the FFT of an actual captured divider waveform; unsupported distortion measurements are withheld.
- `login-desktop.png`: account entry and clear project-configuration status.

The instrument captures temporarily hide the sticky site header during the screenshot so it does not cover the instrument title. No plot data or circuit image is altered. The RC, CMOS and Sallen–Key renderer baselines live in `tests/e2e/visual-baselines/` and are compared by Playwright with a small font-rasterization tolerance.
