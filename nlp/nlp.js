import { initializeRecognition } from './nlpModules/voiceRecognition.js';
import { sendRequest } from './nlpModules/modelRequest.js';

const button = document.getElementById('sendRequest');
let recognition; // Global recognition instance
let isRecognizing = false; // Toggle state to track if recognition is active

button.addEventListener('click', () => {
  if (!recognition) {
    recognition = initializeRecognition(sendRequest);
  }

  if (!isRecognizing) {
    recognition.isRecognizing = true; // Ensure recognition keeps running
    recognition.start();
    isRecognizing = true;
    button.textContent = 'Stop Speech Recognition';
  } else {
    recognition.isRecognizing = false;
    recognition.stop();
    isRecognizing = false;
    button.textContent = 'Start Speech Recognition';
  }
});
