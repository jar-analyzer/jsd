import { spawnSync } from 'node:child_process';
import { root } from './paths.mjs';

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`${command} exited with ${result.signal ?? result.status}`);
    error.exitCode = result.status ?? 1;
    throw error;
  }
}

export function npm(args) {
  if (process.env.npm_execpath) run(process.execPath, [process.env.npm_execpath, ...args]);
  else run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args);
}

export function javaMajor() {
  const result = spawnSync('javac', ['-version'], { encoding: 'utf8', timeout: 10000 });
  const version = /javac (?:1\.)?(\d+)/.exec(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (result.status !== 0 || !version)
    throw new Error('A JDK with javac and java on PATH is required');
  return Number(version[1]);
}
