import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const codecsDir = path.join(root, 'src-tauri', 'resources', 'codecs');
export const extension = process.platform === 'win32' ? '.exe' : '';
export function resolveCommand(command) {
  if (process.platform === 'win32' && command === 'cmake') {
    const nativeCmake = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
      .filter(Boolean)
      .map((directory) => path.join(directory, 'CMake', 'bin', 'cmake.exe'))
      .find((candidate) => fs.existsSync(candidate));
    if (nativeCmake) return nativeCmake;
  }
  return command;
}
/** @param {string} command @param {string[]} args @param {import('node:child_process').SpawnSyncOptions} [options] */
export function run(command, args = [], options = {}) {
  const executable = resolveCommand(command);
  console.log(`> ${executable} ${args.join(' ')}`);
  const result = spawnSync(executable, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`${command} exited with ${result.status ?? result.signal}`);
  return result;
}
/** @param {string} command @param {string[]} args @param {string} [cwd] */
export function capture(command, args, cwd = root) {
  const executable = resolveCommand(command);
  console.log(`> ${executable} ${args.join(' ')}`);
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr || result.stdout}`);
  return `${result.stdout || ''}\n${result.stderr || ''}`.trim();
}
