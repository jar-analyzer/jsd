import { join } from 'node:path';
import { root } from './support/paths.mjs';
import { run, npm, javaMajor } from './support/process.mjs';

const [suite = 'default', ...args] = process.argv.slice(2);
const suites = [
  'default',
  'unit',
  'roundtrip',
  'modern',
  'bytecode',
  'package',
  'browser',
  'fuzz',
  'all',
];
if (suite === '--help') {
  console.log(`Usage: node test/run.mjs [${suites.join('|')}] [suite options]
unit: [engine|demo|file filter]
roundtrip: [--no-debug] [category or case filter]
modern: [--no-debug] [--max-release=N] [case filter]
browser: Chrome/Chromium on PATH or CHROME_BIN
fuzz: [--rounds=N] [--seed=N] [category or case filter]
default: build, unit, roundtrip and bytecode (JDK 11+)
all: quality checks and every suite, including browser layout and fuzz (JDK 25+, Chrome/Chromium)`);
} else {
  try {
    if (!suites.includes(suite)) throw new Error(`Unknown test suite: ${suite}`);
    if (['default', 'all', 'bytecode', 'package', 'browser'].includes(suite) && args.length)
      throw new Error(`${suite} does not accept filters or options`);
    if (!['unit', 'package', 'browser'].includes(suite)) {
      const minimum =
        suite === 'all' || suite === 'fuzz'
          ? 25
          : suite === 'roundtrip'
            ? 8
            : suite === 'modern'
              ? 9
              : 11;
      if (javaMajor() < minimum) throw new Error(`${suite} requires JDK ${minimum}+ on PATH`);
    }
    const script = (path, options = []) =>
      run(process.execPath, [join(root, 'test', path), ...options]);
    if (suite === 'all') {
      npm(['run', 'format:check']);
      npm(['run', 'check']);
    }
    if (!['unit', 'browser'].includes(suite)) npm(['run', 'build']);
    if (suite === 'all') npm(['run', 'docs:check']);
    const unit = (filters = []) => script('unit/run.mjs', filters);
    const roundtrip = (options = []) => script('roundtrip/core.mjs', options);
    const modern = (options = []) => script('roundtrip/modern.mjs', ['--require-all', ...options]);
    const bytecode = () => {
      script('bytecode/dynamic.mjs');
      script('bytecode/validation.mjs');
      script('bytecode/correctness.mjs');
    };
    if (suite === 'unit') unit(args);
    else if (suite === 'roundtrip') roundtrip(args);
    else if (suite === 'modern') modern(args);
    else if (suite === 'bytecode') bytecode();
    else if (suite === 'browser') script('browser/run.mjs');
    else if (suite === 'package') script('package/run.mjs');
    else if (suite === 'fuzz') script('fuzz/run.mjs', args);
    else {
      unit();
      if (suite === 'all') script('browser/run.mjs');
      roundtrip();
      bytecode();
      if (suite === 'all') {
        roundtrip(['--no-debug']);
        modern();
        modern(['--no-debug']);
        script('package/run.mjs');
        script('fuzz/run.mjs', ['--rounds=2000', '--seed=20260907']);
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}
