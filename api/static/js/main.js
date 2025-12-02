console.log('In main.js!');


// =====================================================================
// 1. ZMIENNE GLOBALNE
// =====================================================================

let mapPeers = {};
let username;
let webSocket;

let localStream = new MediaStream();


// =====================================================================
// 2. ELEMENTY UI
// =====================================================================

// Logowanie
const usernameInput = document.querySelector('#username');
const passwordInput = document.querySelector('#password');
const login = document.querySelector('#login');
const formJoin = document.querySelector('#form-join');
const title = document.querySelector('.title');

// Wideo
const localVideo = document.querySelector('#local-video');
const btnToggleAudio = document.querySelector('#btn-toggle-audio');
const btnToggleVideo = document.querySelector('#btn-toggle-video');

// Chat
const btnSendMsg = document.querySelector('#btn-send-msg');
const messageList = document.querySelector('#message-list');
const messageInput = document.querySelector('#msg');

// Sterowanie robotem
const moveForward = document.querySelector('#rover-btn-forward');
const moveBackward = document.querySelector('#rover-btn-backward');
const moveRight = document.querySelector('#rover-btn-right');
const moveLeft = document.querySelector('#rover-btn-left');
const moveStop = document.querySelector('#rover-btn-stop');


// =====================================================================
// 3. LOGOWANIE I URUCHOMIENIE WEBSOCKET
// =====================================================================

formJoin.addEventListener('submit', (event) => {
    event.preventDefault();

    username = usernameInput.value;
    const password = passwordInput.value;

    if (!username || password !== 'a') {
        alert('Invalid username or password. Password must be "a".');
        return;
    }

    usernameInput.value = '';
    passwordInput.value = '';
    login.style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    title.innerHTML = `Logged in as: ${username}`;

    // WebSocket endpoint
    const wsStart = (window.location.protocol === 'https:') ? 'wss://' : 'ws://';
    const endPoint = wsStart + window.location.host + window.location.pathname;

    console.log('WebSocket endpoint: ', endPoint);

    webSocket = new WebSocket(endPoint);

    webSocket.addEventListener('open', () => {
        console.log('WS: Connection opened!');
        sendSignal('new-peer', {});
    });

    webSocket.addEventListener('message', webSocketOnMessage);
    webSocket.addEventListener('close', () => console.log('WS: Connection closed!'));
    webSocket.addEventListener('error', () => console.log('WS: Error occurred!'));
});


// Obsługa komunikatów z WebSocket
function webSocketOnMessage(event) {
    const parsed = JSON.parse(event.data);
    const peerUsername = parsed.peer;
    const action = parsed.action;
    const msg = parsed.message;

    if (username === peerUsername) return;

    const receiverChannel = msg.receiver_channel_name;

    if (action === 'new-peer')      return createOfferer(peerUsername, receiverChannel);
    if (action === 'new-offer')     return createAnswerer(msg.sdp, peerUsername, receiverChannel);
    if (action === 'new-answer')    return mapPeers[peerUsername][0].setRemoteDescription(msg.sdp);
}



// =====================================================================
// 4. KAMERA I MIKROFON
// =====================================================================

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localStream = stream;
        localVideo.srcObject = stream;
        localVideo.muted = true;

        const audioTrack = stream.getAudioTracks()[0];
        const videoTrack = stream.getVideoTracks()[0];

        audioTrack.enabled = true;
        videoTrack.enabled = true;

        btnToggleAudio.addEventListener('click', () => {
            audioTrack.enabled = !audioTrack.enabled;
            btnToggleAudio.innerHTML = audioTrack.enabled ? 'Audio Mute' : 'Audio Unmute';
        });

        btnToggleVideo.addEventListener('click', () => {
            videoTrack.enabled = !videoTrack.enabled;
            btnToggleVideo.innerHTML = videoTrack.enabled ? 'Video Off' : 'Video On';
        });
    })
    .catch(err => console.error('Media error:', err));



// =====================================================================
// 5. CHAT – WYSYŁANIE WIADOMOŚCI
// =====================================================================

btnSendMsg.addEventListener('click', sendMsgOnClick);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') btnSendMsg.click();
});

function sendMsgOnClick() {
    const msg = messageInput.value;
    if (!msg) return;

    const li = document.createElement('li');
    li.textContent = `Me: ${msg}`;
    messageList.appendChild(li);

    broadcast({ username, message: msg });

    messageInput.value = '';
}



// =====================================================================
// 6. STEROWANIE ROBOTEM
// =====================================================================

moveForward.addEventListener('click', () => sendToRobot("forward_rover"));
moveBackward.addEventListener('click', () => sendToRobot("backward_rover"));
moveRight.addEventListener('click', () => sendToRobot("right_rover"));
moveLeft.addEventListener('click', () => sendToRobot("left_rover"));
moveStop.addEventListener('click', () => sendToRobot("stop_rover"));

function sendToRobot(command) {
    console.log("Robot command:", command);
    broadcast({ username, message: command });
}



// =====================================================================
// 7. WebRTC – SYGNALIZACJA I POŁĄCZENIA P2P
// =====================================================================

