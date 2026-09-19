import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('desktop config has a local CSP and bundled tools', () => {
  const config = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.equal(config.build.frontendDist, '../dist');
  assert.equal(config.bundle.resources['resources/codecs/'], 'codecs/');
  assert.match(config.app.security.csp, /object-src 'none'/);
  assert.doesNotMatch(config.app.security.csp, /unsafe-eval|https:\/\//);
});
test('no generic shell or file-write permissions are exposed to the webview', () => {
  const capability = JSON.parse(read('src-tauri/capabilities/main.json'));
  assert.deepEqual(capability.permissions, ['core:default', 'dialog:allow-open']);
});
test('JPEG compression is verified and JXL decoding uses the pixel path', () => {
  const source = read('crates/jxl-core/src/convert.rs');
  assert.match(source, /--lossless_jpeg=1/);
  assert.match(source, /--allow_jpeg_reconstruction=1/);
  assert.match(source, /--reconstruct_jpeg/);
  assert.match(source, /--pixels_to_jpeg/);
  assert.doesNotMatch(source, /--quality|--distance|remove_file|remove_dir/);
});
test('publication has no rename-overwrite or copy fallback', () => {
  const source = read('crates/jxl-core/src/files.rs').split('#[cfg(test)]')[0];
  assert.match(source, /fs::hard_link/);
  assert.doesNotMatch(source, /fs::rename|fs::copy|remove_file/);
});
test('English and Russian locale catalogs have identical message IDs', () => {
  const en = JSON.parse(read('src/i18n/locales/en.json'));
  const ru = JSON.parse(read('src/i18n/locales/ru.json'));
  assert.deepEqual(Object.keys(ru).sort(), Object.keys(en).sort());
});
test('queue shows percentage and megabyte size differences', () => {
  const queue = read('src/components/Queue.tsx');
  assert.match(queue, /queue\.differencePercent/);
  assert.match(queue, /queue\.differenceSize/);
  assert.match(queue, /sizeDifference \/ 1_000_000/);
  assert.match(queue, /unit: 'megabyte'/);
});
test('space-saving filter is disabled by default', () => {
  const preferences = read('src/lib/preferences.ts');
  assert.match(preferences, /skipLarger: false/);
});
test('compression effort is fixed at the maximum and has no UI control', () => {
  const preferences = read('src/lib/preferences.ts');
  const app = read('src/App.tsx');
  const settings = read('src/components/Settings.tsx');
  assert.match(preferences, /MAX_COMPRESSION_EFFORT = 9/);
  assert.match(preferences, /effort: MAX_COMPRESSION_EFFORT/);
  assert.doesNotMatch(app, /type="range"|compressionEffort|preset\.maximum/);
  assert.doesNotMatch(settings, /type="range"|compressionEffort/);
});
test('maximum computer usage is the default performance mode', () => {
  const preferences = read('src/lib/preferences.ts');
  const types = read('src/types.ts');
  const model = read('crates/jxl-core/src/model.rs');
  assert.match(preferences, /performance: 'maximum'/);
  assert.match(preferences, /: 'maximum',/);
  assert.match(types, /'quiet' \| 'balanced' \| 'maximum'/);
  assert.doesNotMatch(types, /'fast'/);
  assert.match(model, /\#\[default\]\s+Maximum,/);
  assert.doesNotMatch(model, /\bFast\b/);
});
test('footer stays at the bottom and shows the app version', () => {
  const app = read('src/App.tsx');
  const styles = read('src/styles.css');
  assert.match(app, /Created by nkoksharov\.dev/);
  assert.match(app, /version 0\.0\.3/);
  assert.match(styles, /\.app-shell \{[\s\S]*?min-height: 100vh;/);
  assert.match(styles, /\.app-layout \{[\s\S]*?flex: 1;/);
});
test('web build is static, scoped for Pages, and uses a verified worker pipeline', () => {
  const vite = read('vite.config.ts');
  const worker = read('src/platform/web/jxl-worker.ts');
  const webConverter = read('src/platform/web/useWebConverter.ts');
  const workflow = read('.github/workflows/pages.yml');
  const wrapper = read('wasm/src/jexfold_codec.cc');
  assert.match(vite, /VITE_BASE_PATH/);
  assert.match(worker, /equalBytes\(input, reconstructed\)/);
  assert.match(worker, /postMessage\([^\n]+, \[bytes\]\)/);
  assert.match(webConverter, /file\.type\.toLowerCase\(\) === 'image\/jpeg'/);
  assert.match(webConverter, /`\$\{relative\}\.jxl`/);
  assert.match(webConverter, /`\$\{relative\.slice\(0, -4\)\}\.jpg`/);
  assert.match(wrapper, /JxlEncoderAddJPEGFrame/);
  assert.match(wrapper, /JxlDecoderSetJPEGBuffer/);
  assert.match(wrapper, /JXL_DEC_NEED_IMAGE_OUT_BUFFER/);
  assert.match(wrapper, /JxlDecoderSetImageOutBuffer/);
  assert.match(worker, /OffscreenCanvas/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
  assert.match(workflow, /pnpm run wasm:build/);
});
test('web queue preserves pause, cancellation, and safe publication invariants', () => {
  const app = read('src/App.tsx');
  const converter = read('src/platform/web/useWebConverter.ts');
  const pool = read('src/platform/web/worker-pool.ts');
  assert.match(app, /if \(!busy\)\s+void app\.scanWebFiles/);
  assert.match(converter, /const destinations = new Map<string, string>\(\)/);
  assert.match(converter, /await directory\.removeEntry\(name\)/);
  assert.match(converter, /while \(pausedRef\.current && !cancelled\.current\)/);
  assert.match(
    converter,
    /Array\.from\(\{ length: Math\.min\(concurrency, scan\.files\.length\) \}/,
  );
  assert.match(converter, /notStarted: Math\.max\(0, scan\.files\.length - completed\)/);
  const readFinished = pool.indexOf('bytes = await file.arrayBuffer()');
  const cancellationRecheck = pool.indexOf('if (this.cancelled)', readFinished);
  const postMessage = pool.indexOf('slot.worker.postMessage', readFinished);
  assert.ok(
    readFinished >= 0 && cancellationRecheck > readFinished && postMessage > cancellationRecheck,
  );
});
