import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
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
test('codec invocation requires JPEG reconstruction and never adds a lossy quality flag', () => {
  const source = read('crates/jxl-core/src/convert.rs');
  assert.match(source, /--lossless_jpeg=1/);
  assert.match(source, /--allow_jpeg_reconstruction=1/);
  assert.match(source, /--reconstruct_jpeg/);
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
