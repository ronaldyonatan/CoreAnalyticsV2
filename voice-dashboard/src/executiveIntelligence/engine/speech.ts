export interface FridaySpeechOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

function waitForVoices(
  synth: SpeechSynthesis,
  timeoutMs = 700
): Promise<SpeechSynthesisVoice[]> {
  const immediate = synth.getVoices();
  if (immediate.length > 0) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      synth.removeEventListener?.("voiceschanged", finish);
      resolve(synth.getVoices());
    };

    synth.addEventListener?.("voiceschanged", finish, { once: true });
    window.setTimeout(finish, timeoutMs);
  });
}

function scoreFridayVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  let score = 0;

  if (lang.startsWith("id")) score += 100;

  // Common female-voice hints across macOS/Chrome/Windows.
  if (
    /female|woman|damayanti|siti|gadis|indonesia|google bahasa indonesia/.test(
      name
    )
  ) {
    score += 35;
  }

  if (/male|man|andika|ardi/.test(name)) {
    score -= 25;
  }

  if (voice.default) score += 5;

  return score;
}

async function pickFridayVoice(
  synth: SpeechSynthesis
): Promise<SpeechSynthesisVoice | null> {
  const voices = await waitForVoices(synth);
  if (!voices.length) return null;

  return [...voices].sort(
    (a, b) => scoreFridayVoice(b) - scoreFridayVoice(a)
  )[0] ?? null;
}

export function cancelFridaySpeech(): void {
  const synth = getSpeechSynthesis();
  synth?.cancel();
}

export async function speakFriday(
  text: string,
  options: FridaySpeechOptions = {}
): Promise<void> {
  const synth = getSpeechSynthesis();

  // Server-side render / unsupported browser: silently continue with visuals.
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
    return;
  }

  synth.cancel();

  // Chrome can leave speechSynthesis paused after SpeechRecognition / route
  // transitions. Explicitly resume before the first Executive Briefing scene.
  try {
    synth.resume();
  } catch {}

  const voice = await pickFridayVoice(synth);

  return new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);

    utterance.lang = options.lang ?? "id-ID";
    utterance.rate = options.rate ?? 0.92;
    utterance.pitch = options.pitch ?? 1.08;
    utterance.volume = options.volume ?? 1;

    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || utterance.lang;
    }

    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      resolve();
    };

    utterance.onend = finish;

    // Do not break the whole presentation when a browser voice fails.
    utterance.onerror = finish;

    try {
      synth.resume();
    } catch {}
    synth.speak(utterance);

    // Chrome kadang menerima speak() saat masih paused setelah sesi
    // SpeechRecognition. Resume sekali lagi setelah event loop berikutnya.
    window.setTimeout(() => {
      if (completed) return;
      try {
        synth.resume();
      } catch {}
    }, 120);
  });
}
