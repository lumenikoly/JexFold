import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { IntlProvider } from 'react-intl';
import en from './locales/en.json';
import ru from './locales/ru.json';

export const supportedLocales = ['en', 'ru'] as const;
export type Locale = typeof supportedLocales[number];
export type LanguagePreference = 'system' | Locale;

const STORAGE_KEY = 'jexfold.language.v1';
const LEGACY_STORAGE_KEY = 'jpeg-archiver.language.v1';
const messages: Record<Locale, Record<string, string>> = { en, ru };

function systemLocale(): Locale {
  const languages = typeof navigator === 'undefined' ? [] : [...navigator.languages, navigator.language];
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (supportedLocales.includes(base as Locale)) return base as Locale;
  }
  return 'en';
}

function loadPreference(): LanguagePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    return saved === 'system' || supportedLocales.includes(saved as Locale) ? saved as LanguagePreference : 'system';
  } catch { return 'system'; }
}

const LanguageContext = createContext<{ locale: Locale; preference: LanguagePreference; setPreference: (value: LanguagePreference) => void } | null>(null);

export function AppIntlProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<LanguagePreference>(loadPreference);
  const [detectedLocale, setDetectedLocale] = useState(systemLocale);
  const locale = preference === 'system' ? detectedLocale : preference;
  const value = useMemo(() => ({ locale, preference, setPreference(value: LanguagePreference) {
    setPreferenceState(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* Language persistence is non-critical. */ }
  } }), [locale, preference]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = 'ltr';
  }, [locale]);
  useEffect(() => {
    const updateSystemLocale = () => setDetectedLocale(systemLocale());
    window.addEventListener('languagechange', updateSystemLocale);
    return () => window.removeEventListener('languagechange', updateSystemLocale);
  }, []);

  return <LanguageContext.Provider value={value}>
    <IntlProvider locale={locale} defaultLocale="en" messages={messages[locale]}>{children}</IntlProvider>
  </LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside AppIntlProvider');
  return context;
}
