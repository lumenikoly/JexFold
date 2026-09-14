import { codecsDir, run } from './common.mjs';
try {
  run('cargo', ['test', '-p', 'jxl-core', '--test', 'roundtrip', '--', '--ignored'], {
    env: { ...process.env, JXL_TOOLS_DIR: codecsDir },
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
