import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const precacheWorkerAssets = () => ({
  name: 'jexfold-precache-worker-assets',
  apply: 'build' as const,
  async writeBundle(options: { dir?: string }, bundle: Record<string, unknown>) {
    const outputDirectory = resolve(options.dir ?? 'dist');
    const serviceWorkerPath = resolve(outputDirectory, 'sw.js');
    const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
    const generatedAssets = Object.keys(bundle).filter((file) => file !== 'index.html');
    await writeFile(
      serviceWorkerPath,
      serviceWorker.replace(
        'const PRECACHE_ASSETS = [];',
        `const PRECACHE_ASSETS = ${JSON.stringify(generatedAssets)};`,
      ),
    );
  },
});

export default defineConfig({
  plugins: [react(), precacheWorkerAssets()],
  base: process.env.VITE_BASE_PATH || '/',
  clearScreen: false,
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: { target: ['es2022', 'safari14'], sourcemap: false },
});
