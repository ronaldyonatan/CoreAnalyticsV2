import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVoiceCommandProps {
  onStatusChange?: (status: string) => void;
}

export function useVoiceCommand({ onStatusChange }: UseVoiceCommandProps = {}) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef<boolean>(false);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onStatusChangeRef.current?.('Speech Recognition API tidak didukung di browser ini.');
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.interimResults = false;
    recognition.continuous = true;

    recognition.onstart = () => {
      shouldListenRef.current = true;
      setIsListening(true);
      onStatusChangeRef.current?.('Microphone active. Say a command...');
    };

    recognition.onresult = (event: any) => {
      const results = event.results;
      const latestResult = results[results.length - 1];
      if (latestResult && latestResult[0]) {
        const transcript = latestResult[0].transcript.trim();
        console.log('🎤 Voice Detected (Global):', transcript);

        // Hanya pancarkan via CustomEvent agar tidak terjadi eksekusi ganda
        window.dispatchEvent(new CustomEvent('coa-voice-command', { detail: transcript }));
      }
    };

    recognition.onerror = (event: any) => {
      console.error('🎤 Speech Recognition Error:', event.error);
      if (event.error === 'not-allowed') {
        shouldListenRef.current = false;
        setIsListening(false);
        onStatusChangeRef.current?.('Microphone access denied.');
      }
    };

    recognition.onend = () => {
      if (shouldListenRef.current) {
        try {
          recognition.start();
        } catch (e) {}
      } else {
        setIsListening(false);
        onStatusChangeRef.current?.('Voice recognition paused.');
      }
    };

    recognitionRef.current = recognition;

    try {
      shouldListenRef.current = true;
      recognition.start();
    } catch (e) {}
  }, []);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
    }
    setIsListening(false);
    onStatusChangeRef.current?.('Voice recognition paused.');
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
    };
  }, []);

  return {
    isListening,
    toggleListening,
    startListening,
    stopListening
  };
}