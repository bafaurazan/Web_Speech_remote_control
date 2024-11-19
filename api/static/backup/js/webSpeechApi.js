const startRecordBtn = document.getElementById('start-record-btn');
            const stopRecordBtn = document.getElementById('stop-record-btn');
            const recordingStatus = document.getElementById('recording-status');
            const recognizedText = document.getElementById('recognized-text');
    
            // Sprawdzenie dostępności Web Speech API
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                alert('Web Speech API nie jest wspierane w tej przeglądarce.');
            } else {
                const recognition = new SpeechRecognition();
                recognition.continuous = true; // Umożliwia ciągłe rozpoznawanie
                recognition.interimResults = true; // Umożliwia zwracanie wyników pośrednich
    
                recognition.onstart = function() {
                    recordingStatus.textContent = 'Nagrywanie...';
                };
    
                let lastIndexStart = 0;
                let lastIndexStop = 0;
    
                recognition.onresult = function(event) {
                    let interimTranscript = '';
    
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        const transcript = event.results[i][0].transcript;
                        if (event.results[i].isFinal) {
                            recognizedText.textContent += transcript + ' ';
                        } else {
                            interimTranscript += transcript;
    
                            // Sprawdzanie i znajdowanie indeksu słowa "start" po ostatnim znalezionym indeksie
                            let indexStart = interimTranscript.toLowerCase().indexOf("start", lastIndexStart);
                            if (indexStart !== -1) {
                                console.log(`Słowo 'start' wykryto na indeksie ${indexStart}`);
                                lastIndexStart = indexStart + "start".length; // Ustawienie nowego startowego indeksu
                                sendToRobotForward();
                            }
    
                            // Sprawdzanie i znajdowanie indeksu słowa "stop" po ostatnim znalezionym indeksie
                            let indexStop = interimTranscript.toLowerCase().indexOf("stop", lastIndexStop);
                            if (indexStop !== -1) {
                                console.log(`Słowo 'stop' wykryto na indeksie ${indexStop}`);
                                lastIndexStop = indexStop + "stop".length; // Ustawienie nowego startowego indeksu
                                sendToRobotBackward();
                            }
                        }
                    }
                    
                    // Jeśli transcript jest pusty, zresetuj liczniki
                    if (interimTranscript.trim() === '') {
                        lastIndexStart = 0;
                        lastIndexStop = 0;
                    }
    
                    recordingStatus.textContent = 'Nagrywanie... (tymczasowy tekst: ' + interimTranscript + ')';
                };
    
                recognition.onerror = function(event) {
                    recordingStatus.textContent = 'Błąd w rozpoznawaniu mowy: ' + event.error;
                };
    
                recognition.onend = function() {
                    recordingStatus.textContent = 'Nagrywanie zakończone.';
                };
    
                startRecordBtn.onclick = function() {
                    recognition.start();
                    startRecordBtn.disabled = true;
                    stopRecordBtn.disabled = false;
                };
    
                stopRecordBtn.onclick = function() {
                    recognition.stop();
                    startRecordBtn.disabled = false;
                    stopRecordBtn.disabled = true;
                };
            }