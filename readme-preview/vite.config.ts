import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectDir = fileURLToPath(new URL('.', import.meta.url));
const bundleDir = resolve(projectDir, 'bundle');

export default defineConfig({
  root: projectDir,
  base: './',
  plugins: [
    react(),
    {
      name: 'copy-hyperframes-metadata',
      async closeBundle() {
        await Promise.all([
          copyFile(resolve(projectDir, 'hyperframes.json'), resolve(bundleDir, 'hyperframes.json')),
          copyFile(
            resolve(projectDir, 'index.motion.json'),
            resolve(bundleDir, 'index.motion.json'),
          ),
        ]);
      },
    },
  ],
  build: {
    outDir: bundleDir,
    emptyOutDir: true,
    sourcemap: false,
  },
});
