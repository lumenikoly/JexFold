import type { Options } from '../types';

const KEY = 'jexfold.preferences.v1';
const LEGACY_KEY = 'jpeg-archiver.preferences.v1';
export const MAX_COMPRESSION_EFFORT = 9;
export const defaults: Options = {
  mode: 'jpegToJxl',
  outputDir: '',
  effort: MAX_COMPRESSION_EFFORT,
  performance: 'maximum',
  preserveMetadata: true,
  skipLarger: false,
};

export function loadPreferences(): Options {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || 'null',
    );
    if (typeof value !== 'object' || value === null) return { ...defaults };
    const raw = value as Record<string, unknown>;
    return {
      mode: raw.mode === 'jxlToJpeg' ? 'jxlToJpeg' : 'jpegToJxl',
      outputDir: typeof raw.outputDir === 'string' ? raw.outputDir : '',
      effort: MAX_COMPRESSION_EFFORT,
      performance:
        raw.performance === 'quiet' ||
        raw.performance === 'balanced' ||
        raw.performance === 'maximum'
          ? raw.performance
          : 'maximum',
      preserveMetadata:
        typeof raw.preserveMetadata === 'boolean'
          ? raw.preserveMetadata
          : typeof raw.preserveMtime === 'boolean'
            ? raw.preserveMtime
            : true,
      skipLarger: typeof raw.skipLarger === 'boolean' ? raw.skipLarger : false,
    };
  } catch {
    return { ...defaults };
  }
}
export function savePreferences(options: Options) {
  try {
    localStorage.setItem(KEY, JSON.stringify(options));
  } catch {
    /* Preferences are non-critical. */
  }
}
