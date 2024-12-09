// Text to speech using Web Speech API
export function initializeRecognition(sendRequest) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Your browser does not support the Web Speech API');
    return null;
  }

  const recognitionInstance = new SpeechRecognition();
  recognitionInstance.lang = 'pl-PL';
  recognitionInstance.interimResults = false;
  recognitionInstance.maxAlternatives = 1;

  // Custom property to track if recognition should keep running
  recognitionInstance.isRecognizing = false;

  recognitionInstance.onresult = (event) => {
    const speechResult = event.results[0][0].transcript;
    console.log('Speech recognized:', speechResult);
    sendRequest(speechResult);
  };

  recognitionInstance.onerror = (event) => {
    console.error(`Error occurred in recognition: ${event.error}`);
    if (event.error === 'no-speech' && recognitionInstance.isRecognizing) {
      setTimeout(() => {
        recognitionInstance.start();
      }, 100);
    }
  };

  recognitionInstance.onend = () => {
    // Restart recognition only if it should keep running
    if (recognitionInstance.isRecognizing) {
      recognitionInstance.start();
    }
  };

  return recognitionInstance;
}
