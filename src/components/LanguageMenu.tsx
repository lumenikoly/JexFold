import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useLanguage, type LanguagePreference } from '../i18n';
import { Icon } from './Icon';

const languageOptions: readonly LanguagePreference[] = ['system', 'en', 'ru'];

export function LanguageMenu() {
  const intl = useIntl();
  const { preference, setPreference } = useLanguage();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const t = (id: string) => intl.formatMessage({ id });
  const selectedLabel = t(
    preference === 'system'
      ? 'language.system'
      : preference === 'en'
        ? 'language.english'
        : 'language.russian',
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function chooseLanguage(language: LanguagePreference) {
    setPreference(language);
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div className="language-menu" ref={menuRef}>
      <button
        ref={buttonRef}
        className="language-menu-trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${t('settings.language')}: ${selectedLabel}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="language" size={17} />
        <span>{preference === 'ru' ? 'RU' : preference === 'en' ? 'EN' : 'AUTO'}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="language-menu-list" role="menu" aria-label={t('settings.language')}>
          {languageOptions.map((language) => {
            const label = t(
              language === 'system'
                ? 'language.system'
                : language === 'en'
                  ? 'language.english'
                  : 'language.russian',
            );
            return (
              <button
                key={language}
                className="language-menu-option"
                type="button"
                role="menuitemradio"
                aria-checked={preference === language}
                onClick={() => chooseLanguage(language)}
              >
                <span>{label}</span>
                {preference === language && <Icon name="check" size={15} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
