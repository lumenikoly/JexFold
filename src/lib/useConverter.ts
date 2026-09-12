import { useCallback, useEffect, useRef, useState } from 'react';
import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { ConversionMode, Metrics, Options, Progress, RowState, ScanResult, Summary, ToolInfo } from '../types';

const emptyMetrics = (): Metrics => ({ processed: 0, converted: 0, failed: 0, skipped: 0, inputBytes: 0, outputBytes: 0 });
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function useConverter() {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [tools, setTools] = useState<ToolInfo | null>(null);
  const [busy, setBusy] = useState<'scan' | 'convert' | 'probe' | null>(null);
  const [paused, setPaused] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [revision, setRevision] = useState(0);
  const rows = useRef(new Map<number, RowState>());
  const liveMetrics = useRef(emptyMetrics());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const pausePending = useRef(false);
  const alive = useRef(true);
  const desktop = isTauri();

  const flush = useCallback(() => {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
    if (alive.current) { setMetrics({ ...liveMetrics.current }); setRevision(n => n + 1); }
  }, []);
  const scheduleFlush = useCallback(() => {
    if (timer.current === null) timer.current = setTimeout(flush, 80);
  }, [flush]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (timer.current !== null) clearTimeout(timer.current); };
  }, []);

  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void listen('operation-active', () => {
      setError('Сначала остановите текущую операцию. Окно можно закрыть после завершения очистки временных файлов.');
    }).then(fn => { if (disposed) fn(); else cleanup = fn; }).catch(e => setError(errorText(e)));
    return () => { disposed = true; cleanup?.(); };
  }, [desktop]);

  const enter = useCallback((operation: 'scan' | 'convert' | 'probe') => {
    if (busyRef.current || !desktop) return false;
    busyRef.current = true; setBusy(operation); setError(''); setCancelling(false);
    return true;
  }, [desktop]);
  const leave = useCallback(() => { busyRef.current = false; if (alive.current) { setBusy(null); setPaused(false); setCancelling(false); } }, []);

  const probe = useCallback(async (directory: string | null = null) => {
    if (!enter('probe')) return;
    setTools(null);
    try { const info = await invoke<ToolInfo>('probe_tools', { directory }); if (alive.current) setTools(info); }
    catch (e) { if (alive.current) setError(errorText(e)); }
    finally { leave(); }
  }, [enter, leave]);

  // No automatic probe in a StrictMode effect: App performs it once through
  // a ref-guarded effect; the async operation can outlive the effect cleanup.
  const scanPaths = useCallback(async (paths: string[], mode: ConversionMode) => {
    if (!paths.length || !enter('scan')) return;
    generation.current += 1;
    setScan(null); setSummary(null); rows.current.clear(); liveMetrics.current = emptyMetrics(); flush();
    try { const result = await invoke<ScanResult>('scan_sources', { paths, mode }); if (alive.current) setScan(result); }
    catch (e) { if (alive.current) setError(errorText(e)); }
    finally { leave(); }
  }, [enter, leave, flush]);

  const start = useCallback(async (options: Options) => {
    if (!scan || !tools || !enter('convert')) return;
    setSummary(null); setPaused(false); rows.current.clear(); liveMetrics.current = emptyMetrics(); flush();
    const currentGeneration = ++generation.current;
    let summaryReceived = false;
    const channel = new Channel<Progress>();
    channel.onmessage = event => {
      if (currentGeneration !== generation.current || !alive.current) return;
      if (event.type === 'stage') {
        if (!rows.current.get(event.id)?.result) rows.current.set(event.id, { status: event.stage });
      } else {
        const result = event.result;
        // Ignore a duplicate completion rather than double-counting metrics.
        if (rows.current.get(result.id)?.result) return;
        rows.current.set(result.id, { status: result.status, result });
        // IPC completion can arrive before a queued event is delivered.
        // Late rows still update, but the final summary owns the counters.
        const m = liveMetrics.current;
        if (!summaryReceived) {
          m.processed += 1;
          if (result.status === 'converted') {
            m.converted += 1; m.inputBytes += result.inputBytes; m.outputBytes += result.outputBytes ?? 0;
          } else if (result.status === 'failed') m.failed += 1;
          else if (result.status === 'existing' || result.status === 'notSmaller') m.skipped += 1;
        }
      }
      scheduleFlush();
    };
    try {
      const result = await invoke<Summary>('convert', { options, onEvent: channel });
      summaryReceived = true;
      liveMetrics.current = {
        processed: result.total - result.notStarted,
        converted: result.converted, failed: result.failed,
        skipped: result.existing + result.notSmaller,
        inputBytes: result.inputBytes, outputBytes: result.outputBytes,
      };
      if (alive.current) setSummary(result);
    }
    catch (e) { if (alive.current) setError(errorText(e)); }
    finally { flush(); leave(); }
  }, [scan, tools, enter, flush, scheduleFlush, leave]);

  const cancel = useCallback(async () => {
    setCancelling(true);
    try { await invoke('cancel'); }
    catch (e) { setCancelling(false); setError(errorText(e)); }
  }, []);
  const togglePause = useCallback(async () => {
    if (pausePending.current || !busyRef.current) return;
    pausePending.current = true;
    const value = !paused;
    try {
      await invoke('set_paused', { paused: value });
      if (alive.current && busyRef.current) setPaused(value);
    }
    catch (e) { if (alive.current) setError(errorText(e)); }
    finally { pausePending.current = false; }
  }, [paused]);
  const clear = useCallback(() => {
    if (busyRef.current) return;
    generation.current += 1;
    setScan(null); setSummary(null); rows.current.clear(); liveMetrics.current = emptyMetrics(); setError(''); flush();
  }, [flush]);

  return { desktop, scan, tools, busy, paused, cancelling, error, setError, summary, metrics, rows: rows.current,
    revision, scanPaths, probe, start, cancel, togglePause, clear };
}
