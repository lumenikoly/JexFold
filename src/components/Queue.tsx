import { useEffect, useState } from 'react';
import type { ConversionMode, RowState, ScanResult } from '../types';
import { formatBytes } from '../lib/format.mjs';
import { Icon } from './Icon';

const PAGE_SIZE = 75;
const labels: Record<RowState['status'], string> = {
  encoding: 'Сжатие', decoding: 'Восстановление', verifying: 'Проверка', converted: 'Готов', existing: 'Уже существует',
  notSmaller: 'Нет экономии', failed: 'Ошибка', cancelled: 'Отменён',
};
export function Queue({ scan, rows, finished, mode }: { scan: ScanResult | null; rows: Map<number, RowState>; finished: boolean; mode: ConversionMode }) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [scan]);
  if (!scan) return <div className="queue-empty"><Icon name="file" size={30} /><span>Добавьте {mode === 'jpegToJxl' ? 'JPEG для сжатия' : 'JXL для восстановления'}</span></div>;
  const pageCount = Math.ceil(scan.files.length / PAGE_SIZE);
  const visible = scan.files.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return <>
    <div className="table-scroll"><table>
      <thead><tr><th>Файл</th><th>{mode === 'jpegToJxl' ? 'JPEG' : 'JXL'}</th><th>{mode === 'jpegToJxl' ? 'JXL' : 'JPEG'}</th><th>Результат</th></tr></thead>
      <tbody>{visible.map(file => {
        const state = rows.get(file.id);
        const result = state?.result;
        return <tr key={file.id}>
          <td><div className="filename" title={file.source}><span className="file-icon"><Icon name="file" /></span><span>{file.relative}</span></div>
            {result?.message && <div className="row-message" title={result.message}>{result.message}</div>}</td>
          <td className="number">{formatBytes(file.size)}</td>
          <td className="number">{result?.outputBytes != null ? formatBytes(result.outputBytes) : '—'}</td>
          <td><span className={`status ${state?.status ?? 'pending'}`}>{state ? labels[state.status] : finished ? 'Не обработан' : 'В очереди'}</span></td>
        </tr>;
      })}</tbody>
    </table></div>
    {pageCount > 1 && <nav className="pagination" aria-label="Страницы очереди">
      <button className="button small" onClick={() => setPage(p => p - 1)} disabled={page === 0}>Назад</button>
      <span>{page + 1} / {pageCount}</span>
      <button className="button small" onClick={() => setPage(p => p + 1)} disabled={page + 1 === pageCount}>Далее</button>
    </nav>}
  </>;
}
