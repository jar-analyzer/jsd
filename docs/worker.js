import { describeClasses } from './class-index.js';
import { decompileClassSetDetailed, parseClass } from './jsd.browser.js';
import { collectClasses } from './files.js';

self.onmessage = async ({ data }) => {
  try {
    let result;
    if (data.action === 'load') {
      let unzip;
      if (data.inputs.some((input) => /\.(jar|war|zip)$/i.test(input.name))) {
        try {
          unzip = (await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js'))
            .unzipSync;
        } catch {
          throw new Error('ARCHIVE_UNAVAILABLE');
        }
      }
      result = describeClasses(collectClasses(data.inputs, unzip), parseClass);
    } else result = decompileClassSetDetailed(new Map(data.files));
    const transfers =
      data.action === 'load' ? [...new Set(result.map(([, bytes]) => bytes.buffer))] : [];
    self.postMessage({ result }, transfers);
  } catch (error) {
    self.postMessage({ error: error.message ?? String(error) });
  }
};
