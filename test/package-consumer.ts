import {
  createDecompiler,
  decompileClassFile,
  decompileClassSetDetailed,
  parseClass,
  type ClassSource,
  type DecompileReport,
  type DecompileStatus,
} from '@jar-analyzer/jsd';
import { bytes } from './fixture.js';

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const parsed = parseClass(bytes);
check(parsed.name === 'PackageSmoke', 'packed parser returns the class name');
const single: ClassSource = decompileClassFile(bytes);
const status: DecompileStatus = single.status;
check(status === 'success', 'single class must decompile successfully');
check(single.source.includes('return 42;'), 'packed bundle preserves the method body');
const inputs = new Map([['PackageSmoke.class', bytes]]);
const report: DecompileReport = decompileClassSetDetailed(inputs);
check(report.status === 'success' && report.sources.length === 1, 'detailed batch API');
const session = createDecompiler();
session.addClasses(inputs);
check(session.decompileAll()[0].source === single.source, 'stateful API matches single class');
session.addClasses(new Map([['broken.class', new Uint8Array([0])]]));
check(
  session.decompileAllDetailed().status === 'partial',
  'invalid input preserves healthy output',
);
check(
  session.getDiagnostics().some((d) => d.code === 'CLASS_PARSE_FAILED'),
  'public diagnostics',
);
console.log('Packed package: types, ESM, parser, decompiler and diagnostics passed');
