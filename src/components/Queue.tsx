import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { ConversionMode, RowState, ScanResult } from '../types';
import { formatBytes, savingPercent } from '../lib/format.mjs';
import { useLanguage } from '../i18n';
import { Icon } from './Icon';

const PAGE_SIZE = 75;
export function Queue({
  scan,
  rows,
  finished,
  mode,
}: {
  scan: ScanResult | null;
  rows: Map<number, RowState>;
  finished: boolean;
  mode: ConversionMode;
}) {
  const [page, setPage] = useState(0);
  const intl = useIntl();
  const { locale } = useLanguage();
  const t = (id: string) => intl.formatMessage({ id });
  useEffect(() => {
    setPage(0);
  }, [scan]);
  if (!scan)
    return (
      <div className="queue-empty">
        <Icon name="file" size={30} />
        <span>{t(mode === 'jpegToJxl' ? 'queue.emptyJpeg' : 'queue.emptyJxl')}</span>
      </div>
    );
  const pageCount = Math.ceil(scan.files.length / PAGE_SIZE);
  const visible = scan.files.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t('queue.file')}</th>
              <th>{mode === 'jpegToJxl' ? 'JPEG' : 'JXL'}</th>
              <th>{mode === 'jpegToJxl' ? 'JXL' : 'JPEG'}</th>
              <th>{t('queue.result')}</th>
              <th aria-label={t('progress.saved')}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((file) => {
              const state = rows.get(file.id);
              const result = state?.result;
              const saving =
                result?.outputBytes != null && mode === 'jpegToJxl'
                  ? savingPercent(file.size, result.outputBytes)
                  : null;
              return (
                <tr key={file.id}>
                  <td>
                    <div className="filename" title={file.source}>
                      <span className="file-icon">
                        <Icon name="file" />
                      </span>
                      <span>{file.relative}</span>
                    </div>
                    {result?.message && (
                      <div className="row-message" title={result.message}>
                        {result.message}
                      </div>
                    )}
                  </td>
                  <td className="number">{formatBytes(file.size, locale)}</td>
                  <td className="number">
                    {result?.outputBytes != null ? formatBytes(result.outputBytes, locale) : '—'}
                  </td>
                  <td>
                    <span className={`status ${state?.status ?? 'pending'}`}>
                      <span className="status-dot" />
                      {state
                        ? t(`status.${state.status}`)
                        : t(finished ? 'status.notProcessed' : 'status.queued')}
                    </span>
                  </td>
                  <td className={`saving-number ${saving != null && saving > 0 ? 'positive' : ''}`}>
                    {saving == null
                      ? '—'
                      : intl.formatNumber(-saving / 100, {
                          style: 'percent',
                          maximumFractionDigits: 1,
                        })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <nav className="pagination" aria-label={t('queue.pages')}>
          <button
            className="button small"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
          >
            {t('queue.previous')}
          </button>
          <span>
            {page + 1} / {pageCount}
          </span>
          <button
            className="button small"
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 === pageCount}
          >
            {t('queue.next')}
          </button>
        </nav>
      )}
    </>
  );
}
