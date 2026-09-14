import { useIntl } from 'react-intl';
import type { Options, Performance } from '../types';
import { useLanguage, type LanguagePreference } from '../i18n';
import { Icon } from './Icon';

export function Settings({
  options,
  setOptions,
  disabled,
  chooseOutput,
  desktop,
  directOutput,
  outputLabel,
  onClose,
}: {
  options: Options;
  setOptions: (options: Options) => void;
  disabled: boolean;
  chooseOutput: () => void;
  desktop: boolean;
  directOutput: boolean;
  outputLabel: string;
  onClose?: () => void;
}) {
  const intl = useIntl();
  const { preference, setPreference } = useLanguage();
  const t = (id: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id }, values);
  const outputFormat = options.mode === 'jpegToJxl' ? 'JXL' : 'JPEG';
  return (
    <aside className="panel settings">
      <div className="panel-title">
        <h2>{t('settings.title')}</h2>
        {onClose && (
          <button
            className="icon-button drawer-close"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <Icon name="close" size={17} />
          </button>
        )}
      </div>
      <label className="field-label" htmlFor="language">
        {t('settings.language')}
      </label>
      <select
        id="language"
        value={preference}
        onChange={(e) => setPreference(e.target.value as LanguagePreference)}
      >
        <option value="system">{t('language.system')}</option>
        <option value="en">{t('language.english')}</option>
        <option value="ru">{t('language.russian')}</option>
      </select>
      <fieldset disabled={disabled}>
        <label className="field-label field-label-spaced" htmlFor="mode">
          {t('settings.mode')}
        </label>
        <select
          id="mode"
          value={options.mode}
          onChange={(e) => setOptions({ ...options, mode: e.target.value as Options['mode'] })}
        >
          <option value="jpegToJxl">JPEG → JXL</option>
          <option value="jxlToJpeg">JXL → JPEG</option>
        </select>
        <label className="field-label">
          {t('settings.outputFolder', { format: outputFormat })}
        </label>
        <button
          className="output-picker"
          onClick={chooseOutput}
          disabled={!desktop && !directOutput}
          title={
            desktop
              ? options.outputDir || t('settings.chooseSeparateFolder')
              : outputLabel ||
                t(directOutput ? 'settings.chooseSeparateFolder' : 'settings.browserDownloads')
          }
        >
          <Icon name="folder" />
          <span>
            {desktop
              ? options.outputDir || t('settings.chooseFolder')
              : outputLabel ||
                t(directOutput ? 'settings.chooseFolder' : 'settings.browserDownloads')}
          </span>
          {(desktop || directOutput) && <span className="ellipsis">···</span>}
        </button>
        <p className="hint">{t('settings.originalsStay')}</p>
        {options.mode === 'jpegToJxl' && (
          <>
            <div className="field-head">
              <label htmlFor="effort">{t('settings.compressionEffort')}</label>
              <output htmlFor="effort">{options.effort}</output>
            </div>
            <input
              id="effort"
              type="range"
              min="3"
              max="9"
              step="1"
              value={options.effort}
              onChange={(e) => setOptions({ ...options, effort: Number(e.target.value) })}
            />
            <div className="range-labels">
              <span>{t('settings.faster')}</span>
              <span>{t('settings.smaller')}</span>
            </div>
            <p className="hint">{t('settings.effortHint')}</p>
          </>
        )}
        <label className="field-label" htmlFor="performance">
          {t('settings.performance')}
        </label>
        <select
          id="performance"
          value={options.performance}
          onChange={(e) => setOptions({ ...options, performance: e.target.value as Performance })}
        >
          <option value="quiet">{t('performance.quiet')}</option>
          <option value="balanced">{t('performance.balanced')}</option>
          <option value="fast">{t('performance.fast')}</option>
          <option value="maximum">{t('performance.maximum')}</option>
        </select>
        <div className="options-list">
          {desktop && (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={options.preserveMetadata}
                onChange={(e) => setOptions({ ...options, preserveMetadata: e.target.checked })}
              />
              <span>{t('settings.preserveMetadata')}</span>
            </label>
          )}
          {options.mode === 'jpegToJxl' && (
            <label className="checkbox-row">
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
      <div className="verification-note">
        <Icon name="shield" size={20} />
        <div>
          <strong>
            {t(options.mode === 'jpegToJxl' ? 'settings.lossless' : 'settings.decodeToJpeg')}
          </strong>
          <p>
            {t(
              options.mode === 'jpegToJxl'
                ? 'settings.verifyAfterCompression'
                : 'settings.restoreOriginal',
            )}
          </p>
        </div>
      </div>
    </aside>
  );
}
