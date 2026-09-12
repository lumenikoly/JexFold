import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const codecsDir = path.join(root, 'src-tauri', 'resources', 'codecs');
export const extension = process.platform === 'win32' ? '.exe' : '';
/** @param {string} command @param {string[]} args @param {import('node:child_process').SpawnSyncOptions} [options] */
export function run(command, args = [], options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false, ...options });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status ?? result.signal}`);
  return result;
}
/** @param {string} command @param {string[]} args @param {string} [cwd] */
export function capture(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false, timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr || result.stdout}`);
  return `${result.stdout || ''}\n${result.stderr || ''}`.trim();
}
