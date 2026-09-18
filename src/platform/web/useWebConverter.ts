import { useCallback, useRef, useState } from 'react';
import type {
  ConversionMode,
  Metrics,
  Options,
  RowState,
  ScanResult,
  SourceFile,
  Summary,
  ToolInfo,
} from '../../types';
import { webCapabilities } from '../backend';
import { WorkerPool } from './worker-pool';

type SelectedFile = { file: File; relative: string };
const emptyMetrics = (): Metrics => ({
  processed: 0,
  converted: 0,
  failed: 0,
  skipped: 0,
  inputBytes: 0,
  outputBytes: 0,
});
const accepted = (file: File, mode: ConversionMode) =>
  mode === 'jpegToJxl'
    ? /\.(jpe?g)$/i.test(file.name) || file.type.toLowerCase() === 'image/jpeg'
    : /\.jxl$/i.test(file.name) || file.type.toLowerCase() === 'image/jxl';
const outputName = (relative: string, mode: ConversionMode) =>
  mode === 'jpegToJxl'
    ? /\.jpe?g$/i.test(relative)
      ? relative.replace(/\.jpe?g$/i, '.jxl')
      : `${relative}.jxl`
    : /\.jxl$/i.test(relative)
      ? `${relative.slice(0, -4)}.jpg`
      : `${relative}.jpg`;

async function enumerate(handle: FileSystemDirectoryHandle, prefix = ''): Promise<SelectedFile[]> {
  const files: SelectedFile[] = [];
  for await (const [name, entry] of handle.entries()) {
    const relative = prefix ? `${prefix}/${name}` : name;
    if (entry.kind === 'directory') files.push(...(await enumerate(entry, relative)));
    else files.push({ file: await entry.getFile(), relative });
  }
  return files;
}

async function writeOutput(root: FileSystemDirectoryHandle, relative: string, bytes: ArrayBuffer) {
  const parts = relative.split('/').filter((part) => part && part !== '.' && part !== '..');
  const name = parts.pop();
  if (!name) throw new Error('Invalid output filename.');
  let directory = root;
  for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: true });
  try {
    await directory.getFileHandle(name);
    return false;
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
  }
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes);
    await writable.close();
  } catch (error) {
    await writable.abort();
    throw error;
  }
  return true;
}

