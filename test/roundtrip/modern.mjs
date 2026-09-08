#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
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
  findMain,
} from '../support/roundtrip-checks.mjs';

import { root, javaCases, filterCases } from '../support/paths.mjs';
const dist = join(root, 'dist');

function findJavac(minMajor) {
  const tryPath = (javacPath) => {
    const r = spawnSync(javacPath, ['-version'], { encoding: 'utf8' });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const m = /(?:javac|version)\s+"?(\d+)/.exec(out);
    return m ? { path: javacPath, major: Number(m[1]) } : null;
  };
  const direct = tryPath('javac');
  if (direct && direct.major >= minMajor) return direct;
  for (const v of [25, 24, 23, 22, 21]) {
    for (const base of ['/usr/libexec/java_home', '/Library/Java/JavaVirtualMachines']) {
      if (base === '/usr/libexec/java_home') {
        const home = spawnSync(base, ['-v', String(v)], { encoding: 'utf8' });
        const p = (home.stdout || '').trim();
        if (p) {
          const hit = tryPath(join(p, 'bin', 'javac'));
          if (hit && hit.major >= minMajor) return hit;
        }
      }
    }
  }
  return direct;
}

const jdk = findJavac(25);
const jdkMajor = jdk ? jdk.major : 0;
const javacBin = jdk ? jdk.path : 'javac';

let work;

const requireAll = process.argv.includes('--require-all');
const noDebug = process.argv.includes('--no-debug');
const releaseArg = process.argv.slice(2).find((a) => a.startsWith('--max-release='));
const maxRelease = releaseArg ? Number(releaseArg.split('=')[1]) : Infinity;
if (releaseArg && (!Number.isInteger(maxRelease) || maxRelease < 9))
  throw new Error('Invalid --max-release');
const only = process.argv
  .slice(2)
  .filter((a) => a !== '--require-all' && a !== '--no-debug' && a !== releaseArg);
if (only.some((arg) => arg.startsWith('-'))) throw new Error('Unknown modern Java option');
const fixtures = filterCases(
  javaCases('modern').filter((fixture) => fixture.release <= maxRelease),
  only,
);

if (!fixtures.length) throw new Error('No fixtures matched the requested filter');
console.log(`Modern suite: JDK ${jdkMajor}, maximum release ${maxRelease}, debug info ${!noDebug}`);
const suiteWork = mkdtempSync(join(tmpdir(), 'jsd-modern-e2e-'));
const { decompileClassSet, parseClass } = await import(
  process.env.JSD_TEST_BUNDLE ?? join(dist, 'jsd.min.js')
);

let pass = 0,
  fail = 0,
  skip = 0;
const failures = [];

for (const fx of fixtures) {
  const { name, id, release: need } = fx;
  if (need > jdkMajor) {
    skip++;
    console.log(`SKIP ${id} (needs JDK ${need}, have ${jdkMajor})`);
    continue;
  }
  work = join(suiteWork, id);
  mkdirSync(join(work, 'orig'), { recursive: true });
  mkdirSync(join(work, 'rt'), { recursive: true });
  let res;
  try {
    res = runOne(fx, name, need);
  } catch (e) {
    res = { ok: false, why: 'round-trip assertion failed', detail: e.stack };
  }
  if (res.ok) {
    pass++;
    console.log(`PASS ${id} (JDK ${need})`);
  } else if (res.skipped) {
    skip++;
    console.log(`SKIP ${id} (${res.why})`);
  } else {
    fail++;
    failures.push({ name: id, why: res.why, detail: res.detail });
    console.log(`FAIL ${id}: ${res.why}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped / ${fixtures.length} total`);
for (const f of failures) {
  console.log(`\n===== ${f.name}: ${f.why}`);
  if (f.detail) console.log(String(f.detail).split('\n').slice(0, 25).join('\n'));
}
const success = fail === 0 && pass > 0 && (!requireAll || skip === 0);
if (requireAll && skip)
  console.error('Full verification requires a JDK that runs every modern fixture');
if (success) rmSync(suiteWork, { recursive: true, force: true });
else console.error(`Artifacts: ${suiteWork}`);
process.exit(success ? 0 : 1);

function javac(dir, files, opts = []) {
  return spawnSync(
    javacBin,
    ['--release', String(opts.release), noDebug ? '-g:none' : '-g', ...files],
    { cwd: dir, encoding: 'utf8', timeout: 30000 },
  );
}

function java(dir, cls) {
  const javaBin = javacBin === 'javac' ? 'java' : javacBin.replace(/\/javac$/, '/java');
  const r = spawnSync(javaBin, ['-ea', cls], { cwd: dir, encoding: 'utf8', timeout: 30000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr ? 'ERR:' + r.stderr : '') };
}

function runOne(fx, name, release) {
  const fixturesDir = fx.directory;
  const file = basename(fx.path);
  const src = readFileSync(fx.path);
  writeFileSync(join(work, 'orig', file), src);
  const c1 = javac(join(work, 'orig'), [file], { release });
  if (c1.status !== 0)
    return { ok: false, why: 'fixture does not compile', detail: c1.error?.message ?? c1.stderr };
  const mainCls = findMain(join(work, 'orig'), parseClass, true);
  if (!mainCls) return { ok: false, why: 'fixture has no main()' };
  const r1 = java(join(work, 'orig'), mainCls);
  if (r1.code !== 0) return { ok: false, why: 'original run failed', detail: r1.out };
  checkExpectations(fixturesDir, name, join(work, 'orig'), r1.out, parseClass);
  const classFiles = readdirSync(join(work, 'orig')).filter((f) => f.endsWith('.class'));
  const map = new Map();
  for (const cf of classFiles) map.set(cf, new Uint8Array(readFileSync(join(work, 'orig', cf))));
  let sources;
  try {
    sources = decompileClassSet(map);
    assertGeneratedSources(sources);
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
  const c2 = javac(join(work, 'rt'), javaFiles, { release });
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
  if (r1.out !== r2.out) {
    return {
      ok: false,
      why: 'output mismatch',
      detail: `--- original ---\n${r1.out}\n--- decompiled ---\n${r2.out}`,
      sources,
    };
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
  return { ok: true };
}
