const recordingStatus = document.getElementById('recording-status');
const recognizedText = document.getElementById('recognized-text');

const MyRecordBtn = document.getElementById('my-record-btn');
let isRecognizing = false; // Toggle state to track if recognition is active

// Sprawdzenie dostępności Web Speech API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
    alert('Web Speech API nie jest wspierane w tej przeglądarce.');
} else {
    const recognition = new SpeechRecognition();
    recognition.lang = 'pl-PL';
    recognition.continuous = true; // Umożliwia ciągłe rozpoznawanie
    recognition.interimResults = true; // Umożliwia zwracanie wyników pośrednich

    recognition.onstart = function() {
        recordingStatus.textContent = 'Nagrywanie...';
    };

    let lastIndex = 0;

    recognition.onresult = function(event) {
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                recognizedText.textContent += transcript + ' ';
            } else {
                interimTranscript += transcript;

                let activators = ["do przodu","w lewo","w prawo","do tyłu","stop"];
                let indexForward = interimTranscript.toLowerCase().indexOf(activators[0], lastIndex);
                let indexLeft = interimTranscript.toLowerCase().indexOf(activators[1], lastIndex);
                let indexRight = interimTranscript.toLowerCase().indexOf(activators[2], lastIndex);
                let indexBackward = interimTranscript.toLowerCase().indexOf(activators[3], lastIndex);
                let indexStop = interimTranscript.toLowerCase().indexOf(activators[4], lastIndex);

                if (indexForward !== -1) {
                    console.log("Słowo '"+activators[0]+`' wykryto na indeksie ${indexForward}`);
                    lastIndex = indexForward + activators[0].length; // Ustawienie nowego startowego indeksu
                    sendToRobot("forward_rover");
                }

                if (indexLeft !== -1) {
                    console.log("Słowo '"+activators[1]+`' wykryto na indeksie ${indexLeft}`);
                    lastIndex = indexLeft + activators[1].length; // Ustawienie nowego startowego indeksu
                    sendToRobot("left_rover");
                }

                if (indexRight !== -1) {
                    console.log("Słowo '"+activators[2]+`' wykryto na indeksie ${indexRight}`);
                    lastIndex = indexRight + activators[2].length; // Ustawienie nowego startowego indeksu
                    sendToRobot("right_rover");
                }

                if (indexBackward !== -1) {
                    console.log("Słowo '"+activators[3]+`' wykryto na indeksie ${indexBackward}`);
                    lastIndex = indexBackward + activators[3].length; // Ustawienie nowego startowego indeksu
                    sendToRobot("backward_rover");
                }

                if (indexStop !== -1) {
                    console.log("Słowo '"+activators[4]+`' wykryto na indeksie ${indexStop}`);
                    lastIndex = indexStop + activators[4].length; // Ustawienie nowego startowego indeksu
                    sendToRobot("stop_rover");
                }
            }
        }
        
        // Jeśli transcript jest pusty, zresetuj liczniki
        if (interimTranscript.trim() === '') {
            lastIndex = 0;
        }

        recordingStatus.textContent = 'Nagrywanie... (tymczasowy tekst: ' + interimTranscript + ')';
    };

    recognition.onerror = function(event) {
        recordingStatus.textContent = 'Błąd w rozpoznawaniu mowy: ' + event.error;
    };

    recognition.onend = function() {
        recordingStatus.textContent = 'Nagrywanie zakończone.';
    };
    
    MyRecordBtn.addEventListener('click', () => {
      if (!isRecognizing) {
        recognition.isRecognizing = true; // Ensure recognition keeps running
        recognition.start();
        isRecognizing = true;
        MyRecordBtn.textContent = 'Stop Speech Recognition';
      } else {
        recognition.isRecognizing = false;
        recognition.stop();
        isRecognizing = false;
        MyRecordBtn.textContent = 'Start Speech Recognition';
      }
    });
}