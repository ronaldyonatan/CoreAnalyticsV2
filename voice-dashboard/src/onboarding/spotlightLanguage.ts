import { useCallback, useState } from 'react';

export type SpotlightLanguage = 'id' | 'en';

const LANGUAGE_STORAGE_KEY = 'core_spotlight_language_v2';

export const SPOTLIGHT_LANGUAGE_OPTIONS: Array<{
  value: SpotlightLanguage;
  label: string;
  shortLabel: string;
}> = [
  { value: 'en', label: 'English', shortLabel: 'EN' },
  { value: 'id', label: 'Indonesia', shortLabel: 'ID' },
];

export const SPOTLIGHT_LOCALES: Record<SpotlightLanguage, string> = {
  en: 'en-US',
  id: 'id-ID',
};

export const SPOTLIGHT_UI: Record<
  SpotlightLanguage,
  {
    languageLabel: string;
    audioOn: string;
    audioOff: string;
    audioUnavailable: string;
    audioOnTitle: string;
    audioOffTitle: string;
    audioUnavailableTitle: string;
    skip: string;
    back: string;
    next: string;
    finish: string;
  }
> = {
  id: {
    languageLabel: 'Bahasa spotlight',
    audioOn: 'AUDIO AKTIF',
    audioOff: 'AUDIO MATI',
    audioUnavailable: 'AUDIO N/A',
    audioOnTitle: 'Matikan narasi spotlight',
    audioOffTitle: 'Nyalakan narasi spotlight',
    audioUnavailableTitle: 'Text-to-speech tidak didukung oleh browser ini',
    skip: 'LEWATI PANDUAN',
    back: 'KEMBALI',
    next: 'LANJUT',
    finish: 'SELESAI ✓',
  },
  en: {
    languageLabel: 'Spotlight language',
    audioOn: 'AUDIO ON',
    audioOff: 'AUDIO OFF',
    audioUnavailable: 'AUDIO N/A',
    audioOnTitle: 'Turn spotlight narration off',
    audioOffTitle: 'Turn spotlight narration on',
    audioUnavailableTitle: 'Text-to-speech is not supported by this browser',
    skip: 'SKIP GUIDE',
    back: 'BACK',
    next: 'NEXT',
    finish: 'FINISH TOUR ✓',
  },
};

function readInitialLanguage(): SpotlightLanguage {
  if (typeof window === 'undefined') return 'en';

  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);

    if (stored === 'en' || stored === 'id') {
      return stored;
    }

    // Migrate the removed Korean option (or any unknown legacy value)
    // to the new English default.
    if (stored) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    }
  } catch {
    // Fall through to the default.
  }

  return 'en';
}

function persistLanguage(language: SpotlightLanguage) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Language switching still works for the current session.
  }
}

export default function useSpotlightLanguage() {
  const [language, setLanguageState] = useState<SpotlightLanguage>(readInitialLanguage);

  const setLanguage = useCallback((next: SpotlightLanguage) => {
    setLanguageState(next);
    persistLanguage(next);
  }, []);

  return {
    language,
    setLanguage,
  };
}
