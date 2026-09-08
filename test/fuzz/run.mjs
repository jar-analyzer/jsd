#!/usr/bin/env node
import { Worker } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { javaCases, filterCases } from '../support/paths.mjs';

const args = process.argv.slice(2);
const options = { rounds: 2000, seed: 20260907 };
const filters = [];
for (const arg of args) {
  const option = /^--(rounds|seed)=(\d+)$/.exec(arg);
  if (option) options[option[1]] = Number(option[2]);
  else if (arg.startsWith('-')) throw new Error(`Unknown fuzz option: ${arg}`);
  else filters.push(arg);
}
if (!Number.isSafeInteger(options.rounds) || options.rounds < 1)
  throw new Error('Fuzz rounds must be a positive integer');
if (!Number.isInteger(options.seed) || options.seed < 1 || options.seed > 0xffffffff)
  throw new Error('Fuzz seed must be an integer between 1 and 4294967295');
const { rounds, seed } = options;
const fixtures = filterCases([...javaCases('core'), ...javaCases('modern')], filters);
if (!fixtures.length) throw new Error('No fuzz corpus cases matched the requested filter');
const work = mkdtempSync(join(tmpdir(), 'jsd-fuzz-'));
const corpusDir = join(work, 'corpus');
const crashesDir = join(work, 'crashes');
const modernJavac = 'javac';
console.log(`Fuzz: ${rounds} rounds, seed=${seed}, ${fixtures.length} corpus cases`);

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

function buildCorpus() {
  mkdirSync(corpusDir);
  const stage = join(work, 'stage');
  for (const fixture of fixtures) {
    rmSync(stage, { recursive: true, force: true });
    mkdirSync(stage);
    const file = fixture.name + '.java';
    writeFileSync(join(stage, file), readFileSync(fixture.path));
    const release =
      fixture.release ?? (fixture.legacyRelease ? Math.max(8, fixture.legacyRelease) : undefined);
    const args = ['-g', ...(release ? ['--release', String(release)] : []), file];
    const result = spawnSync(modernJavac, args, { cwd: stage, encoding: 'utf8', timeout: 30000 });
    if (result.status !== 0)
      throw new Error(
        `Corpus compile failed for ${fixture.id}: ${result.error?.message ?? result.stderr}`,
      );
    for (const cf of readdirSync(stage).filter((name) => name.endsWith('.class'))) {
      const name = fixture.id.replaceAll('/', '__') + '__' + cf;
      writeFileSync(join(corpusDir, name), readFileSync(join(stage, cf)));
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

try {
  buildCorpus();
} catch (error) {
  console.error(error.message);
  console.error(`Artifacts: ${work}`);
  process.exit(1);
}
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

mkdirSync(crashesDir, { recursive: true });

let worker;
function checkSample(bytes) {
  worker ??= new Worker(new URL('./worker.mjs', import.meta.url), {
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
  console.log(
    `reproduce: npm run test:fuzz -- --rounds=${rounds} --seed=${seed} ${filters.join(' ')}`,
  );
}
if (worker) await worker.terminate();
if (crashes) console.error(`Artifacts: ${work}`);
else rmSync(work, { recursive: true, force: true });
process.exit(crashes ? 1 : 0);
