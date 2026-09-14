import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './common.mjs';

const ignored = new Set(['.git', '.tools', 'dist', 'node_modules', 'target']);
const shellFiles = [];

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !ignored.has(entry.name)) visit(path.join(directory, entry.name));
    else if (entry.isFile() && entry.name.endsWith('.sh'))
      shellFiles.push(path.join(directory, entry.name));
  }
}

visit(root);
if (shellFiles.length === 0) {
  console.log('No shell scripts found.');
  process.exit(0);
}

const result = spawnSync('shellcheck', shellFiles, { cwd: root, stdio: 'inherit', shell: false });
if (result.error) {
  console.error(`Unable to run ShellCheck: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
