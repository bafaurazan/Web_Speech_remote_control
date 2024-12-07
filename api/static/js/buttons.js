// Pobieranie elementów
const chatDiv = document.getElementById('chat');
const buttonsRoverDiv = document.getElementById('buttons-rover');
const buttonsDroneDiv = document.getElementById('buttons-drone');

const btnChat = document.getElementById('btn-chat');
const btnButtonsRover = document.getElementById('btn-buttons-rover');
const btnButtonsDrone = document.getElementById('btn-buttons-drone');

// Funkcja, która ukrywa wszystkie sekcje i pokazuje wybrany div
function showOnly(selectedDiv) {
    // Ukryj wszystkie divy
    chatDiv.classList.add('hidden');
    buttonsRoverDiv.classList.add('hidden');
    buttonsDroneDiv.classList.add('hidden');

    // Pokaż wybrany div
    selectedDiv.classList.remove('hidden');
}

// Na starcie pokazujemy tylko sekcję czatu
showOnly(chatDiv);

// Obsługa kliknięć przycisków
btnChat.addEventListener('click', () => showOnly(chatDiv)); // Pokazuje czat
btnButtonsRover.addEventListener('click', () => showOnly(buttonsRoverDiv)); // Pokazuje sekcję rover
btnButtonsDrone.addEventListener('click', () => showOnly(buttonsDroneDiv)); // Pokazuje sekcję drone

// Pobieranie przycisków
const dronebtnStart = document.getElementById('drone-btn-start');
const dronebtnStop = document.getElementById('drone-btn-stop');
const dronebtnForward = document.getElementById('drone-btn-forward');
const dronebtnBackward = document.getElementById('drone-btn-backward');
const dronebtnLeft = document.getElementById('drone-btn-left');
const dronebtnRight = document.getElementById('drone-btn-right');
const dronebtnUp = document.getElementById('drone-btn-up');
const dronebtnDown = document.getElementById('drone-btn-down');
const dronebtnSpeedUp = document.getElementById('drone-btn-speed-up');

const roverbtnStart = document.getElementById('rover-btn-start');
const roverbtnStop = document.getElementById('rover-btn-stop');
const roverbtnForward = document.getElementById('rover-btn-forward');
const roverbtnBackward = document.getElementById('rover-btn-backward');
const roverbtnLeft = document.getElementById('rover-btn-left');
const roverbtnRight = document.getElementById('rover-btn-right');
const roverbtnSpeedUp = document.getElementById('rover-btn-speed-up');

// Przypisywanie funkcji do kliknięć
dronebtnStart.addEventListener('click', () => console.log('Start'));
dronebtnStop.addEventListener('click', () => console.log('Stop'));
dronebtnForward.addEventListener('click', () => console.log('Przód'));
dronebtnBackward.addEventListener('click', () => console.log('Tył'));
dronebtnLeft.addEventListener('click', () => console.log('Lewo'));
dronebtnRight.addEventListener('click', () => console.log('Prawo'));
dronebtnUp.addEventListener('click', () => console.log('Do Góry'));
dronebtnDown.addEventListener('click', () => console.log('Do Dołu'));
dronebtnSpeedUp.addEventListener('click', () => console.log('Przyspiesz'));

roverbtnStart.addEventListener('click', () => console.log('Start'));
roverbtnStop.addEventListener('click', () => console.log('Stop'));
roverbtnForward.addEventListener('click', () => console.log('Przód'));
roverbtnBackward.addEventListener('click', () => console.log('Tył'));
roverbtnLeft.addEventListener('click', () => console.log('Lewo'));
roverbtnRight.addEventListener('click', () => console.log('Prawo'));
roverbtnSpeedUp.addEventListener('click', () => console.log('Przyspiesz'));