export function useWebConverter() {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [tools, setTools] = useState<ToolInfo | null>({
    directory: 'WebAssembly',
    encoderVersion: 'libjxl 0.12.0',
    decoderVersion: 'libjxl 0.12.0',
  });
  const [busy, setBusy] = useState<'scan' | 'convert' | 'probe' | null>(null);
  const [paused, setPaused] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [revision, setRevision] = useState(0);
  const [outputLabel, setOutputLabel] = useState('');
  const [downloadReady, setDownloadReady] = useState(0);
  const rows = useRef(new Map<number, RowState>());
  const selected = useRef(new Map<number, File>());
  const outputDirectory = useRef<FileSystemDirectoryHandle | null>(null);
  const downloads = useRef(new Map<number, { name: string; blob: Blob }>());
  const pool = useRef<WorkerPool | null>(null);
  const pausedRef = useRef(false);
  const cancelled = useRef(false);

  const flush = useCallback(() => setRevision((value) => value + 1), []);
  const scanFiles = useCallback(async (entries: SelectedFile[], mode: ConversionMode) => {
    setBusy('scan');
    setError('');
    setSummary(null);
    downloads.current.clear();
    setDownloadReady(0);
    try {
      const usable = entries.filter((entry) => accepted(entry.file, mode));
      const incompatibleCount = entries.length - usable.length;
      const files: SourceFile[] = usable.map((entry, id) => ({
        id,
        source: entry.file.name,
        relative: entry.relative,
        size: entry.file.size,
      }));
      selected.current = new Map(usable.map((entry, id) => [id, entry.file]));
      rows.current.clear();
      setMetrics(emptyMetrics());
      setScan({
        files,
        roots: [],
        directoryRoots: [],
        warnings: [],
        warningCount: 0,
        totalBytes: files.reduce((sum, file) => sum + file.size, 0),
        mode,
        incompatibleCount,
      });
    } finally {
      setBusy(null);
    }
  }, []);
  const scanWebFiles = useCallback(
    (files: File[], mode: ConversionMode) =>
      scanFiles(
        files.map((file) => ({ file, relative: file.webkitRelativePath || file.name })),
        mode,
      ),
    [scanFiles],
  );
  const selectDirectory = useCallback(
    async (mode: ConversionMode) => {
      if (!window.showDirectoryPicker)
        throw new Error('Directory selection is unavailable in this browser.');
      const handle = await window.showDirectoryPicker({ mode: 'read', id: 'jexfold-source' });
      await scanFiles(await enumerate(handle), mode);
    },
    [scanFiles],
  );
  const selectOutputDirectory = useCallback(async () => {
    if (!window.showDirectoryPicker) return;
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'jexfold-output' });
    outputDirectory.current = handle;
    setOutputLabel(handle.name);
  }, []);
  const probe = useCallback(async () => {
    setTools({
      directory: 'WebAssembly',
      encoderVersion: 'libjxl 0.12.0',
      decoderVersion: 'libjxl 0.12.0',
    });
  }, []);

  const start = useCallback(
    async (options: Options) => {
      if (!scan || busy) return;
      if (scan.files.length === 0) {
        setError('No supported files were selected.');
        return;
      }
      setBusy('convert');
      setSummary(null);
      setError('');
      setPaused(false);
      setCancelling(false);
      setMetrics(emptyMetrics());
      rows.current.clear();
      downloads.current.clear();
      setDownloadReady(0);
      cancelled.current = false;
      pausedRef.current = false;
      // Keep the File objects used by this run independent from later picker/UI
      // updates. Some mobile browsers clear the live FileList immediately after
      // the change handler returns.
      const inputFiles = new Map(selected.current);
      const started = performance.now();
      const concurrency =
        options.performance === 'quiet'
          ? 1
          : options.performance === 'fast' || options.performance === 'maximum'
            ? webCapabilities.maxRecommendedConcurrency
            : Math.min(2, webCapabilities.maxRecommendedConcurrency);
      const activePool = new WorkerPool(
        concurrency,
        new URL('wasm/jexfold_codec.js', document.baseURI).href,
      );
      pool.current = activePool;
      const totals = emptyMetrics();
      const results = { converted: 0, existing: 0, notSmaller: 0, failed: 0, cancelled: 0 };
      const processFile = async (source: SourceFile) => {
        while (pausedRef.current && !cancelled.current)
          await new Promise((resolve) => setTimeout(resolve, 80));
        if (cancelled.current) {
          results.cancelled += 1;
          rows.current.set(source.id, { status: 'cancelled' });
          flush();
          return;
        }
        const file = inputFiles.get(source.id);
        if (!file) {
          results.failed += 1;
          totals.failed += 1;
          rows.current.set(source.id, {
            status: 'failed',
            result: {
              id: source.id,
              source: source.source,
              output: '',
              status: 'failed',
              inputBytes: source.size,
              outputBytes: null,
              sha256: null,
              elapsedMs: 0,
              message: 'The browser no longer provides access to the selected file.',
            },
          });
          totals.processed += 1;
          setMetrics({ ...totals });
          flush();
          return;
        }
        try {
          const bytes = await activePool.convert(
            source.id,
            file,
            options.mode,
            options.effort,
            (stage) => {
              rows.current.set(source.id, { status: stage });
              flush();
            },
          );
          if (options.mode === 'jpegToJxl' && options.skipLarger && bytes.byteLength >= file.size) {
            results.notSmaller += 1;
            totals.skipped += 1;
            rows.current.set(source.id, {
              status: 'notSmaller',
              result: {
                id: source.id,
                source: source.source,
                output: '',
                status: 'notSmaller',
                inputBytes: file.size,
                outputBytes: bytes.byteLength,
                sha256: null,
                elapsedMs: 0,
                message: null,
              },
            });
          } else {
            const name = outputName(source.relative, options.mode);
            if (
              outputDirectory.current &&
              !(await writeOutput(outputDirectory.current, name, bytes))
            ) {
              results.existing += 1;
              totals.skipped += 1;
              rows.current.set(source.id, {
                status: 'existing',
                result: {
                  id: source.id,
                  source: source.source,
                  output: name,
                  status: 'existing',
                  inputBytes: file.size,
                  outputBytes: null,
                  sha256: null,
                  elapsedMs: 0,
                  message: null,
                },
              });
            } else {
              if (!outputDirectory.current)
                downloads.current.set(source.id, {
                  name: name.replaceAll('/', '__'),
                  blob: new Blob([bytes], {
                    type: options.mode === 'jpegToJxl' ? 'image/jxl' : 'image/jpeg',
                  }),
                });
              results.converted += 1;
              totals.converted += 1;
              totals.inputBytes += file.size;
              totals.outputBytes += bytes.byteLength;
              rows.current.set(source.id, {
                status: 'converted',
                result: {
                  id: source.id,
                  source: source.source,
                  output: name,
                  status: 'converted',
                  inputBytes: file.size,
                  outputBytes: bytes.byteLength,
                  sha256: null,
                  elapsedMs: 0,
                  message: null,
                },
              });
            }
          }
        } catch (caught) {
          if (
            cancelled.current ||
            (caught instanceof DOMException && caught.name === 'AbortError')
          ) {
            results.cancelled += 1;
            rows.current.set(source.id, { status: 'cancelled' });
          } else {
            results.failed += 1;
            totals.failed += 1;
            rows.current.set(source.id, {
              status: 'failed',
              result: {
                id: source.id,
                source: source.source,
                output: '',
                status: 'failed',
                inputBytes: file.size,
                outputBytes: null,
                sha256: null,
                elapsedMs: 0,
                message: caught instanceof Error ? caught.message : String(caught),
              },
            });
          }
        } finally {
          totals.processed += 1;
          setMetrics({ ...totals });
          flush();
        }
      };
      await Promise.all(scan.files.map(processFile));
      activePool.close();
      if (pool.current === activePool) pool.current = null;
      const notStarted = Math.max(0, scan.files.length - totals.processed);
      const value: Summary = {
        total: scan.files.length,
        ...results,
        notStarted,
        inputBytes: totals.inputBytes,
        outputBytes: totals.outputBytes,
        elapsedMs: Math.round(performance.now() - started),
        wasCancelled: cancelled.current,
      };
      setDownloadReady(downloads.current.size);
      setSummary(value);
      setBusy(null);
      setPaused(false);
      setCancelling(false);
    },
    [busy, flush, scan],
  );

  const cancel = useCallback(async () => {
    cancelled.current = true;
    setCancelling(true);
    pool.current?.cancel();
  }, []);
  const togglePause = useCallback(async () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }, []);
  const clear = useCallback(() => {
    if (busy) return;
    setScan(null);
    setSummary(null);
    rows.current.clear();
    selected.current.clear();
    downloads.current.clear();
    setDownloadReady(0);
    setError('');
    setMetrics(emptyMetrics());
    flush();
  }, [busy, flush]);
  const downloadAll = useCallback(() => {
    for (const { name, blob } of downloads.current.values()) {
      const anchor = document.createElement('a');
      const url = URL.createObjectURL(blob);
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
  }, []);

  return {
    desktop: false,
    capabilities: webCapabilities,
    scan,
    tools,
    busy,
    paused,
    cancelling,
    error,
    setError,
    summary,
    metrics,
    progressPercent: null,
    rows: rows.current,
    revision,
    probe,
    start,
    cancel,
    togglePause,
    clear,
    scanPaths: undefined,
    scanWebFiles,
    selectDirectory,
    selectOutputDirectory,
    outputLabel,
    downloadReady,
    downloadAll,
  };
}
