#!/usr/bin/env node
import { Worker } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const corpusDir = '/tmp/jsd-fuzz-corpus';
const crashesDir = '/tmp/jsd-fuzz-crashes';

const argvNums = process.argv
  .slice(2)
  .filter((a) => /^\d+$/.test(a))
  .map(Number);
const rounds = argvNums[0] ?? 300;
const seed = argvNums[1] ?? (Math.random() * 2 ** 31) | 0;

const modernJavac = findModernJavac();

let rngState = seed >>> 0;
function rnd() {
  rngState ^= rngState << 13;
  rngState >>>= 0;
  rngState ^= rngState >> 17;
  rngState ^= rngState << 5;
  rngState >>>= 0;
  return rngState / 2 ** 32;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

function findModernJavac() {
  const tryPath = (javacPath) => {
    const r = spawnSync(javacPath, ['-version'], { encoding: 'utf8' });
    const m = /(?:javac|version)\s+"?(\d+)/.exec(`${r.stdout || ''}${r.stderr || ''}`);
    return m ? { path: javacPath, major: Number(m[1]) } : null;
  };
  const direct = tryPath('javac');
  if (direct && direct.major >= 25) return 'javac';
  for (const v of [25, 24, 23, 22, 21]) {
    const home = spawnSync('/usr/libexec/java_home', ['-v', String(v)], { encoding: 'utf8' });
    const hp = (home.stdout || '').trim();
    if (hp && tryPath(join(hp, 'bin', 'javac'))) return join(hp, 'bin', 'javac');
  }
  return 'javac';
}

function buildCorpus(force = false) {
  if (!force && existsSync(corpusDir) && readdirSync(corpusDir).some((f) => f.endsWith('.class')))
    return;
  rmSync(corpusDir, { recursive: true, force: true });
  mkdirSync(corpusDir, { recursive: true });
  const groups = [
    { dir: join(root, 'test', 'fixtures'), perFile: () => [] },
    {
      dir: join(root, 'test', 'fixtures-modern'),
      perFile: (f) => ['--release', /ModernJdk(\d+)/.exec(f)?.[1] ?? '21'],
    },
  ];
  for (const g of groups) {
    const stage = join(corpusDir, '.stage');
    rmSync(stage, { recursive: true, force: true });
    mkdirSync(stage, { recursive: true });
    for (const f of readdirSync(g.dir).filter((x) => x.endsWith('.java'))) {
      rmSync(stage, { recursive: true, force: true });
      mkdirSync(stage, { recursive: true });
      writeFileSync(join(stage, f), readFileSync(join(g.dir, f)));
      const r = spawnSync(modernJavac, ['-g', ...g.perFile(f), f], {
        cwd: stage,
        encoding: 'utf8',
      });
      if (r.status !== 0) {
        console.error(`corpus compile failed for ${f}:\n` + r.stderr.slice(0, 800));
        process.exit(1);
      }
      for (const cf of readdirSync(stage).filter((x) => x.endsWith('.class'))) {
        const name = cf.replace(/[^A-Za-z0-9_$.-]/g, '_');
        writeFileSync(join(corpusDir, name), readFileSync(join(stage, cf)));
      }
    }
  }
}

function mutate(bytes) {
  const out = new Uint8Array(bytes);
  const n = 1 + Math.floor(rnd() * 4);
  const lo = Math.max(10, Math.floor(out.length * 0.45));
  for (let i = 0; i < n; i++) {
    const pos = lo + Math.floor(rnd() * Math.max(1, out.length - lo));
    const op = rnd();
    if (op < 0.45) {
      out[pos] = Math.floor(rnd() * 256);
    } else if (op < 0.7) {
      out[pos] = pick([0x00, 0xff, 0x7f, 0x80, 0x01, 0x02, 0x03, 0xa7]);
    } else if (op < 0.9 && out.length > 32) {
      const from = lo + Math.floor(rnd() * Math.max(1, out.length - lo));
      out[pos] = out[from];
    } else {
      out[pos] = out[pos] ^ (1 << Math.floor(rnd() * 8));
    }
  }
  return out;
}

buildCorpus(process.argv.includes('--force'));
const corpus = readdirSync(corpusDir)
  .filter((f) => f.endsWith('.class'))
  .sort()
  .map((f) => ({
    name: f,
    bytes: new Uint8Array(readFileSync(join(corpusDir, f))),
  }));
if (!corpus.length) {
  console.error('empty corpus');
  process.exit(1);
}

rmSync(crashesDir, { recursive: true, force: true });
mkdirSync(crashesDir, { recursive: true });

let worker;
function checkSample(bytes) {
  worker ??= new Worker(new URL('./fuzz-worker.mjs', import.meta.url), {
    resourceLimits: { maxOldGenerationSizeMb: 128 },
  });
  const active = worker;
  return new Promise((resolve) => {
    const finish = (result) => {
      clearTimeout(timer);
      active.removeListener('message', onMessage);
      active.removeListener('error', onError);
      active.removeListener('exit', onExit);
      if (result.kind === 'crash') {
        worker = undefined;

        active.on('error', () => {});
        void active.terminate();
      }
      resolve(result);
    };
    const onMessage = (result) => finish(result);
    const onError = (error) => finish({ kind: 'crash', detail: error.stack ?? String(error) });
    const onExit = (code) => finish({ kind: 'crash', detail: `worker exited with code ${code}` });
    const timer = setTimeout(
      () => finish({ kind: 'crash', detail: 'sample exceeded 5 second timeout' }),
      5000,
    );
    active.once('message', onMessage);
    active.once('error', onError);
    active.once('exit', onExit);
    active.postMessage(bytes);
  });
}

let crashes = 0;
let rejected = 0;
let degraded = 0;
for (let i = 0; i < rounds; i++) {
  const c = pick(corpus);
  const mutated = mutate(c.bytes);
  const result = await checkSample(mutated);
  if (result.kind === 'rejected') rejected++;
  else if (result.kind === 'degraded') degraded++;
  else if (result.kind === 'crash') {
    crashes++;
    const id = `crash-${i}-${c.name}`;
    writeFileSync(join(crashesDir, id), mutated);
    writeFileSync(
      join(crashesDir, id + '.txt'),
      `seed=${seed}\ncorpus=${c.name}\nround=${i}\n\n${result.detail}\n`,
    );
    console.log(`CRASH round ${i} (${c.name}): ${result.detail}`);
  }
}

console.log(
  `\nfuzz done: ${rounds} rounds, seed=${seed}, ${crashes} crashes, ${rejected} parse-rejected, ${degraded} degraded`,
);
if (crashes) {
  console.log(`crash artifacts in ${crashesDir}`);
  console.log(`reproduce: node test/fuzz.mjs ${rounds} ${seed}`);
}
if (worker) await worker.terminate();
process.exit(crashes ? 1 : 0);