function sendSignal(action, message) {
    webSocket.send(JSON.stringify({
        peer: username,
        action,
        message,
    }));
}


// Tworzy OFFER
function createOfferer(peerUsername, receiverChannel) {
    const peer = new RTCPeerConnection();

    addLocalTracks(peer);

    const dc = peer.createDataChannel('channel');
    dc.addEventListener('open', () => console.log('DC open'));
    dc.addEventListener('message', dcOnMessage);

    const remoteVideo = createVideo(peerUsername);
    setOnTrack(peer, remoteVideo);

    mapPeers[peerUsername] = [peer, dc];

    peer.addEventListener('iceconnectionstatechange', () => handleICE(peer, peerUsername, remoteVideo));

    peer.addEventListener('icecandidate', (e) => {
        if (!e.candidate) {
            sendSignal('new-offer', {
                sdp: peer.localDescription,
                receiver_channel_name: receiverChannel
            });
        }
    });

    peer.createOffer()
        .then((offer) => peer.setLocalDescription(offer));
}


// Tworzy ANSWER
function createAnswerer(offer, peerUsername, receiverChannel) {
    const peer = new RTCPeerConnection();

    addLocalTracks(peer);

    const remoteVideo = createVideo(peerUsername);
    setOnTrack(peer, remoteVideo);

    peer.addEventListener('datachannel', (e) => {
        const dc = e.channel;
        dc.addEventListener('open', () => console.log('DC open'));
        dc.addEventListener('message', dcOnMessage);
        mapPeers[peerUsername] = [peer, dc];
    });

    peer.addEventListener('iceconnectionstatechange', () => handleICE(peer, peerUsername, remoteVideo));

    peer.addEventListener('icecandidate', (e) => {
        if (!e.candidate) {
            sendSignal('new-answer', {
                sdp: peer.localDescription,
                receiver_channel_name: receiverChannel
            });
        }
    });

    peer.setRemoteDescription(offer)
        .then(() => peer.createAnswer())
        .then((answer) => peer.setLocalDescription(answer));
}



// =====================================================================
// 8. FUNKCJE POMOCNICZE
// =====================================================================

// Dodaje lokalne tracks (audio, video)
function addLocalTracks(peer) {
    localStream.getTracks().forEach(track =>
        peer.addTrack(track, localStream)
    );
}


// Obsługa wiadomości z DataChannel
function dcOnMessage(event) {
    const data = JSON.parse(event.data);

    // 1. OBSŁUGA DANYCH Z JOYSTICKA
    // Sprawdzamy, czy w przesłanych danych istnieje pole 'joystick'
    if (data.joystick) {
        console.log("Joystick command received:", data.joystick);
        // data.joystick to np. { linear: 0.5, angular: 0.1 }
        
        // TUTAJ możesz dodać kod przekazujący te wartości do silników robota
        // np. driveRobot(data.joystick.linear, data.joystick.angular);
        
        return; // Kończymy funkcję, żeby nie traktować tego jako czatu
    }

    // 2. OBSŁUGA KOMEND PRZYCISKÓW I CZATU (stary kod)
    const msg = data.message;

    // Jeśli msg jest puste (np. błąd danych), przerywamy
    if (!msg) return;

    const robotCommands = [
        "forward_rover", "backward_rover",
        "left_rover", "right_rover",
        "stop_rover"
    ];

    if (robotCommands.includes(msg)) {
        console.log("Robot receives command:", msg);
        // Tutaj obsługa przycisków (przód/tył/lewo/prawo)
        return;
    } else {
        console.log("Received chat msg: ", msg);
        const li = document.createElement('li');
        li.textContent = `${data.username}: ${msg}`;
        messageList.appendChild(li); 
    }
}


// Tworzy video element
function createVideo(peerUsername) {
    const container = document.querySelector('#video-container');
    const wrapper = document.createElement('div');
    const video = document.createElement('video');

    video.id = peerUsername + '-video';
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = new MediaStream();

    wrapper.appendChild(video);
    container.appendChild(wrapper);

    return video;
}


// Dodaje zdalny stream
function setOnTrack(peer, remoteVideo) {
    const remoteStream = remoteVideo.srcObject;
    peer.addEventListener('track', (e) => remoteStream.addTrack(e.track));
}


// Usuwa video po rozłączeniu
function handleICE(peer, peerUsername, remoteVideo) {
    const state = peer.iceConnectionState;

    if (['failed', 'disconnected', 'closed'].includes(state)) {
        delete mapPeers[peerUsername];

        if (state !== 'closed') peer.close();

        remoteVideo.parentNode.remove();
    }
}


// Pobiera wszystkie otwarte DataChannels
function getDataChannels() {
    const list = [];

    for (const peerUsername in mapPeers) {
        const dc = mapPeers[peerUsername][1];
        list.push(dc);
    }

    return list;
}


// Wysyła do wszystkich peerów
function broadcast(data) {
    const json = JSON.stringify(data);
    const channels = getDataChannels();

    for (const ch of channels) ch.send(json);
}
