import { useState, useRef, useCallback } from "react";

interface SpeechState {
  listening: boolean;
  supported: boolean;
}

export function useSpeechRecognition(onTranscript: (text: string) => void) {
  const [state, setState] = useState<SpeechState>({
    listening: false,
    supported: typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
  });

  const recognitionRef = useRef<InstanceType<typeof window.SpeechRecognition> | null>(null);

  const start = useCallback(() => {
    const SR =
      (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;

    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      onTranscript(transcript);
    };

    recognition.onend = () => {
      setState((s) => ({ ...s, listening: false }));
    };

    recognition.onerror = () => {
      setState((s) => ({ ...s, listening: false }));
    };

    recognitionRef.current = recognition;
    recognition.start();
    setState((s) => ({ ...s, listening: true }));
  }, [onTranscript]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setState((s) => ({ ...s, listening: false }));
  }, []);

  const toggle = useCallback(() => {
    if (state.listening) {
      stop();
    } else {
      start();
    }
  }, [state.listening, start, stop]);

  return { ...state, toggle };
}
