import React, { useState, useEffect, useRef } from 'react';

interface SpeechProps {
  onCommand: (cmd: string) => void;
}

export const SpeechControl: React.FC<SpeechProps> = ({ onCommand }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
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
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const trans = event.results[i][0].transcript.toLowerCase();
            if (event.results[i].isFinal) {
                setTranscript(prev => prev + ' ' + trans);
            } else {
                interim += trans;
                
                // Proste wykrywanie słów kluczowych w czasie rzeczywistym
                if (interim.includes("do przodu")) onCommand("forward_rover");
                if (interim.includes("w lewo")) onCommand("left_rover");
                if (interim.includes("w prawo")) onCommand("right_rover");
                if (interim.includes("do tyłu")) onCommand("backward_rover");
                if (interim.includes("stop")) onCommand("stop_rover");
            }
        }
    };

    recognitionRef.current = recognition;
  }, [onCommand]);

  const toggleRecording = () => {
    if (isRecording) {
        recognitionRef.current?.stop();
    } else {
        recognitionRef.current?.start();
    }
    setIsRecording(!isRecording);
  };

  return (
    <div className="border p-4 rounded bg-white">
      <h3 className="font-bold mb-2">Voice Control</h3>
      <button 
        onClick={toggleRecording}
        className={`w-full py-2 rounded text-white ${isRecording ? 'bg-red-500' : 'bg-blue-500'}`}
      >
        {isRecording ? 'Stop Listening' : 'Start Listening'}
      </button>
      <p className="text-sm text-gray-500 mt-2 italic">{transcript}</p>
    </div>
  );
};