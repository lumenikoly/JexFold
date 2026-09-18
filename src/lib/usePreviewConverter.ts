import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ItemResult, Metrics, RowState, ScanResult, Summary, ToolInfo } from '../types';
import type { BackendCapabilities } from '../platform/backend';
import { webCapabilities } from '../platform/backend';

export type PreviewPhase = 'empty' | 'queued' | 'converting' | 'complete';

export interface PreviewController {
  setPhase: (phase: PreviewPhase) => void;
  setProgress: (value: number) => void;
}

declare global {
  interface Window {
    __JEXFOLD_README_PREVIEW__?: boolean;
    __jexfoldPreviewController?: PreviewController;
  }
}

const megabyte = 1024 * 1024;
const inputBytes = 184 * megabyte;
const outputBytes = 147 * megabyte;

const files = [
  { id: 0, source: 'IMG_4821.JPG', relative: 'IMG_4821.JPG', size: 7.4 * megabyte },
  { id: 1, source: 'IMG_4822.JPG', relative: 'IMG_4822.JPG', size: 8.1 * megabyte },
  { id: 2, source: 'IMG_4823.JPG', relative: 'IMG_4823.JPG', size: 5.7 * megabyte },
  { id: 3, source: 'DSC_0192.JPG', relative: 'DSC_0192.JPG', size: 14.2 * megabyte },
].map((file) => ({ ...file, size: Math.round(file.size) }));

const scanFixture: ScanResult = {
  files,
  roots: [],
  directoryRoots: [],
  warnings: [],
  warningCount: 0,
  totalBytes: inputBytes,
  mode: 'jpegToJxl',
  incompatibleCount: 0,
};

const tools: ToolInfo = {
  directory: 'WebAssembly',
  encoderVersion: 'libjxl 0.12.0',
  decoderVersion: 'libjxl 0.12.0',
};

const previewCapabilities: BackendCapabilities = {
  ...webCapabilities,
  directDirectoryOutput: false,
};

const resultFor = (file: (typeof files)[number]): ItemResult => ({
  id: file.id,
  source: file.source,
  output: file.relative.replace(/\.jpe?g$/i, '.jxl'),
  status: 'converted',
  inputBytes: file.size,
  outputBytes: Math.round((file.size / inputBytes) * outputBytes),
  sha256: null,
  elapsedMs: 0,
  message: null,
});

export function usePreviewConverter(enabled = true) {
  const [phase, setPhaseState] = useState<PreviewPhase>('empty');
  const [progressPercent, setProgressPercent] = useState(0);
  const setPhase = useCallback((next: PreviewPhase) => setPhaseState(next), []);
  const setProgress = useCallback((value: number) => setProgressPercent(value), []);

  useEffect(() => {
    if (!enabled) return;
    const controller: PreviewController = { setPhase, setProgress };
    window.__jexfoldPreviewController = controller;
    document.body.dataset.jexfoldPreview = 'active';
    return () => {
      if (window.__jexfoldPreviewController === controller)
        delete window.__jexfoldPreviewController;
    };
  }, [enabled, setPhase, setProgress]);

  const scan = phase === 'empty' ? null : scanFixture;
  const busy = phase === 'converting' ? ('convert' as const) : null;
  const ratio = Math.max(0, Math.min(1, progressPercent / 100));
  const processed = phase === 'complete' ? files.length : Math.round(files.length * ratio);
  const complete = phase === 'complete';
  const metrics: Metrics = useMemo(
    () => ({
      processed,
      converted: complete ? files.length : 0,
      failed: 0,
      skipped: 0,
      inputBytes: complete ? inputBytes : Math.round(inputBytes * ratio),
      outputBytes: complete ? outputBytes : Math.round(outputBytes * ratio),
    }),
    [complete, processed, ratio],
  );

  const rows = useMemo(() => {
    const next = new Map<number, RowState>();
    if (phase === 'empty' || phase === 'queued') return next;
    files.forEach((file, index) => {
      if (complete || index < Math.floor(ratio * files.length))
        next.set(file.id, { status: 'converted', result: resultFor(file) });
      else if (
        ratio >= 0.58 &&
        index === Math.min(files.length - 1, Math.floor(ratio * files.length))
      )
        next.set(file.id, { status: 'verifying' });
      else next.set(file.id, { status: 'encoding' });
    });
    return next;
  }, [complete, phase, ratio]);

  const summary: Summary | null = complete
    ? {
        total: files.length,
        converted: files.length,
        existing: 0,
        notSmaller: 0,
        failed: 0,
        cancelled: 0,
        notStarted: 0,
        inputBytes,
        outputBytes,
        elapsedMs: 7000,
        wasCancelled: false,
      }
    : null;

  return {
    desktop: false,
    capabilities: previewCapabilities,
    scan,
    tools,
    busy,
    paused: false,
    cancelling: false,
    error: '',
    setError: () => undefined,
    summary,
    metrics,
    progressPercent,
    rows,
    revision: progressPercent,
    scanPaths: undefined,
    probe: async () => undefined,
    start: async () => undefined,
    cancel: async () => undefined,
    togglePause: async () => undefined,
    clear: () => setPhase('empty'),
    scanWebFiles: undefined,
    selectDirectory: undefined,
    selectOutputDirectory: undefined,
    outputLabel: 'Загрузки браузера',
    downloadReady: complete ? files.length : 0,
    downloadAll: undefined,
  };
}
