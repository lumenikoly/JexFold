/** Build the pinned, single-threaded SIMD libjxl WebAssembly module. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { root, run, capture } from './common.mjs';

const VERSION = 'v0.12.0';
const EXPECTED_COMMIT_PREFIX = 'a7a9c78';
const source = path.join(root, '.tools', `libjxl-${VERSION}`);
const build = path.join(root, '.tools', `wasm-${VERSION}`);
const output = path.join(root, 'public', 'wasm');
const cmakePath = value => value.split(path.sep).join('/');
function runEmcmake(args) {
  if (process.platform !== 'win32') return run('emcmake', args);
  if (!process.env.EMSDK) throw new Error('Load emsdk_env.ps1 before building on Windows.');
  return run(path.join(process.env.EMSDK, 'upstream', 'emscripten', 'emcmake.bat'), args, { shell: true });
}

try {
  run('git', ['--version']); run('cmake', ['--version']);
  fs.mkdirSync(path.dirname(source), { recursive: true });
  if (!fs.existsSync(source)) run('git', ['clone', '--depth', '1', '--branch', VERSION, 'https://github.com/libjxl/libjxl.git', source]);
  const commit = capture('git', ['rev-parse', 'HEAD'], source).trim();
  if (!commit.startsWith(EXPECTED_COMMIT_PREFIX)) throw new Error(`Unexpected libjxl checkout: ${commit}.`);
  run('git', ['submodule', 'update', '--init', '--depth', '1', 'third_party/brotli', 'third_party/highway', 'third_party/skcms'], { cwd: source });
  runEmcmake(['cmake', '-S', cmakePath(path.join(root, 'wasm')), '-B', cmakePath(build), '-DCMAKE_BUILD_TYPE=Release', `-DLIBJXL_SOURCE_DIR=${cmakePath(source)}`]);
  run('cmake', ['--build', cmakePath(build), '--target', 'jexfold_codec', '--parallel', String(Math.min(4, os.availableParallelism()))]);
  fs.mkdirSync(output, { recursive: true });
  for (const name of ['jexfold_codec.js', 'jexfold_codec.wasm']) {
    const built = path.join(build, name);
    if (!fs.existsSync(built)) throw new Error(`${name} was not produced.`);
    fs.copyFileSync(built, path.join(output, name));
  }
  fs.writeFileSync(path.join(output, 'build-info.json'), JSON.stringify({ libjxlVersion: VERSION, commit, simd: true, threads: false }, null, 2) + '\n');
  console.log(`WebAssembly codec ready in ${output}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
