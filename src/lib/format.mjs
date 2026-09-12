/** @param {number} bytes */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['Б', 'КиБ', 'МиБ', 'ГиБ', 'ТиБ'];
  let index = 0;
  while (bytes >= 1024 && index < units.length - 1) { bytes /= 1024; index += 1; }
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: index === 0 ? 0 : 1 }).format(bytes)} ${units[index]}`;
}
/** @param {number} input @param {number} output */
export function savingPercent(input, output) {
  if (input <= 0 || !Number.isFinite(input) || !Number.isFinite(output)) return 0;
  return ((input - output) / input) * 100;
}
/** @param {string} path */
export function basename(path) { return path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || path; }
/** @param {number} milliseconds */
export function duration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds < 60 ? `${seconds} с` : `${Math.floor(seconds / 60)} мин ${seconds % 60} с`;
}
