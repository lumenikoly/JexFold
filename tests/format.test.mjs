import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, savingPercent, basename, duration } from '../src/lib/format.mjs';

test('formats binary sizes without confusing TB and TiB', () => {
  assert.equal(formatBytes(0), '0 Б');
  assert.equal(formatBytes(1024), '1 КиБ');
  assert.equal(formatBytes(1024 ** 4), '1 ТиБ');
  assert.equal(formatBytes(-1), '—');
  assert.equal(formatBytes(NaN), '—');
  assert.equal(formatBytes(Infinity), '—');
});
test('savings handles empty input and expansion', () => {
  assert.equal(savingPercent(0, 0), 0);
  assert.equal(savingPercent(100, 80), 20);
  assert.equal(savingPercent(100, 120), -20);
  assert.equal(savingPercent(NaN, 20), 0);
});
test('paths are displayed on all three desktop platforms', () => {
  assert.equal(basename('/home/Фото/a.JPG'), 'a.JPG');
  assert.equal(basename('C:\\Photos\\a.jpeg'), 'a.jpeg');
  assert.equal(basename('/some/folder/'), 'folder');
});
test('duration does not show negative time', () => {
  assert.equal(duration(-10), '0 с');
  assert.equal(duration(61_000), '1 мин 1 с');
});
