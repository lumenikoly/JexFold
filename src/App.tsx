import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useConverter } from './lib/useConverter';
import { loadPreferences, savePreferences } from './lib/preferences';
import { duration, formatBytes, savingPercent } from './lib/format.mjs';
import { useLanguage } from './i18n';
import { Icon } from './components/Icon';
import { Queue } from './components/Queue';
import { Settings } from './components/Settings';

export default function App() {
  const app = useConverter();
  const intl = useIntl();
  const { locale } = useLanguage();
  const t = (id: string, values?: Record<string, string | number>) => intl.formatMessage({ id }, values);
  const [options, setOptions] = useState(loadPreferences);
  const [dragging, setDragging] = useState(false);
  const init = useRef(false);
  const busy = app.busy !== null;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => { savePreferences(options); }, [options]);
  useEffect(() => { if (!init.current && app.desktop) { init.current = true; void app.probe(); } }, [app.desktop, app.probe]);
  useEffect(() => {
    if (!app.desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview().onDragDropEvent(event => {
      if (busyRef.current) { setDragging(false); return; }
      if (event.payload.type === 'enter' || event.payload.type === 'over') setDragging(true);
      else { setDragging(false); if (event.payload.type === 'drop') void app.scanPaths(event.payload.paths, options.mode); }
    }).then(fn => { if (disposed) fn(); else unlisten = fn; }).catch(e => app.setError(String(e)));
    return () => { disposed = true; unlisten?.(); };
  }, [app.desktop, app.scanPaths, app.setError, options.mode]);

  async function pickSources(directory: boolean) {
    try {
      const format = options.mode === 'jpegToJxl' ? 'JPEG' : 'JXL';
      const selected = await open({ directory, multiple: !directory, title: directory ? t('dialog.selectFolderWith', { format }) : t('dialog.selectFiles'),
        filters: directory ? undefined : options.mode === 'jpegToJxl' ? [{ name: 'JPEG', extensions: ['jpg', 'jpeg', 'JPG', 'JPEG'] }] : [{ name: 'JPEG XL', extensions: ['jxl', 'JXL'] }] });
      if (selected) await app.scanPaths(Array.isArray(selected) ? selected : [selected], options.mode);
    } catch (e) { app.setError(String(e)); }
  }
  async function pickOutput() {
    try {
      const selected = await open({ directory: true, multiple: false, title: t('dialog.outputFolder', { format: options.mode === 'jpegToJxl' ? 'JXL' : 'JPEG' }) });
      if (typeof selected === 'string') setOptions(current => ({ ...current, outputDir: selected }));
    } catch (e) { app.setError(String(e)); }
  }
  async function pickCodecs() {
    try { const selected = await open({ directory: true, multiple: false, title: t('dialog.codecFolder') }); if (typeof selected === 'string') await app.probe(selected); }
    catch (e) { app.setError(String(e)); }
  }

  const total = app.scan?.files.length ?? 0;
  const progress = total === 0 ? 0 : Math.round(app.metrics.processed / total * 100);
  const savings = app.metrics.inputBytes - app.metrics.outputBytes;
  const working = app.busy === 'convert';
  const stateText = app.cancelling ? t('progress.stopping') : app.busy === 'scan' ? t('progress.scanning') : app.busy === 'probe' ? t('progress.probing')
    : working && app.paused ? t('progress.paused') : working ? t(options.mode === 'jpegToJxl' ? 'progress.compressing' : 'progress.restoring')
    : app.summary ? t(app.summary.wasCancelled ? 'progress.stopped' : app.summary.failed ? 'progress.completedWithErrors' : 'progress.completed') : t('progress.ready');

  return <div className="app-shell">
    <header className="app-header"><div className="brand"><div className="brand-mark">J<span>×</span>L</div><div><h1>JPEG Archiver</h1><p>{t('app.tagline')}</p></div></div></header>
    {!app.desktop && <div className="notice">{t('app.previewNotice')}</div>}
    {app.error && <div className="alert" role="alert"><div><strong>{t('error.actionFailed')}</strong><details><summary>{t('common.details')}</summary><pre>{app.error}</pre></details></div><button className="icon-button" aria-label={t('common.closeMessage')} onClick={() => app.setError('')}>×</button></div>}

    <div className="workspace">
      <main className="panel source-panel">
        <div className="panel-title"><h2>{t('source.title')}</h2>{app.scan && <button className="text-button push-right" disabled={busy} onClick={app.clear}>{t('source.clear')}</button>}</div>
        <div className={`dropzone ${dragging ? 'is-dragging' : ''}`}><div className="drop-icon"><Icon name="folder" size={29} /></div>
          <h3>{dragging ? t('source.dropRelease') : t('source.dropPrompt', { format: options.mode === 'jpegToJxl' ? 'JPEG' : 'JXL' })}</h3><p>{t('source.dropHint')}</p>
          <div className="source-buttons"><button className="button" disabled={busy || !app.desktop} onClick={() => void pickSources(false)}><Icon name="plus" size={16} /> {t('source.selectFiles')}</button><button className="button" disabled={busy || !app.desktop} onClick={() => void pickSources(true)}><Icon name="folder" size={16} /> {t('source.selectFolder')}</button></div>
        </div>
        {app.scan && <div className="queue-heading"><h3>{t('source.selected')} <span>{intl.formatNumber(total)}</span></h3><span>{formatBytes(app.scan.totalBytes, locale)}</span></div>}
        <Queue scan={app.scan} rows={app.rows} finished={app.summary !== null} mode={options.mode} />
        {app.scan && app.scan.warningCount > 0 && <details className="scan-warnings"><summary>{t('source.scanWarnings', { count: app.scan.warningCount })}</summary><pre>{app.scan.warnings.join('\n')}</pre>{app.scan.warningCount > app.scan.warnings.length && <p>{t('source.warningsShown', { count: app.scan.warnings.length })}</p>}</details>}
      </main>
      <Settings options={options} setOptions={next => { if (next.mode !== options.mode) app.clear(); setOptions(next); }} disabled={busy || !app.desktop} chooseOutput={() => void pickOutput()} />
    </div>

    <section className="panel progress-panel" aria-label={t('progress.label')}>
      <div className="progress-top"><div className="progress-caption"><span className={`activity-dot ${busy ? 'active' : ''}`} /><strong aria-live="polite">{stateText}</strong></div><span className="progress-numbers">{intl.formatNumber(app.metrics.processed)} / {intl.formatNumber(total)}</span></div>
      <progress max="100" value={progress} aria-label={t('progress.filesComplete')} />
      <div className="progress-bottom"><div className="stat"><span>{t('progress.done')}</span><strong>{intl.formatNumber(app.metrics.converted)}</strong></div><div className="stat"><span>{t('progress.skipped')}</span><strong>{intl.formatNumber(app.metrics.skipped)}</strong></div><div className="stat"><span>{t('progress.errors')}</span><strong className={app.metrics.failed ? 'error-number' : ''}>{intl.formatNumber(app.metrics.failed)}</strong></div>
        <div className="stat savings"><span>{t(options.mode === 'jxlToJpeg' ? 'progress.jpegSize' : savings < 0 ? 'progress.sizeIncreased' : 'progress.saved')}</span><strong>{options.mode === 'jxlToJpeg' ? formatBytes(app.metrics.outputBytes, locale) : formatBytes(Math.abs(savings), locale)}{options.mode === 'jpegToJxl' && <small>{intl.formatNumber(savingPercent(app.metrics.inputBytes, app.metrics.outputBytes) / 100, { style: 'percent', maximumFractionDigits: 1 })}</small>}</strong></div>
        <div className="actions">{working && <button className="button" disabled={app.cancelling} onClick={() => void app.togglePause()}><Icon name="pause" />{t(app.paused ? 'action.resume' : 'action.pause')}</button>}{busy && app.busy !== 'probe' ? <button className="button stop" disabled={app.cancelling} onClick={() => void app.cancel()}><Icon name="stop" />{t('action.stop')}</button> : <button className="button primary" disabled={busy || !app.desktop || !app.scan || !app.tools || !options.outputDir} onClick={() => void app.start(options)}>{t(options.mode === 'jpegToJxl' ? 'action.startCompression' : 'action.restoreJpeg')} <Icon name="arrow" /></button>}</div>
      </div>
      {app.summary && <div className="summary-note" role="status">{t('summary.finishedIn', { duration: duration(app.summary.elapsedMs, locale) })}{app.summary.notStarted > 0 ? ` · ${t('summary.notProcessed', { count: app.summary.notStarted })}` : ''}</div>}
    </section>
    <footer className="app-footer">{!app.tools && <><span>{t('footer.codecMissing')}</span><button className="text-button" disabled={busy || !app.desktop} onClick={() => void pickCodecs()}>{t('footer.chooseFolder')}</button></>}<span className="footer-local">{t('footer.localOnly')}</span></footer>
  </div>;
}
