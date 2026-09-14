import fs from 'node:fs';
import path from 'node:path';
import { codecsDir, extension, capture } from './common.mjs';

try {
  for (const name of ['cjxl', 'djxl']) {
    if (!fs.existsSync(path.join(codecsDir, name + extension)))
      throw new Error(`Missing ${name}. Run pnpm run codecs:build first.`);
  }
  const encoder = path.join(codecsDir, 'cjxl' + extension);
  const decoder = path.join(codecsDir, 'djxl' + extension);
  console.log(capture(encoder, ['--version']));
  console.log(capture(decoder, ['--version']));
  const help = capture(decoder, ['--help', '-v']);
  if (!help.includes('--reconstruct_jpeg'))
    throw new Error('djxl must support --reconstruct_jpeg (libjxl 0.12+).');
  const encoderHelp = capture(encoder, ['--help', '-v', '-v']);
  for (const flag of ['--lossless_jpeg', '--allow_jpeg_reconstruction']) {
    if (!encoderHelp.includes(flag)) throw new Error(`cjxl does not support ${flag}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
