import React, { useState, useRef, useEffect } from 'react';
import './App.css'; 
import { VideoGrid } from './components/VideoGrid';
import { Chat } from './components/Chat';
import { JoystickController } from './components/JoystickController';
import { SpeechControl } from './components/SpeechControl';
import type { ChatMessage, PeerData, SignalMessage } from './types';

const getWebSocketUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const host = window.location.host; 
    return `${protocol}${host}/ws`; 
}; 

function App() {
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isVideoStopped, setIsVideoStopped] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<PeerData[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const ws = useRef<WebSocket | null>(null);
  const mapPeers = useRef<{ [username: string]: [RTCPeerConnection, RTCDataChannel?] }>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const lastSentTime = useRef<number>(0);

  // Funkcja pomocnicza do logowania aktualnej listy użytkowników
  const logActivePeers = (context: string) => {
    const peerNames = Object.keys(mapPeers.current);
    console.log(`[PEER LOG - ${context}] Aktualnie połączeni:`, peerNames.length > 0 ? peerNames : "Brak użytkowników");
  };

  useEffect(() => {
    return () => {
        if (ws.current) ws.current.close();
        Object.values(mapPeers.current).forEach(([pc]) => pc.close());
    };
  }, []);

  // ==========================
  // 1. MEDIA SETUP
  // ==========================
  const startCamera = async () => {
    try {
        const constraints = {
            audio: { echoCancellation: true, noiseSuppression: true },
            video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } }
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        setLocalStream(stream);
        stream.getAudioTracks().forEach(t => t.enabled = !isAudioMuted);
        stream.getVideoTracks().forEach(t => t.enabled = !isVideoStopped);
        return stream;
    } catch (err) {
        console.error("Błąd kamery:", err);
        return null;
    }
  };

  // ==========================
  // 2. SIGNALING & WS
  // ==========================
  const connectWebSocket = (currentUserName: string) => {
    const url = getWebSocketUrl();
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
        console.log('%c[WS] Połączenie otwarte!', 'color: green; font-weight: bold');
        sendSignal('new-peer', {});
    };

    ws.current.onmessage = (event) => {
        const parsed: SignalMessage = JSON.parse(event.data);
        const { peer, action, message } = parsed;
        if (peer === currentUserName) return;

        const receiverChannel = message.receiver_channel_name;
        if (!receiverChannel) return;

        console.log(`%c[WS IN] Akcja: ${action} od: ${peer}`, 'color: blue');

        if (action === 'new-peer') {
            createOfferer(peer, receiverChannel);
        } else if (action === 'new-offer') {
            if (message.sdp) createAnswerer(message.sdp, peer, receiverChannel);
        } else if (action === 'new-answer') {
            const peerData = mapPeers.current[peer];
            if (peerData && message.sdp) {
                peerData[0].setRemoteDescription(new RTCSessionDescription(message.sdp))
                    .then(() => console.log(`[WebRTC] SDP Answer ustawione dla ${peer}`));
            }
        }
        logActivePeers(action);
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
  const setupDataChannel = (dc: RTCDataChannel, peerUsername: string) => {
    dc.onopen = () => {
        console.log(`%c[DataChannel] OTWARTY z: ${peerUsername}`, 'color: orange; font-weight: bold');
    };
    dc.onmessage = (e) => {
        console.log(`[DataChannel IN] od ${peerUsername}:`, e.data);
        const data = JSON.parse(e.data);
        if (data.message && !data.joystick) {
            setChatMessages(prev => [...prev, { username: data.username, message: data.message, isMe: false }]);
        }
    };
    dc.onerror = (err) => console.error(`[DataChannel Error] ${peerUsername}:`, err);
  };

  const createOfferer = async (peerUsername: string, receiverChannel: string) => {
    const pc = new RTCPeerConnection();
    const dc = pc.createDataChannel('chat');
    
    mapPeers.current[peerUsername] = [pc, dc];
    setupDataChannel(dc, peerUsername);

    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    }

    pc.onicecandidate = (e) => {
        if (!e.candidate) {
            sendSignal('new-offer', { sdp: pc.localDescription, receiver_channel_name: receiverChannel });
        }
    };

    pc.ontrack = (e) => handleRemoteTrack(e, peerUsername);
    pc.oniceconnectionstatechange = () => handleIceChange(pc, peerUsername);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
  };

  const createAnswerer = async (offer: RTCSessionDescriptionInit, peerUsername: string, receiverChannel: string) => {
    const pc = new RTCPeerConnection();
    
    pc.ondatachannel = (e) => {
        const dc = e.channel;
        mapPeers.current[peerUsername] = [pc, dc];
        setupDataChannel(dc, peerUsername);
    };

    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    }

    pc.onicecandidate = (e) => {
        if (!e.candidate) {
            sendSignal('new-answer', { sdp: pc.localDescription, receiver_channel_name: receiverChannel });
        }
    };

    pc.ontrack = (e) => handleRemoteTrack(e, peerUsername);
    pc.oniceconnectionstatechange = () => handleIceChange(pc, peerUsername);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
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
    console.log(`[ICE State] ${peerUsername}: ${pc.iceConnectionState}`);
    if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
        pc.close();
        delete mapPeers.current[peerUsername];
        setRemotePeers(prev => prev.filter(p => p.username !== peerUsername));
        logActivePeers("rozłączono");
    }
  };

  // ==========================
  // 4. DATA ACTIONS
  // ==========================
  const broadcastData = (payload: any) => {
    const json = JSON.stringify(payload);
    let count = 0;
    Object.entries(mapPeers.current).forEach(([peer, [_, dc]]) => {
        if (dc?.readyState === 'open') {
            dc.send(json);
            count++;
        }
    });
    if (count === 0 && Object.keys(mapPeers.current).length > 0) {
        console.warn("[Broadcast] Próba wysłania danych, ale żaden DataChannel nie jest 'open'!");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setIsLoggedIn(true);
      const stream = await startCamera();
      if (stream) connectWebSocket(username);
    }
  };

  return (
    <div className="dashboard">
      {!isLoggedIn ? (
        <div className="login-container">
          <form onSubmit={handleLogin} className="login-card">
            <input className="styled-input" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
            <button type="submit" className="styled-btn">Login</button>
          </form>
        </div>
      ) : (
        <>
          <header className="top-bar">
             <h1 className="text-xl font-bold">ROBOT: {username}</h1>
             <div className="flex gap-2">
                <button onClick={() => {
                    const t = localStreamRef.current?.getAudioTracks()[0];
                    if(t) { t.enabled = !t.enabled; setIsAudioMuted(!t.enabled); }
                }} className="icon-btn">{isAudioMuted ? '🔇' : '🎤'}</button>
                <button onClick={() => {
                    const t = localStreamRef.current?.getVideoTracks()[0];
                    if(t) { t.enabled = !t.enabled; setIsVideoStopped(!t.enabled); }
                }} className="icon-btn">{isVideoStopped ? '📷 OFF' : '📷 ON'}</button>
                <button onClick={() => sendSignal('new-peer', {})} className="icon-btn">🔄</button>
             </div>
          </header>
          <div className="main-grid">
            <div className="panel">
               <VideoGrid localStream={localStream} remotePeers={remotePeers} isAudioMuted={isAudioMuted} isVideoStopped={isVideoStopped} onToggleAudio={()=>{}} onToggleVideo={()=>{}} onShareScreen={()=>{}} isScreenSharing={false} />
            </div>
            <div className="panel">
                <JoystickController 
                    onMove={(l, a) => {
                        const now = Date.now();
                        if ((l === 0 && a === 0) || (now - lastSentTime.current > 100)) {
                            broadcastData({ username, joystick: { linear: l, angular: a } });
                            lastSentTime.current = now;
                        }
                    }} 
                    onStop={() => broadcastData({ username, joystick: { linear: 0, angular: 0 } })} 
                    onCommand={(cmd) => broadcastData({ username, message: cmd })} 
                />
            </div>
            <div className="panel flex-1">
                <Chat messages={chatMessages} onSendMessage={(msg) => {
                    setChatMessages(prev => [...prev, { username: 'Me', message: msg, isMe: true }]);
                    broadcastData({ username, message: msg });
                }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;