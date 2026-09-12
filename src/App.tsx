import { useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useConverter } from './lib/useConverter';
import { loadPreferences, savePreferences } from './lib/preferences';
import { duration, formatBytes, savingPercent } from './lib/format.mjs';
import { Icon } from './components/Icon';
import { Queue } from './components/Queue';
import { Settings } from './components/Settings';

export default function App() {
  const app = useConverter();
  const [options, setOptions] = useState(loadPreferences);
  const [dragging, setDragging] = useState(false);
  const init = useRef(false);
  const busy = app.busy !== null;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => { savePreferences(options); }, [options]);
  useEffect(() => {
    if (!init.current && app.desktop) { init.current = true; void app.probe(); }
  }, [app.desktop, app.probe]);
  useEffect(() => {
    if (!app.desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview().onDragDropEvent(event => {
      if (busyRef.current) { setDragging(false); return; }
      if (event.payload.type === 'enter' || event.payload.type === 'over') setDragging(true);
      else {
        setDragging(false);
        if (event.payload.type === 'drop') void app.scanPaths(event.payload.paths, options.mode);
      }
    }).then(fn => { if (disposed) fn(); else unlisten = fn; }).catch(e => app.setError(String(e)));
    return () => { disposed = true; unlisten?.(); };
  }, [app.desktop, app.scanPaths, app.setError, options.mode]);

  async function pickSources(directory: boolean) {
    try {
      const selected = await open({ directory, multiple: !directory,
        title: directory ? `Выберите папку с ${options.mode === 'jpegToJxl' ? 'JPEG' : 'JXL'}` : 'Выберите файлы',
        filters: directory ? undefined : options.mode === 'jpegToJxl' ? [{ name: 'JPEG', extensions: ['jpg', 'jpeg', 'JPG', 'JPEG'] }] : [{ name: 'JPEG XL', extensions: ['jxl', 'JXL'] }],
      });
      if (selected) await app.scanPaths(Array.isArray(selected) ? selected : [selected], options.mode);
    } catch (e) { app.setError(String(e)); }
  }
  async function pickOutput() {
    try {
      const selected = await open({ directory: true, multiple: false, title: `Отдельная папка для ${options.mode === 'jpegToJxl' ? 'JXL' : 'JPEG'}` });
      if (typeof selected === 'string') setOptions(current => ({ ...current, outputDir: selected }));
    } catch (e) { app.setError(String(e)); }
  }
  async function pickCodecs() {
    try {
      const selected = await open({ directory: true, multiple: false, title: 'Папка с cjxl и djxl' });
      if (typeof selected === 'string') await app.probe(selected);
    } catch (e) { app.setError(String(e)); }
  }
  const total = app.scan?.files.length ?? 0;
  const progress = total === 0 ? 0 : Math.round(app.metrics.processed / total * 100);
  const savings = app.metrics.inputBytes - app.metrics.outputBytes;
  const working = app.busy === 'convert';
  const stateText = app.cancelling ? 'Остановка и очистка…'
    : app.busy === 'scan' ? 'Поиск фотографий…'
    : app.busy === 'probe' ? 'Проверка кодека…'
    : working && app.paused ? 'Пауза после текущих файлов'
    : working ? options.mode === 'jpegToJxl' ? 'Сжатие и проверка' : 'Восстановление JPEG'
    : app.summary ? app.summary.wasCancelled ? 'Обработка остановлена' : app.summary.failed ? 'Завершено с ошибками' : 'Обработка завершена'
    : 'Готов к работе';

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand"><div className="brand-mark">J<span>×</span>L</div><div><h1>JPEG Archiver</h1><p>Сжимает фотографии без потери качества</p></div></div>
    </header>

    {!app.desktop && <div className="notice">В предпросмотре работа с файлами недоступна.</div>}
    {app.error && <div className="alert" role="alert"><div><strong>Не удалось выполнить действие</strong><details><summary>Подробнее</summary><pre>{app.error}</pre></details></div><button className="icon-button" aria-label="Закрыть сообщение" onClick={() => app.setError('')}>×</button></div>}

    <div className="workspace">
      <main className="panel source-panel">
        <div className="panel-title"><h2>Фотографии</h2>{app.scan && <button className="text-button push-right" disabled={busy} onClick={app.clear}>Очистить</button>}</div>
        <div className={`dropzone ${dragging ? 'is-dragging' : ''}`}>
          <div className="drop-icon"><Icon name="folder" size={29} /></div>
          <h3>{dragging ? 'Отпустите, чтобы выбрать' : `Перетащите ${options.mode === 'jpegToJxl' ? 'JPEG' : 'JXL'} или папку`}</h3>
          <p>Можно добавить сразу несколько файлов или целую папку</p>
          <div className="source-buttons">
            <button className="button" disabled={busy || !app.desktop} onClick={() => void pickSources(false)}><Icon name="plus" size={16} /> Выбрать файлы</button>
            <button className="button" disabled={busy || !app.desktop} onClick={() => void pickSources(true)}><Icon name="folder" size={16} /> Выбрать папку</button>
          </div>
        </div>
        {app.scan && <div className="queue-heading"><h3>Выбрано <span>{total.toLocaleString('ru-RU')}</span></h3><span>{formatBytes(app.scan.totalBytes)}</span></div>}
        <Queue scan={app.scan} rows={app.rows} finished={app.summary !== null} mode={options.mode} />
        {app.scan && app.scan.warningCount > 0 && <details className="scan-warnings"><summary>Замечания при сканировании: {app.scan.warningCount}</summary><pre>{app.scan.warnings.join('\n')}</pre>{app.scan.warningCount > app.scan.warnings.length && <p>Показаны первые {app.scan.warnings.length} замечаний.</p>}</details>}
      </main>
      <Settings options={options} setOptions={next => { if (next.mode !== options.mode) app.clear(); setOptions(next); }} disabled={busy || !app.desktop} chooseOutput={() => void pickOutput()} />
    </div>

    <section className="panel progress-panel" aria-label="Ход обработки">
      <div className="progress-top"><div className="progress-caption"><span className={`activity-dot ${busy ? 'active' : ''}`} /><strong aria-live="polite">{stateText}</strong></div><span className="progress-numbers">{app.metrics.processed.toLocaleString('ru-RU')} / {total.toLocaleString('ru-RU')}</span></div>
      <progress max="100" value={progress} aria-label="Завершено файлов" />
      <div className="progress-bottom"><div className="stat"><span>Готово</span><strong>{app.metrics.converted.toLocaleString('ru-RU')}</strong></div>
        <div className="stat"><span>Пропущено</span><strong>{app.metrics.skipped}</strong></div>
        <div className="stat"><span>Ошибки</span><strong className={app.metrics.failed ? 'error-number' : ''}>{app.metrics.failed}</strong></div>
        <div className="stat savings"><span>{options.mode === 'jxlToJpeg' ? 'Размер JPEG' : savings < 0 ? 'Размер увеличился' : 'Сэкономлено'}</span><strong>{options.mode === 'jxlToJpeg' ? formatBytes(app.metrics.outputBytes) : formatBytes(Math.abs(savings))}{options.mode === 'jpegToJxl' && <small>{savingPercent(app.metrics.inputBytes, app.metrics.outputBytes).toFixed(1)}%</small>}</strong></div>
        <div className="actions">
          {working && <button className="button" disabled={app.cancelling} onClick={() => void app.togglePause()}><Icon name="pause" />{app.paused ? 'Продолжить' : 'Пауза'}</button>}
          {busy && app.busy !== 'probe'
            ? <button className="button stop" disabled={app.cancelling} onClick={() => void app.cancel()}><Icon name="stop" />Остановить</button>
            : <button className="button primary" disabled={busy || !app.desktop || !app.scan || !app.tools || !options.outputDir} onClick={() => void app.start(options)}>{options.mode === 'jpegToJxl' ? 'Начать сжатие' : 'Восстановить JPEG'} <Icon name="arrow" /></button>}
        </div>
      </div>
      {app.summary && <div className="summary-note" role="status">Готово за {duration(app.summary.elapsedMs)}{app.summary.notStarted > 0 ? ` · Не обработано: ${app.summary.notStarted}` : ''}</div>}
    </section>

    <footer className="app-footer">{!app.tools && <><span>Компонент сжатия не найден</span><button className="text-button" disabled={busy || !app.desktop} onClick={() => void pickCodecs()}>Указать папку</button></>}<span className="footer-local">Файлы остаются на этом компьютере</span>
    </footer>
  </div>;
}
