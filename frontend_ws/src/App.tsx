import React, { useState, useRef } from 'react';
import './App.css'; 
import { VideoGrid } from './components/VideoGrid';
import { Chat } from './components/Chat';
import { JoystickController } from './components/JoystickController';
import { SpeechControl } from './components/SpeechControl';
import type { ChatMessage, PeerData, SignalMessage } from './types';

// --- AUTOMATYCZNE DOBIERANIE ADRESU ---
const getWebSocketUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const host = window.location.host; 
    return `${protocol}${host}/ws`; 
}; 

function App() {
  // --- STATE ---
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  
  // UI State
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isVideoStopped, setIsVideoStopped] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // UI Data State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<PeerData[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // --- REFS ---
  const ws = useRef<WebSocket | null>(null);
  const peerConnections = useRef<{ [username: string]: RTCPeerConnection }>({});
  const dataChannels = useRef<{ [username: string]: RTCDataChannel }>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  // ==========================
  // 1. MEDIA SETUP
  // ==========================
  const setupStream = (stream: MediaStream) => {
    localStreamRef.current = stream;
    setLocalStream(stream);

    // Domyślnie wyłączamy ścieżki (startujemy wyciszeni)
    stream.getAudioTracks().forEach(track => { track.enabled = false; });
    stream.getVideoTracks().forEach(track => { track.enabled = false; });
  };

  const startCamera = async () => {
    try {
        // ZMNIEJSZ rozdzielczość i klatkarz dla mniejszego opóźnienia
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
            video: {
                width: { ideal: 640 },   // Mniejsza rozdzielczość (np. 480p lub 640p)
                height: { ideal: 480 },
                frameRate: { ideal: 15, max: 20 } // 15-20 FPS wystarczy do sterowania, 60 FPS to zbędny narzut
            }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        setupStream(stream);
    } catch (err) {
      console.warn("Błąd pobierania obu urządzeń naraz. Próbuję niezależnie...", err);
      let videoStream: MediaStream | null = null;
      let audioStream: MediaStream | null = null;

      try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (e) { console.warn("Brak kamery/zablokowana"); }

      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      } catch (e) { console.warn("Brak mikrofonu/zablokowany"); }

      if (videoStream || audioStream) {
        const tracks = [
          ...(videoStream ? videoStream.getVideoTracks() : []),
          ...(audioStream ? audioStream.getAudioTracks() : [])
        ];
        const combinedStream = new MediaStream(tracks);
        setupStream(combinedStream);
      } else {
        alert("Nie udało się uzyskać dostępu do żadnego urządzenia wejściowego.");
      }
    }
  };

  // ==========================
  // 2. SIGNALING & WEBSOCKET
  // ==========================
  const connectWebSocket = (user: string) => {
    const url = getWebSocketUrl();
    console.log("Connecting to WS:", url);

    ws.current = new WebSocket(url);
    ws.current.onopen = () => {
      console.log('WS Connected');
      sendSignal('new-peer', {});
    };
    ws.current.onmessage = (event) => {
      const parsed: SignalMessage = JSON.parse(event.data);
      const { peer, action, message } = parsed;
      if (peer === user) return; 

      const receiverChannel = message.receiver_channel_name;
      if (action === 'new-peer') createOfferer(peer, receiverChannel);
      else if (action === 'new-offer') createAnswerer(message.sdp, peer, receiverChannel);
      else if (action === 'new-answer') {
        const pc = peerConnections.current[peer];
        if (pc && message.sdp) pc.setRemoteDescription(message.sdp);
      }
    };
  };

  const sendSignal = (action: string, message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ peer: username, action, message }));
    }
  };

  // ==========================
  // 3. WEBRTC CORE
  // ==========================
  const addLocalTracks = (pc: RTCPeerConnection) => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
    }
  };

  const createOfferer = async (peerUsername: string, receiverChannel: any) => {
    const pc = new RTCPeerConnection();
    peerConnections.current[peerUsername] = pc;
    addLocalTracks(pc);
    const dc = pc.createDataChannel('chat');
    setupDataChannel(dc, peerUsername);
    pc.onicecandidate = (e) => {
      if (!e.candidate) sendSignal('new-offer', { sdp: pc.localDescription, receiver_channel_name: receiverChannel });
    };
    pc.ontrack = (e) => handleRemoteTrack(e, peerUsername);
    pc.oniceconnectionstatechange = () => handleIceChange(pc, peerUsername);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
  };

  const createAnswerer = async (offer: any, peerUsername: string, receiverChannel: any) => {
    const pc = new RTCPeerConnection();
    peerConnections.current[peerUsername] = pc;
    addLocalTracks(pc);
    pc.ondatachannel = (e) => setupDataChannel(e.channel, peerUsername);
    pc.onicecandidate = (e) => {
        if (!e.candidate) sendSignal('new-answer', { sdp: pc.localDescription, receiver_channel_name: receiverChannel });
    };
    pc.ontrack = (e) => handleRemoteTrack(e, peerUsername);
    pc.oniceconnectionstatechange = () => handleIceChange(pc, peerUsername);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
  };

  const handleRemoteTrack = (e: RTCTrackEvent, peerUsername: string) => {
    const [stream] = e.streams;
    setRemotePeers(prev => {
        if (prev.find(p => p.username === peerUsername)) return prev;
        return [...prev, { username: peerUsername, stream }];
    });
  };

  const handleIceChange = (pc: RTCPeerConnection, peerUsername: string) => {
    if(['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
        delete peerConnections.current[peerUsername];
        delete dataChannels.current[peerUsername];
        setRemotePeers(prev => prev.filter(p => p.username !== peerUsername));
    }
  };

  const setupDataChannel = (dc: RTCDataChannel, peerUsername: string) => {
    dataChannels.current[peerUsername] = dc;
    dc.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.message && !data.joystick) {
            const robotCmds = ["forward_rover", "backward_rover", "left_rover", "right_rover", "stop_rover"];
            if (!robotCmds.includes(data.message)) {
                setChatMessages(prev => [...prev, { username: data.username, message: data.message, isMe: false }]);
            } else {
                console.log("Robot command received:", data.message);
            }
        }
        if (data.joystick) console.log("Joystick:", data.joystick);
    };
  };

  const broadcastData = (payload: any) => {
    const json = JSON.stringify(payload);
    Object.values(dataChannels.current).forEach(dc => { if (dc.readyState === 'open') dc.send(json); });
  };

  // --- ACTIONS ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username) {
      setIsLoggedIn(true);
      startCamera();
      connectWebSocket(username);
    }
  };

  const sendChatMessage = (msg: string) => {
    setChatMessages(prev => [...prev, { username: 'Me', message: msg, isMe: true }]);
    broadcastData({ username, message: msg });
  };
  const sendRobotCommand = (cmd: string) => broadcastData({ username, message: cmd });
  // Dodaj ref do przechowywania czasu ostatniego wysłania
  const lastSentTime = useRef<number>(0);

  const sendJoystickData = (lin: number, ang: number) => {
      const now = Date.now();
      // Wysyłaj max co 100ms (lub 50ms jeśli sieć jest dobra)
      // Wyjątek: Jeśli lin i ang to 0 (stop), wyślij natychmiast
      if ((lin === 0 && ang === 0) || (now - lastSentTime.current > 100)) {
          broadcastData({ username, joystick: { linear: lin, angular: ang } });
          lastSentTime.current = now;
      }
  };

  // --- TOGGLES (SAFE) ---
  const toggleAudio = () => {
    if (localStreamRef.current) {
        const tracks = localStreamRef.current.getAudioTracks();
        if (tracks.length > 0) {
            tracks[0].enabled = !tracks[0].enabled;
            setIsAudioMuted(!tracks[0].enabled);
        } else {
            alert("Brak dostępnego mikrofonu.");
        }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
        const tracks = localStreamRef.current.getVideoTracks();
        if (tracks.length > 0) {
            tracks[0].enabled = !tracks[0].enabled;
            setIsVideoStopped(!tracks[0].enabled);
        } else {
            alert("Brak dostępnej kamery.");
        }
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            Object.values(peerConnections.current).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
            });
            setLocalStream(screenStream);
            setIsScreenSharing(true);
            setIsVideoStopped(false); 
            screenTrack.onended = () => toggleScreenShare();
        } catch (e) { console.error(e); }
    } else {
        if(localStreamRef.current) {
            const camTrack = localStreamRef.current.getVideoTracks()[0];
            if (camTrack) camTrack.enabled = !isVideoStopped; 
            Object.values(peerConnections.current).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender && camTrack) sender.replaceTrack(camTrack);
            });
            setLocalStream(localStreamRef.current);
            setIsScreenSharing(false);
        }
    }
  };

  // --- NOWA FUNKCJA: Odświeżanie strumieni ---
  const refreshStreams = () => {
    console.log("Ręczne odświeżanie strumieni...");
    setRemotePeers([]); // Czyścimy widok
    
    // Zamykamy obecne połączenia dla pewności (wymuszenie restartu)
    Object.keys(peerConnections.current).forEach(key => {
        const pc = peerConnections.current[key];
        pc.close();
        delete peerConnections.current[key];
    });

    // Wysyłamy sygnał ponownego dołączenia
    sendSignal('new-peer', {});
  };

  // ==========================
  // RENDER
  // ==========================
  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <h1 className="title-header">Web Speech<br/>Remote Control</h1>
        <div className="login-card">
          <h2 className="login-title">Login</h2>
          <form onSubmit={handleLogin}>
            <div className="input-row">
              <svg className="input-icon" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              <input className="styled-input" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div className="input-row">
              <svg className="input-icon" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3 3.1-3 1.71 0 3.1 1.29 3.1 3v2z"/></svg>
              <input type="password" className="styled-input" placeholder="••••••" disabled />
            </div>
            <button type="submit" className="styled-btn">Login</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="top-bar">
        <div className="flex items-center gap-4">
            <button className="icon-btn" onClick={() => setShowMenu(!showMenu)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
            </button>
            <h1 className="text-xl font-bold m-0 hidden md:block">ROBOT CONTROL</h1>
        </div>
        <div className="flex gap-2">
            
            {/* KAMERA */}
            <button onClick={toggleVideo} className="icon-btn" title="Toggle Camera" style={{ color: isVideoStopped ? '#dc2626' : 'inherit' }}>
                 {isVideoStopped ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18 7c0-1.103-.897-2-2-2H4c-1.103 0-2 .897-2 2v10c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-3.333L22 17V7l-4 3.333V7z" opacity="0.5"/>
                        <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                 ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18 7c0-1.103-.897-2-2-2H4c-1.103 0-2 .897-2 2v10c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-3.333L22 17V7l-4 3.333V7z"/>
                    </svg>
                 )}
            </button>

            {/* MIKROFON */}
            <button onClick={toggleAudio} className="icon-btn" title="Toggle Mic" style={{ color: isAudioMuted ? '#dc2626' : 'inherit' }}>
                 {isAudioMuted ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" opacity="0.5"/>
                        <path d="M17 11c0 2.76-2.24 5-5 5-2.76 0-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                        <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                 ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                        <path d="M17 11c0 2.76-2.24 5-5 5-2.76 0-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                    </svg>
                 )}
            </button>

            {/* --- PRZYCISK ODŚWIEŻANIA (NOWY) --- */}
            <button onClick={refreshStreams} className="icon-btn" title="Refresh Connections">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/>
                </svg>
            </button>

            {/* SCREEN SHARE */}
            <button onClick={toggleScreenShare} className="icon-btn" title="Screen Share" style={{ color: isScreenSharing ? '#dc2626' : 'inherit' }}>
                 {isScreenSharing ? '⏹️' : '🖥️'}
            </button>
        </div>
      </header>

      {showMenu && (
          <div className="menu-overlay">
              <div className="border-b-2 border-purple-900 mb-2 pb-1">
                  <span className="text-sm font-bold block opacity-70">LOGGED IN AS</span>
                  <span className="text-xl font-bold">{username}</span>
              </div>
              <ul className="text-sm font-semibold space-y-2">
                  <li>Start speech recognition</li>
                  <li>Chat control</li>
                  <li>Directional button control</li>
              </ul>
              <button onClick={() => window.location.reload()} className="mt-4 bg-purple-700 text-white w-full py-1 rounded">
                  Log out
              </button>
          </div>
      )}

      <div className="main-grid">
        <div className="flex flex-col gap-4">
            
            {/* PANEL WIDEO */}
            <div className="panel" style={{ flex: 1, minHeight: '300px' }}>
               <VideoGrid 
                   localStream={localStream}
                   remotePeers={remotePeers}
                   isAudioMuted={isAudioMuted}
                   isVideoStopped={isVideoStopped}
                   isScreenSharing={isScreenSharing}
                   onToggleAudio={toggleAudio}
                   onToggleVideo={toggleVideo}
                   onShareScreen={toggleScreenShare}
               />
            </div>

            {/* PANEL JOYSTICKA */}
            <div className="panel">
                <JoystickController 
                    onMove={sendJoystickData} 
                    onStop={() => sendJoystickData(0,0)} 
                    onCommand={sendRobotCommand} 
                />
            </div>

        </div>

        {/* PRAWA KOLUMNA */}
        <div className="flex flex-col gap-4">
            <div className="panel">
                <h3 className="border-b-2 border-dashed border-purple-900 pb-1 mb-2 font-bold text-center">COMMANDS</h3>
                <SpeechControl onCommand={sendRobotCommand} />
            </div>
            <div className="panel flex-1" style={{ minHeight: '300px' }}>
                 <h3 className="border-b-2 border-dashed border-purple-900 pb-1 mb-2 font-bold text-center">CHAT / LOGS</h3>
                <Chat messages={chatMessages} onSendMessage={sendChatMessage} />
            </div>
        </div>
      </div>
    </div>
  );
}

export default App;