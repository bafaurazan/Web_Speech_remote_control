// controls.js
// ======================================================================
// Ten plik łączy buttons.js + joystick.js w jedno logiczne miejsce
// ======================================================================

document.addEventListener('DOMContentLoaded', () => {

    // =========================================================================
    // 1. SEKCE PRZYCISKÓW — POKAZYWANIE / UKRYWANIE (z buttons.js)
    // =========================================================================

    const chatDiv = document.getElementById('chat');
    const buttonsRoverDiv = document.getElementById('buttons-rover');
    const btnChat = document.getElementById('btn-chat');
    const btnButtonsRover = document.getElementById('btn-buttons-rover');

    function showOnly(selectedDiv) {
        chatDiv.classList.add('hidden');
        buttonsRoverDiv.classList.add('hidden');
        selectedDiv.classList.remove('hidden');
    }

    showOnly(chatDiv);

    btnChat.addEventListener('click', () => showOnly(chatDiv));
    btnButtonsRover.addEventListener('click', () => showOnly(buttonsRoverDiv));


    // =========================================================================
    // 2. STEROWANIE ŁAZIKIEM KLAWIATURĄ
    // =========================================================================

    const btnRoverControl = document.getElementById('btn-rover-control');
    let roverControlActive = false;

    btnRoverControl.addEventListener('click', () => {
        roverControlActive = !roverControlActive;
        btnRoverControl.textContent = roverControlActive
            ? "Stop Rover keyboard control"
            : "Start Rover keyboard control";

        console.log(roverControlActive ? "Sterowanie łazikiem włączone" : "Sterowanie łazikiem wyłączone");
    });

    document.addEventListener('keydown', (event) => {
        if (!roverControlActive) return;

        const key = event.key.toLowerCase();

        switch (key) {
            case 'q':
                document.getElementById('rover-btn-start').click();
                break;
            case 'w':
                document.getElementById('rover-btn-forward').click();
                break;
            case 'e':
                document.getElementById('rover-btn-stop').click();
                break;
            case 'a':
                document.getElementById('rover-btn-left').click();
                break;
            case 's':
                document.getElementById('rover-btn-backward').click();
                break;
            case 'd':
                document.getElementById('rover-btn-right').click();
                break;
            case 'r':
                document.getElementById('rover-btn-speed-up').click();
                break;
            default:
                break;
        }
    });


    // =========================================================================
    // 3. JOYSTICK 
    // =========================================================================

    const joystickContainer = document.getElementById('rover-joystick-container');

    if (joystickContainer) {

        const joystick = nipplejs.create({
            zone: joystickContainer,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'blue'
        });

        joystick.on('move', (evt, data) => {
            if (!data) return;

            const maxDistance = joystick.options.size / 2 || 100;
            const distance = Math.min(data.distance, maxDistance);

            const angleRad = data.angle.radian;

            const linear = (distance * Math.sin(angleRad)) / maxDistance;
            const angular = (distance * Math.cos(angleRad)) / maxDistance;

            const linearClamped = Math.max(-1, Math.min(1, linear));
            const angularClamped = Math.max(-1, Math.min(1, angular));

            sendToRobot({
                linear: linearClamped,
                angular: angularClamped
            });
        });

        joystick.on('end', () => {
            sendToRobot({ linear: 0, angular: 0 });
        });
    }


    // =========================================================================
    // 4. Wysyłanie danych do robota — wspólna funkcja dla klawiatury + joysticka
    // =========================================================================

    function sendToRobot(data) {
        console.log('Dane wysłane do robota:', data);

        const dataChannels = getDataChannels(); // MUSISZ mieć tę funkcję w webrtc.js

        const payload = {
            username: username,   // MUSI istnieć globalnie z loginu
            joystick: data
        };

        const json = JSON.stringify(payload);

        for (let ch of dataChannels) {
            ch.send(json);
        }
    }

});
