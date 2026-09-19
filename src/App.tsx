import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useConverter } from './lib/useConverter';
import { loadPreferences, savePreferences } from './lib/preferences';
import { duration, formatBytes, savingPercent } from './lib/format.mjs';
import { useLanguage } from './i18n';
import { FaqModal } from './components/FaqModal';
import { Icon } from './components/Icon';
import { LanguageMenu } from './components/LanguageMenu';
import { Queue } from './components/Queue';

export default function App() {
  const app = useConverter();
  const intl = useIntl();
  const { locale } = useLanguage();
  const t = (id: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id }, values);
  const [options, setOptions] = useState(loadPreferences);
  const [dragging, setDragging] = useState(false);
  const init = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const busy = app.busy !== null;
  const probe = app.probe;
  const desktop = app.desktop;
  const scanPaths = app.scanPaths;
  const setAppError = app.setError;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    savePreferences(options);
  }, [options]);
  useEffect(() => {
    if (!init.current) {
      init.current = true;
      void probe();
    }
  }, [probe]);
  useEffect(() => {
    if (!app.desktop || options.mode !== 'jpegToJxl' || !app.scan?.roots.length) return;
    const parent = (path: string) =>
      path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')));
    const firstFile = app.scan.files[0]?.source ?? '';
    const sourceDirectory =
      app.scan.directoryRoots.length === 1
        ? app.scan.directoryRoots[0]
        : app.scan.directoryRoots.length === 0 &&
            app.scan.files.every((file) => parent(file.source) === parent(firstFile))
          ? parent(firstFile)
          : undefined;
    if (sourceDirectory)
      setOptions((current) => ({
        ...current,
        outputDir: `${sourceDirectory}${sourceDirectory.endsWith('/') || sourceDirectory.endsWith('\\') ? '' : sourceDirectory.includes('\\') ? '\\' : '/'}jxl`,
      }));
  }, [app.desktop, app.scan, options.mode]);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (busyRef.current) {
          setDragging(false);
          return;
        }
        if (event.payload.type === 'enter' || event.payload.type === 'over') setDragging(true);
        else {
          setDragging(false);
          if (event.payload.type === 'drop') void scanPaths?.(event.payload.paths, options.mode);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((e) => setAppError(String(e)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktop, scanPaths, setAppError, options.mode]);

  async function pickSources(directory: boolean) {
    try {
      if (!app.desktop) {
        if (directory && app.capabilities.directDirectoryOutput && app.selectDirectory)
          await app.selectDirectory(options.mode);
        else (directory ? folderInput : fileInput).current?.click();
        return;
      }
      const format = options.mode === 'jpegToJxl' ? 'JPEG' : 'JXL';
      const selected = await open({
        directory,
        multiple: !directory,
        title: directory ? t('dialog.selectFolderWith', { format }) : t('dialog.selectFiles'),
        filters: directory
          ? undefined
          : options.mode === 'jpegToJxl'
            ? [{ name: 'JPEG', extensions: ['jpg', 'jpeg', 'JPG', 'JPEG'] }]
            : [{ name: 'JPEG XL', extensions: ['jxl', 'JXL'] }],
      });
      if (selected)
        await app.scanPaths?.(Array.isArray(selected) ? selected : [selected], options.mode);
    } catch (e) {
      app.setError(String(e));
    }
  }
  async function pickOutput() {
    try {
      if (!app.desktop) {
        await app.selectOutputDirectory?.();
        return;
      }
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: options.outputDir || undefined,
        title: t('dialog.outputFolder', { format: options.mode === 'jpegToJxl' ? 'JXL' : 'JPEG' }),
      });
      if (typeof selected === 'string')
        setOptions((current) => ({ ...current, outputDir: selected }));
    } catch (e) {
      app.setError(String(e));
    }
  }
  async function pickCodecs() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('dialog.codecFolder'),
      });
      if (typeof selected === 'string') await app.probe(selected);
    } catch (e) {
      app.setError(String(e));
    }
  }

  const total = app.scan?.files.length ?? 0;
  const progress =
    app.progressPercent ?? (total === 0 ? 0 : Math.round((app.metrics.processed / total) * 100));
  const savings = app.metrics.inputBytes - app.metrics.outputBytes;
  const working = app.busy === 'convert';
  const outputName = app.desktop
    ? options.outputDir || t('settings.chooseFolder')
    : app.outputLabel ||
      t(
        app.capabilities.directDirectoryOutput
          ? 'settings.chooseFolder'
          : 'settings.browserDownloads',
      );
  const stateText = app.cancelling
    ? t('progress.stopping')
    : app.busy === 'scan'
      ? t('progress.scanning')
      : app.busy === 'probe'
        ? t('progress.probing')
        : working && app.paused
          ? t('progress.paused')
          : working
            ? t(options.mode === 'jpegToJxl' ? 'progress.compressing' : 'progress.restoring')
            : app.summary
              ? t(
                  app.summary.wasCancelled
                    ? 'progress.stopped'
                    : app.summary.failed
                      ? 'progress.completedWithErrors'
                      : 'progress.completed',
                )
              : t('progress.ready');

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <h1>JexFold</h1>
        </div>
        <div className="header-actions">
          <FaqModal />
          <LanguageMenu />
        </div>
      </header>
      {app.error && (
        <div className="alert" role="alert">
          <div>
            <strong>{t('error.actionFailed')}</strong>
            <details>
              <summary>{t('common.details')}</summary>
              <pre>{app.error}</pre>
            </details>
          </div>
          <button
            className="icon-button"
            aria-label={t('common.closeMessage')}
            onClick={() => app.setError('')}
          >
            ×
          </button>
        </div>
      )}

      <div className="app-layout">
        <main className="main-workspace">
          <section className="page-heading">
            <div>
              <h2>
                {options.mode === 'jpegToJxl' ? t('page.compressTitle') : t('page.restoreTitle')}
              </h2>
            </div>
          </section>
          <section className="mode-bar" aria-label={t('settings.mode')}>
            <div className="mode-switcher" role="tablist">
              <button
                className={options.mode === 'jpegToJxl' ? 'is-active' : ''}
                role="tab"
                aria-selected={options.mode === 'jpegToJxl'}
                disabled={busy}
                onClick={() => {
                  if (options.mode !== 'jpegToJxl') app.clear();
                  setOptions((current) => ({ ...current, mode: 'jpegToJxl' }));
                }}
              >
                JPEG <span>→</span> JXL
              </button>
              <button
                className={options.mode === 'jxlToJpeg' ? 'is-active' : ''}
                role="tab"
                aria-selected={options.mode === 'jxlToJpeg'}
                disabled={busy}
                onClick={() => {
                  if (options.mode !== 'jxlToJpeg') app.clear();
                  setOptions((current) => ({ ...current, mode: 'jxlToJpeg' }));
                }}
              >
                JXL <span>→</span> JPEG
              </button>
            </div>
          </section>
          <div className="workspace">
            <section className={`panel source-panel ${app.scan ? 'has-queue' : 'is-empty'}`}>
              {app.scan && (
                <div className="panel-title">
                  <h2>
                    {t('source.selected')}{' '}
                    <span className="count-chip">{intl.formatNumber(total)}</span>
                  </h2>
                  <button className="text-button push-right" disabled={busy} onClick={app.clear}>
                    {t('source.clear')}
                  </button>
                </div>
              )}
              <div
                className={`dropzone ${dragging ? 'is-dragging' : ''}`}
                onDragEnter={(event) => {
                  if (!app.desktop) {
                    event.preventDefault();
                    if (!busy) setDragging(true);
                  }
                }}
                onDragOver={(event) => {
                  if (!app.desktop) event.preventDefault();
                }}
                onDragLeave={(event) => {
                  if (!app.desktop && event.currentTarget === event.target) setDragging(false);
                }}
                onDrop={(event) => {
                  if (!app.desktop) {
                    event.preventDefault();
                    setDragging(false);
                    if (!busy) void app.scanWebFiles?.([...event.dataTransfer.files], options.mode);
                  }
                }}
              >
                <input
                  ref={fileInput}
                  hidden
                  type="file"
                  accept={options.mode === 'jpegToJxl' ? '.jpg,.jpeg,image/jpeg' : '.jxl,image/jxl'}
                  multiple
                  onChange={(event) => {
                    void app.scanWebFiles?.([...(event.target.files ?? [])], options.mode);
                    event.target.value = '';
                  }}
                />
                <input
                  ref={folderInput}
                  hidden
                  type="file"
                  accept={options.mode === 'jpegToJxl' ? '.jpg,.jpeg,image/jpeg' : '.jxl,image/jxl'}
                  multiple
                  {...{ webkitdirectory: '' }}
                  onChange={(event) => {
                    void app.scanWebFiles?.([...(event.target.files ?? [])], options.mode);
                    event.target.value = '';
                  }}
                />
                <div className="drop-icon">
                  <Icon name="folder" size={29} />
                </div>
                <h2>
                  {dragging
                    ? t('source.dropRelease')
                    : app.scan
                      ? t('source.addMore')
                      : t('source.emptyTitle')}
                </h2>
                <p>{app.scan ? t('source.dropHint') : t('source.emptyHint')}</p>
                <div className="source-buttons">
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => void pickSources(false)}
                  >
                    <Icon name="plus" size={16} /> {t('source.selectFiles')}
                  </button>
                  <button className="button" disabled={busy} onClick={() => void pickSources(true)}>
                    <Icon name="folder" size={16} /> {t('source.selectFolder')}
                  </button>
                </div>
              </div>
              <section className="quick-settings" aria-label={t('settings.title')}>
                <div className="quick-grid">
                  <button
                    className="quick-card quick-action-card output-quick-card"
                    onClick={() => void pickOutput()}
                    disabled={busy || (!app.desktop && !app.capabilities.directDirectoryOutput)}
                  >
                    <span className="quick-card-icon">
                      <Icon name="folder" size={18} />
                    </span>
                    <span className="quick-card-copy">
                      <small>
                        {t('settings.outputFolder', {
                          format: options.mode === 'jpegToJxl' ? 'JXL' : 'JPEG',
                        })}
                      </small>
                      <strong>{outputName}</strong>
                    </span>
                    {(app.desktop || app.capabilities.directDirectoryOutput) && (
                      <Icon name="arrow" size={15} />
                    )}
                  </button>
                </div>
              </section>
              <section className="inline-settings" aria-label={t('settings.title')}>
                <fieldset disabled={busy}>
                  <div className="settings-grid">
                    <label className="inline-field">
                      <span>{t('settings.performance')}</span>
                      <select
                        value={options.performance}
                        onChange={(e) => {
                          const performance = e.currentTarget.value;
                          if (
                            performance === 'quiet' ||
                            performance === 'balanced' ||
                            performance === 'maximum'
                          ) {
                            setOptions((current) => ({ ...current, performance }));
                          }
                        }}
                      >
                        <option value="quiet">{t('performance.quiet')}</option>
                        <option value="balanced">{t('performance.balanced')}</option>
                        <option value="maximum">{t('performance.maximum')}</option>
                      </select>
                    </label>
                    <div className="inline-info">
                      <p>{t('settings.localOnly')}</p>
                      <p>{t('settings.jxlBenefit')}</p>
                    </div>
                  </div>
                  <div className="inline-toggles">
                    {app.desktop && (
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={options.preserveMetadata}
                          onChange={(e) =>
                            setOptions({ ...options, preserveMetadata: e.target.checked })
                          }
                        />
                        <span>{t('settings.preserveMetadata')}</span>
                      </label>
                    )}
                    {options.mode === 'jpegToJxl' && (
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={options.skipLarger}
                          onChange={(e) => setOptions({ ...options, skipLarger: e.target.checked })}
                        />
                        <span>{t('settings.skipLarger')}</span>
                      </label>
                    )}
                  </div>
                </fieldset>
              </section>
              {!!app.scan?.incompatibleCount && (
                <div className="format-warning" role="alert">
                  <div>
                    <strong>{t('source.unsupportedFormatTitle')}</strong>
                    <p>
                      {t(
                        options.mode === 'jpegToJxl'
                          ? 'source.onlyJpegAccepted'
                          : 'source.onlyJxlAccepted',
                        { count: app.scan.incompatibleCount },
                      )}
                    </p>
                  </div>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => {
                      const mode = options.mode === 'jpegToJxl' ? 'jxlToJpeg' : 'jpegToJxl';
                      app.clear();
                      setOptions((current) => ({ ...current, mode }));
                    }}
                  >
                    {t('action.switchMode')}
                  </button>
                </div>
              )}
              {app.scan && (
                <div className="queue-heading">
                  <span>{t('source.filesInQueue')}</span>
                  <strong>{formatBytes(app.scan.totalBytes, locale)}</strong>
                </div>
              )}
              <Queue
                scan={app.scan}
                rows={app.rows}
                finished={app.summary !== null}
                mode={options.mode}
              />
              {app.scan && app.scan.warningCount > 0 && (
                <details className="scan-warnings">
                  <summary>{t('source.scanWarnings', { count: app.scan.warningCount })}</summary>
                  <pre>{app.scan.warnings.join('\n')}</pre>
                  {app.scan.warningCount > app.scan.warnings.length && (
                    <p>{t('source.warningsShown', { count: app.scan.warnings.length })}</p>
                  )}
                </details>
              )}
            </section>
          </div>

          {app.scan && (
            <section className="panel progress-panel" aria-label={t('progress.label')}>
              <div className="progress-top">
                <div className="progress-caption">
                  <span className={`activity-dot ${busy ? 'active' : ''}`} />
                  <strong aria-live="polite">{stateText}</strong>
                </div>
                <span className="progress-numbers">
                  {intl.formatNumber(app.metrics.processed)} / {intl.formatNumber(total)}
                </span>
              </div>
              <progress max="100" value={progress} aria-label={t('progress.filesComplete')} />
              <div className="progress-bottom">
                <div className="metrics">
                  <div className="stat">
                    <span>{t('progress.done')}</span>
                    <strong>{intl.formatNumber(app.metrics.converted)}</strong>
                  </div>
                  <div className="stat">
                    <span>{t('progress.errors')}</span>
                    <strong className={app.metrics.failed ? 'error-number' : ''}>
                      {intl.formatNumber(app.metrics.failed)}
                    </strong>
                  </div>
                </div>
                <div className="stat savings">
                  <span>
                    {t(
                      options.mode === 'jxlToJpeg'
                        ? 'progress.jpegSize'
                        : savings < 0
                          ? 'progress.sizeIncreased'
                          : 'progress.saved',
                    )}
                  </span>
                  <strong>
                    {options.mode === 'jxlToJpeg'
                      ? formatBytes(app.metrics.outputBytes, locale)
                      : formatBytes(Math.abs(savings), locale)}
                    {options.mode === 'jpegToJxl' && (
                      <small>
                        {intl.formatNumber(
                          savingPercent(app.metrics.inputBytes, app.metrics.outputBytes) / 100,
                          { style: 'percent', maximumFractionDigits: 1 },
                        )}
                      </small>
                    )}
                  </strong>
                </div>
                <div className="actions">
                  {working && (
                    <button
                      className="button"
                      disabled={app.cancelling}
                      onClick={() => void app.togglePause()}
                    >
                      <Icon name="pause" />
                      {t(app.paused ? 'action.resume' : 'action.pause')}
                    </button>
                  )}
                  {busy && app.busy !== 'probe' ? (
                    <button
                      className="button stop"
                      disabled={app.cancelling}
                      onClick={() => void app.cancel()}
                    >
                      <Icon name="stop" />
                      {t('action.stop')}
                    </button>
                  ) : app.downloadReady > 0 ? (
                    <button className="button primary" onClick={() => app.downloadAll?.()}>
                      {t('action.download', { count: app.downloadReady })} <Icon name="arrow" />
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      disabled={
                        busy ||
                        !app.scan ||
                        app.scan.files.length === 0 ||
                        !app.tools ||
                        (app.desktop && !options.outputDir)
                      }
                      onClick={() => void app.start(options)}
                    >
                      {t(
                        options.mode === 'jpegToJxl'
                          ? 'action.startCompression'
                          : 'action.restoreJpeg',
                      )}{' '}
                      <Icon name="arrow" />
                    </button>
                  )}
                </div>
              </div>
              {app.summary && (
                <div className="summary-note" role="status">
                  {t('summary.finishedIn', { duration: duration(app.summary.elapsedMs, locale) })}
                  {app.summary.notStarted > 0
                    ? ` · ${t('summary.notProcessed', { count: app.summary.notStarted })}`
                    : ''}
                </div>
              )}
            </section>
          )}
        </main>
      </div>
      <footer className="app-footer">
        {app.desktop && !app.tools && (
          <>
            <span>{t('footer.codecMissing')}</span>
            <button className="text-button" disabled={busy} onClick={() => void pickCodecs()}>
              {t('footer.chooseFolder')}
            </button>
          </>
        )}
        <div className="footer-meta">
          <a
            className="footer-credit"
            href="https://nkoksharov.dev/"
            target="_blank"
            rel="noreferrer"
          >
            Created by nkoksharov.dev
          </a>
          <span>version 0.0.3</span>
          <a
            className="footer-github"
            href="https://github.com/lumenikoly/JexFold"
            target="_blank"
            rel="noreferrer"
            aria-label="JexFold on GitHub"
          >
            <Icon name="github" size={14} />
            <span>GitHub</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
