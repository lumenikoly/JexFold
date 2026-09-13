import { spawnSync } from 'node:child_process';
import { resolveCommand } from './common.mjs';

const tools = [
  { command: 'cargo', label: 'Rust/Cargo' },
  { command: 'cmake', label: 'CMake' },
  { command: 'git', label: 'Git' },
];

const missing = tools.filter(({ command }) => {
  const result = spawnSync(resolveCommand(command), ['--version'], { stdio: 'ignore', shell: false });
  return result.error || result.status !== 0;
});

if (missing.length === 0) process.exit(0);

console.error(`Missing release tools: ${missing.map(({ label }) => label).join(', ')}`);
if (missing.some(({ command }) => command === 'cargo')) {
  if (process.platform === 'win32') {
    console.error('Install Rust with: winget install --id Rustlang.Rustup -e');
    console.error('Then restart the terminal so %USERPROFILE%\\.cargo\\bin is added to PATH.');
  } else {
    console.error('Install Rust from https://rustup.rs/ and restart the terminal.');
  }
}
console.error('See the platform prerequisites in README.md before retrying the release target.');
process.exit(1);
