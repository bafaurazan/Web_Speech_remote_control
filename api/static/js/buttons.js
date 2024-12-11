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
dronebtnStart.addEventListener('click', () => console.log('droneStart'));
dronebtnStop.addEventListener('click', () => console.log('droneStop'));
dronebtnForward.addEventListener('click', () => console.log('dronePrzód'));
dronebtnBackward.addEventListener('click', () => console.log('droneTył'));
dronebtnLeft.addEventListener('click', () => console.log('droneLewo'));
dronebtnRight.addEventListener('click', () => console.log('dronePrawo'));
dronebtnUp.addEventListener('click', () => console.log('droneDo Góry'));
dronebtnDown.addEventListener('click', () => console.log('droneDo Dołu'));
dronebtnSpeedUp.addEventListener('click', () => console.log('dronePrzyspiesz'));

roverbtnStart.addEventListener('click', () => console.log('roverStart'));
roverbtnStop.addEventListener('click', () => console.log('roverStop'));
roverbtnForward.addEventListener('click', () => console.log('roverPrzód'));
roverbtnBackward.addEventListener('click', () => console.log('roverTył'));
roverbtnLeft.addEventListener('click', () => console.log('roverLewo'));
roverbtnRight.addEventListener('click', () => console.log('roverPrawo'));
roverbtnSpeedUp.addEventListener('click', () => console.log('roverPrzyspiesz'));

document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase(); // Obsługa wielkich i małych liter

    switch (key) {
        case 'q':
            document.getElementById('drone-btn-start').click();
            break;
        case 'w':
            document.getElementById('drone-btn-forward').click();
            break;
        case 'e':
            document.getElementById('drone-btn-stop').click();
            break;
        case 'a':
            document.getElementById('drone-btn-left').click();
            break;
        case 's':
            document.getElementById('drone-btn-backward').click();
            break;
        case 'd':
            document.getElementById('drone-btn-right').click();
            break;
        case 'r':
            document.getElementById('drone-btn-up').click();
            break;
        case 'f':
            document.getElementById('drone-btn-down').click();
            break;
        default:
            // Inne klawisze - brak akcji
            break;
    }
});


document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase(); // Obsługa wielkich i małych liter

    // Mapowanie klawiszy dla panelu rover
    switch (key) {
        case 'q': // Start
            document.getElementById('rover-btn-start').click();
            break;
        case 'w': // Przód
            document.getElementById('rover-btn-forward').click();
            break;
        case 'e': // Stop
            document.getElementById('rover-btn-stop').click();
            break;
        case 'a': // Lewo
            document.getElementById('rover-btn-left').click();
            break;
        case 's': // Tył
            document.getElementById('rover-btn-backward').click();
            break;
        case 'd': // Prawo
            document.getElementById('rover-btn-right').click();
            break;
        case 'r': // Przyspiesz
            document.getElementById('rover-btn-speed-up').click();
            break;
        default:
            // Inne klawisze - brak akcji
            break;
    }
});
