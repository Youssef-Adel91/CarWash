// Powered by OnSpace.AI
// English / Arabic language + RTL layout switch. No i18n library — a small
// dictionary lookup with {{var}} interpolation, backed by
// constants/translations. Also flips React Native's I18nManager so flex
// layouts mirror automatically for Arabic.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { translations, type TranslationKey } from '@/constants/translations';

export type Language = 'en' | 'ar';

const LANGUAGE_KEY = '@carwash/language';

type LanguageContextType = {
  language: Language;
  isRTL: boolean;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  setLanguage: (language: Language) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function getByPath(obj: any, path: string): unknown {
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/** Applies I18nManager RTL flags. Note: `expo-updates` is NOT a dependency
 * of this project, so we deliberately do not attempt a reload here — Metro
 * resolves `require()`/`import` targets statically at bundle time, so
 * referencing a module that isn't installed would break the JS bundle even
 * inside a try/catch (unlike a plain Node `require`, which only fails at
 * runtime). Most flex layouts mirror correctly via I18nManager without a
 * reload; a small number of already-mounted screens may only pick up the
 * new direction after the user backgrounds/reopens the app or it naturally
 * remounts. If you later add `expo-updates` as a real dependency, this is
 * the place to call `Updates.reloadAsync()` when `changed` is true. */
async function applyRTL(language: Language) {
  const shouldBeRTL = language === 'ar';
  I18nManager.allowRTL(shouldBeRTL);
  I18nManager.forceRTL(shouldBeRTL);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(LANGUAGE_KEY)
      .then((raw) => {
        if (!mounted) return;
        if (raw === 'en' || raw === 'ar') {
          setLanguageState(raw);
          return;
        }
        const detected = Localization.getLocales?.()[0]?.languageCode === 'ar' ? 'ar' : 'en';
        setLanguageState(detected);
      })
      .finally(() => {
        if (mounted) setLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Keep native RTL state aligned with the resolved language, including on
  // first boot once we know what it is.
  useEffect(() => {
    if (!loaded) return;
    applyRTL(language).catch(() => {});
  }, [loaded, language]);

  const setLanguage = useCallback(async (next: Language) => {
    setLanguageState(next);
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      // Ignore persistence failures — the in-memory language still applies.
    }
    await applyRTL(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      const dict = translations[language];
      const value = getByPath(dict, key) ?? getByPath(translations.en, key);
      if (typeof value !== 'string') return key;
      return interpolate(value, vars);
    },
    [language],
  );

  const value = useMemo<LanguageContextType>(
    () => ({ language, isRTL: language === 'ar', t, setLanguage }),
    [language, t, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
