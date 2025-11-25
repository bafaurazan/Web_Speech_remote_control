document.addEventListener('DOMContentLoaded', () => {
    const joystickContainer = document.getElementById('rover-joystick-container');

    if (joystickContainer) {
        const joystick = nipplejs.create({
            zone: joystickContainer,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'blue'
        });

        joystick.on('move', (evt, data) => {
            if (data) {
                // data.distance i data.angle.radian pozwalają na obliczenie osi X/Y
                const maxDistance = joystick.options.size / 2 || 100; // normalizacja
                const distance = Math.min(data.distance, maxDistance);

                // obliczamy współrzędne w zakresie -1..1
                const angleRad = data.angle.radian;
                const linear = (distance * Math.sin(angleRad)) / maxDistance; // Y: góra-dół
                const angular = (distance * Math.cos(angleRad)) / maxDistance; // X: lewo-prawo

                // ograniczamy wartości do -1..1
                const linearClamped = Math.max(-1, Math.min(1, linear));
                const angularClamped = Math.max(-1, Math.min(1, angular));

                // wysyłamy do robota
                sendToRobot({
                    linear: linearClamped,
                    angular: angularClamped
                });
            }
        });

        joystick.on('end', () => {
            // joystick zwolniony → prędkości zerowe
            sendToRobot({ linear: 0, angular: 0 });
        });
    }

    // Funkcja do wysyłania danych – możesz podpiąć pod WebRTC/WebSocket
    function sendToRobot(data) {
        console.log('Dane joysticka wysłane do robota:', data);

        var dataChannels = getDataChannels(); // Twoja funkcja zwracająca WebRTC DataChannels

        var payload = {
            username: username,
            joystick: data
        };
        const jsonMessage = JSON.stringify(payload);

        for (let channel of dataChannels) {
            channel.send(jsonMessage);
        }
    }
});