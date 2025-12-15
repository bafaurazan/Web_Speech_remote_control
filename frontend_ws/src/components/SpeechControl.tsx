import React, { useState, useEffect, useRef } from 'react';

interface SpeechProps {
  onCommand: (cmd: string) => void;
}

export const SpeechControl: React.FC<SpeechProps> = ({ onCommand }) => {
  const [isRecording, setIsRecording] = useState(false);
  
  // Tekst zatwierdzony (historia)
  const [transcript, setTranscript] = useState('');
  // Tekst "w locie" (to co mówisz teraz)
  const [interimTranscript, setInterimTranscript] = useState('');
  
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech API not supported");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pl-PL';
    recognition.continuous = true;
    recognition.interimResults = true; // To pozwala widzieć tekst w trakcie mówienia

    recognition.onresult = (event: any) => {
        let finalChunk = '';
        let interimChunk = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const trans = event.results[i][0].transcript;
            
            if (event.results[i].isFinal) {
                // Jeśli zdanie jest zakończone, dodaj do głównej historii
                finalChunk += trans;
            } else {
                // Jeśli wciąż mówisz, dodaj do tymczasowego bufora
                interimChunk += trans;
            }
        }

        // Aktualizacja stanów
        if (finalChunk) {
            setTranscript(prev => prev + ' ' + finalChunk);
            // Wykrywanie komend w finalnym tekście (opcjonalne, dla pewności)
            checkCommands(finalChunk.toLowerCase());
        }
        
        setInterimTranscript(interimChunk);
        
        // Wykrywanie komend w czasie rzeczywistym (szybsza reakcja)
        if (interimChunk) {
            checkCommands(interimChunk.toLowerCase());
        }
    };

    // Obsługa błędów i kończenia
    recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error === 'not-allowed') setIsRecording(false);
    };

    recognitionRef.current = recognition;
  }, [onCommand]);

  const checkCommands = (text: string) => {
      // Prosta debouncing logic could be added here to avoid double trigger
      if (text.includes("do przodu")) onCommand("forward_rover");
      if (text.includes("w lewo")) onCommand("left_rover");
      if (text.includes("w prawo")) onCommand("right_rover");
      if (text.includes("do tyłu")) onCommand("backward_rover");
      if (text.includes("stop")) onCommand("stop_rover");
  };

  const toggleRecording = () => {
    if (isRecording) {
        recognitionRef.current?.stop();
    } else {
        // Czyścimy interim przy starcie
        setInterimTranscript('');
        recognitionRef.current?.start();
    }
    setIsRecording(!isRecording);
  };

  const clearTranscript = () => {
      setTranscript('');
      setInterimTranscript('');
  };

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex gap-2">
          <button 
            onClick={toggleRecording}
            className={`flex-1 py-2 rounded text-white font-bold transition-colors ${
                isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isRecording ? '⏹ Stop Listening' : '🎤 Start Listening'}
          </button>
          
          <button 
            onClick={clearTranscript}
            className="px-3 py-2 bg-gray-300 rounded hover:bg-gray-400 text-gray-800"
            title="Clear logs"
          >
            🗑️
          </button>
      </div>

      {/* Obszar wyświetlania tekstu - używa klasy z Twojego CSS */}
      <div className="transcript-area flex-1 overflow-y-auto">
          <span className="text-gray-800">{transcript}</span>
          {/* Tekst dynamiczny jest wyświetlany w innym stylu (szary/kursywa) */}
          <span className="text-purple-600 font-bold italic ml-1">{interimTranscript}</span>
      </div>
      
      {isRecording && (
          <div className="text-xs text-center text-red-600 animate-pulse font-bold">
              ● Listening... Say: "Do przodu", "Stop"
          </div>
      )}
    </div>
  );
};