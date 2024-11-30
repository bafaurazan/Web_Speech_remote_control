
const btnShareScreen = document.querySelector('#btn-share-screen');


let screenStream = null;
let isScreenCapturing = false;

// Funkcja do przechwytywania ekranu
async function startScreenCapture() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Usuwanie poprzedniego video track, jeśli istnieje
        const sender = localStream.getVideoTracks()[0];
        if (sender) {
            localStream.removeTrack(sender);
        }
        localStream.addTrack(screenTrack);

        // Zaktualizuj wszystkie połączenia WebRTC
        for (const peerUsername in mapPeers) {
            const peer = mapPeers[peerUsername][0];
            const senders = peer.getSenders();
            const videoSender = senders.find(s => s.track.kind === 'video');
            if (videoSender) {
                videoSender.replaceTrack(screenTrack);
            }
        }

        // Wyświetl ekran na lokalnym podglądzie
        localVideo.srcObject = localStream;

        // Zatrzymaj screen-sharing, gdy użytkownik zakończy
        screenTrack.onended = () => {
            stopSharingScreen();
        };

        // Zmiana stanu
        isScreenCapturing = true;
        console.log('Screen capture started');
    } catch (error) {
        console.error('Error accessing screen capture: ', error);
        alert('Unable to capture screen.');
    }
}

// Funkcja do zatrzymywania udostępniania ekranu
function stopSharingScreen() {
    // Jeśli istnieje screenStream, zatrzymaj jego track
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }

    // Przywrócenie poprzedniego streamu wideo z kamery
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            localStream = stream;
            localVideo.srcObject = localStream;

            // Zaktualizuj wszystkie połączenia WebRTC
            for (const peerUsername in mapPeers) {
                const peer = mapPeers[peerUsername][0];
                const senders = peer.getSenders();
                const videoSender = senders.find(s => s.track.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(stream.getVideoTracks()[0]);
                }
            }

            console.log('Screen capture stopped');
        })
        .catch(error => {
            console.error('Error stopping screen capture: ', error);
        });

    // Zmiana stanu
    isScreenCapturing = false;
}

// Obsługa przycisku do rozpoczęcia udostępniania ekranu
btnShareScreen.addEventListener('click', () => {
    if (btnShareScreen.innerHTML === 'Share Screen') {
        startScreenCapture();
        btnShareScreen.innerHTML = 'Stop Sharing Screen';
    } else {
        stopSharingScreen();
        btnShareScreen.innerHTML = 'Share Screen';
    }
});