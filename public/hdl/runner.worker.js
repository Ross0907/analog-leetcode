// SPDX-License-Identifier: GPL-2.0-or-later
import { runHdl } from './run-engine.js';
self.onmessage = async ({ data }) => {
  try {
    const result = await runHdl(data, stage => self.postMessage({ type: 'stage', stage }));
    self.postMessage({ type: 'result', ...result });
  } catch (error) {
    self.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};
