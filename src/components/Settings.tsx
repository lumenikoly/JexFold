import type { Options, Performance } from '../types';
import { Icon } from './Icon';

export function Settings({ options, setOptions, disabled, chooseOutput }: {
  options: Options; setOptions: (options: Options) => void; disabled: boolean; chooseOutput: () => void;
}) {
  return <aside className="panel settings">
    <div className="panel-title"><span className="step">02</span><h2>Сохранение</h2></div>
    <fieldset disabled={disabled}>
      <label className="field-label">Папка для JXL</label>
      <button className="output-picker" onClick={chooseOutput} title={options.outputDir || 'Выбрать отдельную папку'}>
        <Icon name="folder" /><span>{options.outputDir || 'Выбрать папку'}</span><span className="ellipsis">···</span>
      </button>
      <p className="hint">Отдельная папка, вне исходного архива. Структура папок сохранится. Нужны NTFS, APFS или ext4; не exFAT.</p>
      <div className="field-head"><label htmlFor="effort">Усилие сжатия</label><output htmlFor="effort">{options.effort}</output></div>
      <input id="effort" type="range" min="3" max="9" step="1" value={options.effort} onChange={e => setOptions({ ...options, effort: Number(e.target.value) })} />
      <div className="range-labels"><span>Быстрее</span><span>Компактнее</span></div>
      <p className="hint">Качество не меняется. Большее усилие может уменьшить размер, но требует больше времени.</p>
      <label className="field-label" htmlFor="performance">Нагрузка на компьютер</label>
      <select id="performance" value={options.performance} onChange={e => setOptions({ ...options, performance: e.target.value as Performance })}>
        <option value="quiet">Бережно</option><option value="balanced">Сбалансированно</option><option value="fast">Быстрее</option>
      </select>
      <div className="options-list">
        <label className="checkbox-row"><input type="checkbox" checked={options.preserveMtime} onChange={e => setOptions({ ...options, preserveMtime: e.target.checked })} /><span>Сохранить дату изменения файла</span></label>
        <label className="checkbox-row"><input type="checkbox" checked={options.skipLarger} onChange={e => setOptions({ ...options, skipLarger: e.target.checked })} /><span>Не сохранять JXL без экономии места</span></label>
      </div>
    </fieldset>
    <div className="verification-note"><Icon name="shield" size={20} /><div><strong>Проверка всегда включена</strong><p>JXL → JPEG → побайтовое сравнение.<br />Оригиналы не удаляются.</p></div></div>
    <p className="tiny-note">Имя результата: <code>фото.jpg.jxl</code>. Это исключает конфликт с <code>фото.jpeg</code>.</p>
  </aside>;
}
