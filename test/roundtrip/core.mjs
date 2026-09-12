#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertGeneratedSources,
  checkExpectations,
  checkTypeAnnotations,
  findMain,
} from '../support/roundtrip-checks.mjs';

import { root, javaCases, filterCases } from '../support/paths.mjs';
const dist = join(root, 'dist');

let work;

const noDebug = process.argv.includes('--no-debug');
const only = process.argv.slice(2).filter((a) => a !== '--no-debug');
if (only.some((arg) => arg.startsWith('-'))) throw new Error('Unknown round-trip option');
const fixtures = filterCases(javaCases('core'), only);

if (!fixtures.length) throw new Error('No fixtures matched the requested filter');
const suiteWork = mkdtempSync(join(tmpdir(), 'jsd-e2e-'));

const { decompileClassSet, parseClass } = await import(
  process.env.JSD_TEST_BUNDLE ?? join(dist, 'jsd.min.js')
);

let pass = 0,
  fail = 0;
const failures = [];

for (const fx of fixtures) {
  const { name, id } = fx;

  work = join(suiteWork, id);
  mkdirSync(join(work, 'orig'), { recursive: true });
  mkdirSync(join(work, 'rt'), { recursive: true });
  let res;
  try {
    res = runOne(fx, name);
  } catch (e) {
    res = { ok: false, why: 'round-trip assertion failed', detail: e.stack };
  }
  if (res.ok) {
    pass++;
    console.log(`PASS ${id}${res.note ? ` (${res.note})` : ''}`);
  } else {
    fail++;
    failures.push({ name: id, why: res.why, detail: res.detail });
    console.log(`FAIL ${id}: ${res.why}`);
  }
}

console.log(
  `\n${pass} passed, ${fail} failed / ${fixtures.length} total${noDebug ? ' (no debug info)' : ''}`,
);
for (const f of failures) {
  console.log(`\n===== ${f.name}: ${f.why}`);
  if (f.detail) console.log(String(f.detail).split('\n').slice(0, 40).join('\n'));
}
if (fail === 0 && pass > 0) rmSync(suiteWork, { recursive: true, force: true });
else console.error(`Artifacts: ${suiteWork}`);
process.exit(fail === 0 && pass > 0 ? 0 : 1);

function javac(dir, files, opts = []) {
  return spawnSync('javac', [noDebug ? '-g:none' : '-g', ...opts, ...files], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 30000,
  });
}

function javacMajor() {
  const r = spawnSync('javac', ['-version'], { encoding: 'utf8' });
  const m = /(?:javac|version)\s+"?(\d+)/.exec(`${r.stdout || ''}${r.stderr || ''}`);
  return m ? Number(m[1]) : 0;
}

function legacyOpts(fixture) {
  if (!fixture.legacyRelease) return [];
  const v = fixture.legacyRelease;
  const major = javacMajor();
  if (major >= 20) return ['--release', String(Math.max(v, 8))];
  if (major >= 9) return ['--release', String(Math.max(v, 7))];
  return ['-source', String(v), '-target', String(v)];
}

function java(dir, cls, cp = [], assertions = '-ea') {
  const r = spawnSync('java', [assertions, ...cp.flatMap((c) => ['-cp', c]), cls], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 30000,
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr ? 'ERR:' + r.stderr : '') };
}

function runOne(fx, name) {
  const fixturesDir = fx.directory;
  const file = basename(fx.path);
  const src = readFileSync(fx.path);
  writeFileSync(join(work, 'orig', file), src);
  const lo = legacyOpts(fx);

  const c1 = javac(join(work, 'orig'), [file], lo);
  if (c1.status !== 0)
    return { ok: false, why: 'fixture does not compile', detail: c1.error?.message ?? c1.stderr };

  const mainCls = findMain(join(work, 'orig'), parseClass);
  if (!mainCls) return { ok: false, why: 'fixture has no main()' };
  const r1 = java(join(work, 'orig'), mainCls);
  if (r1.code !== 0) return { ok: false, why: 'original run failed', detail: r1.out };
  checkExpectations(fixturesDir, name, join(work, 'orig'), r1.out, parseClass);

  const classFiles = readdirSync(join(work, 'orig')).filter((f) => f.endsWith('.class'));
  const expectationPath = join(fixturesDir, name + '.expected.json');
  const dependencies = new Set(
    existsSync(expectationPath)
      ? (JSON.parse(readFileSync(expectationPath, 'utf8')).dependencies ?? [])
      : [],
  );
  const map = new Map();
  for (const cf of classFiles) {
    if (dependencies.has(cf)) {
      writeFileSync(join(work, 'rt', cf), readFileSync(join(work, 'orig', cf)));
      continue;
    }
    map.set(cf, new Uint8Array(readFileSync(join(work, 'orig', cf))));
  }
  let sources;
  try {
    sources = decompileClassSet(map);
    assertGeneratedSources(sources);
    if (existsSync(expectationPath)) {
      const expected = JSON.parse(readFileSync(expectationPath, 'utf8'));
      const source = sources.map((entry) => entry.source).join('\n');
      for (const pattern of expected.sourcePatterns ?? [])
        assert.match(source, new RegExp(pattern), `${name}: generated source pattern ${pattern}`);
    }
  } catch (e) {
    return { ok: false, why: `decompiler crash: ${e.message}`, detail: e.stack };
  }

  for (const s of sources) {
    if (s.path.endsWith('.skip')) continue;
    const p = join(work, 'rt', s.path);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, s.source);
  }

  const javaFiles = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (f.endsWith('.java')) javaFiles.push(p);
      else if (existsSync(p) && !f.includes('.')) walk(p);
    }
  };
  walk(join(work, 'rt'));
  for (const compileOptions of lo.length ? [lo, []] : [[]]) {
    const c2 = javac(join(work, 'rt'), javaFiles, compileOptions);
    if (c2.status !== 0) {
      return {
        ok: false,
        why: 'decompiled source does not compile',
        detail: c2.error?.message ?? c2.stderr,
        sources,
      };
    }

    const r2 = java(join(work, 'rt'), mainCls);
    if (r2.code !== 0) return { ok: false, why: 'decompiled run failed', detail: r2.out, sources };

    checkExpectations(fixturesDir, name, join(work, 'rt'), r2.out, parseClass);
    checkTypeAnnotations(fixturesDir, name, join(work, 'orig'), join(work, 'rt'), parseClass);
    if (r1.out !== r2.out) {
      return {
        ok: false,
        why: 'output mismatch',
        detail: `--- original ---\n${r1.out}\n--- decompiled ---\n${r2.out}`,
        sources,
      };
    }

    if (fx.assertionsDisabled) {
      const disabledOriginal = java(join(work, 'orig'), mainCls, [], '-da');
      const disabledRecovered = java(join(work, 'rt'), mainCls, [], '-da');
      if (
        disabledOriginal.code !== 0 ||
        disabledRecovered.code !== 0 ||
        disabledOriginal.out !== disabledRecovered.out
      )
        return {
          ok: false,
          why: 'assertions-disabled behavior mismatch',
          detail: `${disabledOriginal.out}\n${disabledRecovered.out}`,
        };
    }
  }

  const bad = sources.filter((s) => s.source.includes('DECOMPILATION FAILED'));
  if (bad.length) {
    return {
      ok: false,
      why: `${bad.length} method(s) failed to decompile`,
      detail: bad
        .map((b) => b.source.match(/\/\* METHOD BODY DECOMPILATION FAILED[^\n]*/g)?.join('\n'))
        .join('\n'),
      sources,
    };
  }
  return { ok: true, note: `${sources.length} classes` };
}
