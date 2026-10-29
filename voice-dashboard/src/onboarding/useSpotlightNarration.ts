import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SPOTLIGHT_LOCALES,
  type SpotlightLanguage,
} from './spotlightLanguage';

const AUDIO_STORAGE_KEY = 'core_spotlight_audio_enabled';

// Build marker used only to verify that the latest spotlight bundle
// has reached the production container.
export const SPOTLIGHT_NARRATION_BUILD = 'spotlight-en-id-v2';

export interface SpotlightNarrationInput {
  active: boolean;
  stepKey: string;
  title: string;
  description: string;
  tip?: string;
  language: SpotlightLanguage;
}

function speechSupported() {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

function readInitialPreference() {
  if (typeof window === 'undefined') return true;

  try {
    // Default is ON. Only an explicit stored "off" disables narration.
    return localStorage.getItem(AUDIO_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function persistPreference(enabled: boolean) {
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Narration remains usable even when browser storage is blocked.
  }
}

function chooseVoice(synth: SpeechSynthesis, locale: string) {
  const voices = synth.getVoices();
  if (!voices.length) return undefined;

  const normalizedLocale = locale.toLowerCase();
  const languagePrefix = normalizedLocale.split('-')[0];

  return (
    voices.find(
      (voice) =>
        voice.lang.toLowerCase() === normalizedLocale &&
        voice.localService
    ) ||
    voices.find((voice) => voice.lang.toLowerCase() === normalizedLocale) ||
    voices.find(
      (voice) =>
        voice.lang.toLowerCase().startsWith(`${languagePrefix}-`) &&
        voice.localService
    ) ||
    voices.find((voice) =>
      voice.lang.toLowerCase().startsWith(languagePrefix)
    ) ||
    undefined
  );
}

export default function useSpotlightNarration({
  active,
  stepKey,
  title,
  description,
  tip,
  language,
}: SpotlightNarrationInput) {
  const [audioEnabled, setAudioEnabled] =
    useState<boolean>(readInitialPreference);

  const [narrationCompletion, setNarrationCompletion] = useState({
    stepKey: '',
    token: 0,
  });

  const supported = useMemo(() => speechSupported(), []);
  const narrationRunRef = useRef(0);

  // Narration is intentionally built from the same localized strings
  // rendered by the spotlight card.
  const narrationText = useMemo(
    () => [title, description, tip].filter(Boolean).join('. '),
    [description, tip, title]
  );

  // Clear completion from a previous run/step before fresh narration starts.
  // This prevents Replay or a language change on the same step from inheriting
  // an old speech-end event and auto-advancing too early.
  useEffect(() => {
    setNarrationCompletion((current) =>
      current.stepKey
        ? { stepKey: '', token: current.token }
        : current
    );
  }, [active, language, stepKey]);

  const stopNarration = useCallback(() => {
    narrationRunRef.current += 1;

    if (!supported) return;

    window.speechSynthesis.cancel();
  }, [supported]);

  const speakCurrentStep = useCallback(() => {
    if (
      !supported ||
      !active ||
      !audioEnabled ||
      !narrationText.trim()
    ) {
      return;
    }

    const synth = window.speechSynthesis;
    const locale = SPOTLIGHT_LOCALES[language];

    const runId = narrationRunRef.current + 1;
    narrationRunRef.current = runId;

    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(narrationText);

    utterance.lang = locale;

    // English is the default spotlight language.
    // Indonesian remains supported as the secondary option.
    utterance.rate = language === 'en' ? 0.94 : 0.92;
    utterance.pitch = language === 'en' ? 0.96 : 1.0;
    utterance.volume = 0.95;

    const voice = chooseVoice(synth, locale);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => {
      if (narrationRunRef.current !== runId) return;

      setNarrationCompletion((current) => ({
        stepKey,
        token: current.token + 1,
      }));
    };

    utterance.onerror = () => {
      // An interrupted/cancelled utterance must never auto-advance the tour.
    };

    synth.speak(utterance);
  }, [
    active,
    audioEnabled,
    language,
    narrationText,
    stepKey,
    supported,
  ]);

  useEffect(() => {
    if (!supported) return;

    if (!active || !audioEnabled) {
      stopNarration();
      return;
    }

    // Let route / spotlight / language transitions settle first.
    const timer = window.setTimeout(() => {
      speakCurrentStep();
    }, 220);

    return () => {
      window.clearTimeout(timer);
      stopNarration();
    };
  }, [
    active,
    audioEnabled,
    language,
    narrationText,
    speakCurrentStep,
    stepKey,
    stopNarration,
    supported,
  ]);

  useEffect(() => {
    return () => stopNarration();
  }, [stopNarration]);

  const toggleAudio = useCallback(() => {
    setAudioEnabled((current) => {
      const next = !current;

      persistPreference(next);

      if (!next) {
        stopNarration();
      }

      return next;
    });
  }, [stopNarration]);

  return {
    audioEnabled,
    audioSupported: supported,
    toggleAudio,
    stopNarration,
    speakCurrentStep,
    narrationCompletion,
  };
}
