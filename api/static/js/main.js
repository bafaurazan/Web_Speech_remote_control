console.log('In main.js!');

var mapPeers = {};

var usernameInput = document.querySelector('#username');
var passwordInput = document.querySelector('#password');
var login = document.querySelector('#login');
var formJoin = document.querySelector('#form-join');
var title = document.querySelector('.title');

var username;
var webSocket;

function webSocketOnMessage(event) {
    var parsedData = JSON.parse(event.data);

    var peerUsername = parsedData['peer'];
    var action = parsedData['action'];

    if (username == peerUsername) {
        return;
    }

    var receiver_channel_name = parsedData['message']['receiver_channel_name'];

    if (action == 'new-peer') {
        createOfferer(peerUsername, receiver_channel_name);
        return;
    }

    if (action == 'new-offer') {
        var offer = parsedData['message']['sdp'];
        createAnswerer(offer, peerUsername, receiver_channel_name);
        return;
    }

    if (action == 'new-answer') {
        var answer = parsedData['message']['sdp'];
        var peer = mapPeers[peerUsername][0];
        peer.setRemoteDescription(answer);
        return;
    }
}

formJoin.addEventListener('submit', (event) => {
    event.preventDefault(); // Zapobiega przeładowaniu strony po wysłaniu formularza

    username = usernameInput.value;
    var password = passwordInput.value;

    if (!username || password !== 'a') {
        alert('Invalid username or password. Password must be "a".');
        return;
    }

    console.log('username: ', username);

    // Ukrywanie formularza po poprawnym zalogowaniu
    usernameInput.value = '';
    passwordInput.value = '';
    login.style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';

    title.innerHTML = `Logged in as: ${username}`;

    var loc = window.location;
    var wsStart = 'ws://';

    if (loc.protocol == 'https:') {
        wsStart = 'wss://';
    }

    var endPoint = wsStart + loc.host + loc.pathname;

    console.log('endPoint: ', endPoint);

    webSocket = new WebSocket(endPoint);

    webSocket.addEventListener('open', (e) => {
        console.log('Connection Opened!');
        sendSignal('new-peer', {});
    });

    webSocket.addEventListener('message', webSocketOnMessage);
    webSocket.addEventListener('close', (e) => {
        console.log('Connection Closed!');
    });

    webSocket.addEventListener('error', (e) => {
        console.log('Error Occurred!');
    });
});

var localStream = new MediaStream();

const constraints = {
    'video': true,
    'audio': true
};

const localVideo = document.querySelector('#local-video');

const btnToggleAudio = document.querySelector('#btn-toggle-audio');
const btnToggleVideo = document.querySelector('#btn-toggle-video');

var userMedia = navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
        localStream = stream;
        localVideo.srcObject = localStream;
        localVideo.muted = true;

        var audioTracks = stream.getAudioTracks();
        var videoTracks = stream.getVideoTracks();

        audioTracks[0].enabled = true;
        videoTracks[0].enabled = true;

        btnToggleAudio.addEventListener('click', () => {
            audioTracks[0].enabled = !audioTracks[0].enabled;

            if(audioTracks[0].enabled){
                btnToggleAudio.innerHTML = 'Audio Mute';

                return;
            }

            btnToggleAudio.innerHTML = 'Audio Unmute';
        });

        btnToggleVideo.addEventListener('click', () => {
            videoTracks[0].enabled = !videoTracks[0].enabled;

            if(videoTracks[0].enabled){
                btnToggleVideo.innerHTML = 'Video Off';

                return;
            }

            btnToggleVideo.innerHTML = 'Video On';
        });
    })
    .catch(error => {
        console.log('Error accessing media devices.', error);
    });

var btnSendMsg = document.querySelector('#btn-send-msg');
var messageList = document.querySelector('#message-list');
var messageInput = document.querySelector('#msg');

btnSendMsg.addEventListener('click', sendMsgOnClick);

function sendMsgOnClick(){
    var message = messageInput.value;
    console.log("wysłane dane z sendMsgOnClick: ", message);

    var li = document.createElement('li');
    li.appendChild(document.createTextNode('Me: ' + message));
    messageList.appendChild(li);

    var dataChannels = getDataChannels();

    var dataToSend = {
        username: username,
        message: message
    };
    var jsonMessage = JSON.stringify(dataToSend);

    for(index in dataChannels){
        dataChannels[index].send(jsonMessage);
    }

    messageInput.value = '';
}

messageInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        btnSendMsg.click();
    }
});

var moveForward = document.querySelector('#rover-btn-forward');
var moveBackward = document.querySelector('#rover-btn-backward');
var moveRight = document.querySelector('#rover-btn-right');
var moveLeft = document.querySelector('#rover-btn-left');
var moveStop = document.querySelector('#rover-btn-stop');

moveForward.addEventListener('click', () => sendToRobot("forward_rover"));
moveBackward.addEventListener('click', () => sendToRobot("backward_rover"));
moveRight.addEventListener('click', () => sendToRobot("right_rover"));
moveLeft.addEventListener('click', () => sendToRobot("left_rover"));
moveStop.addEventListener('click', () => sendToRobot("stop_rover"));

