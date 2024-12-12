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

// Pobieranie elementów
const btnRoverControl = document.getElementById('btn-rover-control');
let roverControlActive = false; // Zmienna przechowująca stan sterowania

// Funkcja włączająca/wyłączająca sterowanie łazikiem
btnRoverControl.addEventListener('click', () => {
    roverControlActive = !roverControlActive; // Zmieniamy stan sterowania
    if (roverControlActive) {
        btnRoverControl.textContent = "Wyłącz sterowanie łazikiem"; // Zmieniamy tekst przycisku
        console.log("Sterowanie łazikiem włączone");
    } else {
        btnRoverControl.textContent = "Włącz sterowanie łazikiem"; // Zmieniamy tekst przycisku
        console.log("Sterowanie łazikiem wyłączone");
    }
});

// Obsługa klawiszy - sterowanie dronem
document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase(); // Obsługa wielkich i małych liter

    if (!roverControlActive) return; // Jeśli sterowanie łazikiem jest wyłączone, ignorujemy naciśnięcie klawiszy

    switch (key) {
        case 'q': // Start
            document.getElementById('rover-btn-start').click();
            break;
        case 'w': // Przód
            document.getElementById('rover-btn-forward').click();
            console.log('rover_forward');
            break;
        case 'e': // Stop
            document.getElementById('rover-btn-stop').click();
            break;
        case 'a': // Lewo
            document.getElementById('rover-btn-left').click();
            console.log('rover_left');

            break;
        case 's': // Tył
            document.getElementById('rover-btn-backward').click();
            break;
        case 'd': // Prawo
            document.getElementById('rover-btn-right').click();
            console.log('rover_right');
            break;
        case 'r': // Przyspiesz
            document.getElementById('rover-btn-speed-up').click();
            break;
        default:
            // Inne klawisze - brak akcji
            break;
    }
});