function sendToRobot(command) {
    console.log("Wysłane dane dla robota: ", command);

    var dataChannels = getDataChannels();

    var dataToSend = {
        username: username,
        message: command
    };
    var jsonMessage = JSON.stringify(dataToSend);

    for (let index in dataChannels) {
        dataChannels[index].send(jsonMessage);
    }
}

function sendSignal(action, message){
    var jsonStr = JSON.stringify({
        'peer': username,
        'action': action,
        'message': message,
    });

    webSocket.send(jsonStr);
}

function createOfferer(peerUsername, receiver_channel_name){
    var peer = new RTCPeerConnection(null);

    addLocalTracks(peer);

    var dc = peer.createDataChannel('channel');
    dc.addEventListener('open', () => {
        console.log('Connection opened!');
    });
    dc.addEventListener('message', dcOnMessage);

    var remoteVideo = createVideo(peerUsername);
    setOnTrack(peer, remoteVideo);

    mapPeers[peerUsername] = [peer, dc];

    peer.addEventListener('iceconnectionstatechange', () => {
        var iceConnectionState = peer.iceConnectionState;

        if(iceConnectionState === 'failed' || iceConnectionState === 'disconnected' || iceConnectionState === 'closed'){
            delete mapPeers[peerUsername];

            if(iceConnectionState != 'closed'){
                peer.close();
            }

            removeVideo(remoteVideo);
        }
    });

    peer.addEventListener('icecandidate', (event) => {
        if(event.candidate){
            console.log('New ice candidate: ', JSON.stringify(peer.localDescription));

            return;
        }

        sendSignal('new-offer', {
            'sdp': peer.localDescription,
            'receiver_channel_name': receiver_channel_name
        });
    });

    peer.createOffer()
    .then(o => peer.setLocalDescription(o))
    .then(() => {
        console.log('Local description set successfully.');
    });
}

function createAnswerer(offer, peerUsername, receiver_channel_name){
    var peer = new RTCPeerConnection(null);

    addLocalTracks(peer);

    var remoteVideo = createVideo(peerUsername);
    setOnTrack(peer, remoteVideo);

    peer.addEventListener('datachannel', e => {
        peer.dc = e.channel;
        peer.dc.addEventListener('open', () => {
            console.log('Connection opened!');
        });
        peer.dc.addEventListener('message', dcOnMessage);

        mapPeers[peerUsername] = [peer, peer.dc];
    });

    peer.addEventListener('iceconnectionstatechange', () => {
        var iceConnectionState = peer.iceConnectionState;

        if(iceConnectionState === 'failed' || iceConnectionState === 'disconnected' || iceConnectionState === 'closed'){
            delete mapPeers[peerUsername];

            if(iceConnectionState != 'closed'){
                peer.close();
            }

            removeVideo(remoteVideo);
        }
    });

    peer.addEventListener('icecandidate', (event) => {
        if(event.candidate){
            console.log('New ice candidate: ', JSON.stringify(peer.localDescription));

            return;
        }

        sendSignal('new-answer', {
            'sdp': peer.localDescription,
            'receiver_channel_name': receiver_channel_name
        });
    });

    peer.setRemoteDescription(offer)
    .then(() => {
        console.log('Remote description set successfully for %s.', peerUsername);

        return peer.createAnswer();
    })
    .then(a => {
        console.log('Answer created!');

        peer.setLocalDescription(a);
    })
}

function addLocalTracks(peer){
    localStream.getTracks().forEach(track => {
        peer.addTrack(track, localStream);
    });

    return;
}

function dcOnMessage(event){
    console.log("Received message: ", event.data);  // Dodaj to dla sprawdzenia co jest odbierane.
    var data = JSON.parse(event.data);
    console.log("Received message: ", data);
    
    var username = data.username;
    var message = data.message;

    if (["forward_rover", "backward_rover", "left_rover", "right_rover", "stop_rover"].includes(message)) {
        console.log("wysłane dane do robota: ", message);
    }
    else{
        var li = document.createElement('li');
        li.appendChild(document.createTextNode(username + ': ' + message));
        messageList.appendChild(li);
        console.log("wysłane dane do użytkownika: ", message);
    }
}

function createVideo(peerUsername){
    var videoContainer = document.querySelector('#video-container');

    var remoteVideo = document.createElement('video');

    remoteVideo.id = peerUsername + '-video';
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;

    var videoWrapper = document.createElement('div');

    videoContainer.appendChild(videoWrapper);

    videoWrapper.appendChild(remoteVideo);

    return remoteVideo;
}

function setOnTrack(peer, remoteVideo){
    var remoteStream = new MediaStream();

    remoteVideo.srcObject = remoteStream;

    peer.addEventListener('track', async (event) => {
        remoteStream.addTrack(event.track, remoteStream);
    });
}

function removeVideo(video){
    var videoWrapper = video.parentNode;

    videoWrapper.parentNode.removeChild(videoWrapper);
}

function getDataChannels(){
    var dataChannels = [];

    for(peerUsername in mapPeers){
        var dataChannel = mapPeers[peerUsername][1];

        dataChannels.push(dataChannel);
    }
    return dataChannels;
}

