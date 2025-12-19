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
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoStopped, setIsVideoStopped] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<PeerData[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const ws = useRef<WebSocket | null>(null);
  // Kluczem jest username, tak jak w renderer.js
  const mapPeers = useRef<{ [username: string]: [RTCPeerConnection, RTCDataChannel?] }>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const lastSentTime = useRef<number>(0);

  // Automatyczne czyszczenie przy zamknięciu
  useEffect(() => {
    return () => {
        if (ws.current) ws.current.close();
        Object.values(mapPeers.current).forEach(([pc]) => pc.close());
    };
  }, []);

  // ==========================
  // 1. MEDIA SETUP (Synchronizacja z renderer.js)
  // ==========================
  const startCamera = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, frameRate: 15 },
            audio: true
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
    } catch (err) {
        console.error("Błąd dostępu do mediów:", err);
        return null;
    }
  };

  // ==========================
  // 2. SIGNALING (Kopia logiki z renderer.js)
  // ==========================
  const connectWebSocket = (currentUserName: string) => {
    const url = getWebSocketUrl();
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
        console.log('Połączenie otwarte!');
        sendSignal('new-peer', {});
    };

    ws.current.onmessage = (event) => {
        const parsedData = JSON.parse(event.data);
        const peerUsername = parsedData.peer;
        const action = parsedData.action;

        if (currentUserName === peerUsername) return;

        const receiver_channel_name = parsedData.message.receiver_channel_name;

        if (action === 'new-peer') {
            createOfferer(peerUsername, receiver_channel_name);
        } else if (action === 'new-offer') {
            const offer = parsedData.message.sdp;
            createAnswerer(offer, peerUsername, receiver_channel_name);
        } else if (action === 'new-answer') {
            const answer = parsedData.message.sdp;
            const peerData = mapPeers.current[peerUsername];
            if (peerData) {
                peerData[0].setRemoteDescription(new RTCSessionDescription(answer));
            }
        }
    };
  };

  const sendSignal = (action: string, message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
            peer: username,
            action: action,
            message: message
        }));
    }
  };

  // ==========================
  // 3. WEBRTC (Kopia logiki z renderer.js)
  // ==========================
  const addLocalTracks = (pc: RTCPeerConnection) => {
    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
            pc.addTrack(track, localStreamRef.current!);
        });
    }
  };

  const createOfferer = async (peerUsername: string, receiver_channel_name: string) => {
    const pc = new RTCPeerConnection();
    addLocalTracks(pc);

    const dc = pc.createDataChannel('chat');
    dc.onopen = () => console.log('DataChannel otwarty!');
    dc.onmessage = (e) => dcOnMessage(e, peerUsername);

    mapPeers.current[peerUsername] = [pc, dc];

    pc.onicecandidate = (event) => {
        if (event.candidate) return; // Czekamy na koniec zbierania
        sendSignal('new-offer', {
            sdp: pc.localDescription,
            receiver_channel_name: receiver_channel_name
        });
    };

    pc.ontrack = (event) => handleOnTrack(event, peerUsername);
    pc.oniceconnectionstatechange = () => handleIceState(pc, peerUsername);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
  };

  const createAnswerer = async (offer: RTCSessionDescriptionInit, peerUsername: string, receiver_channel_name: string) => {
    const pc = new RTCPeerConnection();
    addLocalTracks(pc);

    pc.ondatachannel = (e) => {
        const dc = e.channel;
        dc.onopen = () => console.log('DataChannel (A) otwarty!');
        dc.onmessage = (e) => dcOnMessage(e, peerUsername);
        mapPeers.current[peerUsername] = [pc, dc];
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) return;
        sendSignal('new-answer', {
            sdp: pc.localDescription,
            receiver_channel_name: receiver_channel_name
        });
    };

    pc.ontrack = (event) => handleOnTrack(event, peerUsername);
    pc.oniceconnectionstatechange = () => handleIceState(pc, peerUsername);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
  };

  const handleOnTrack = (event: RTCTrackEvent, peerUsername: string) => {
    const stream = event.streams[0];
    setRemotePeers(prev => {
        if (prev.find(p => p.username === peerUsername)) return prev;
        return [...prev, { username: peerUsername, stream }];
    });
  };

  const handleIceState = (pc: RTCPeerConnection, peerUsername: string) => {
    if (['failed', 'disconnected', 'closed'].includes(pc.iceConnectionState)) {
        pc.close();
        delete mapPeers.current[peerUsername];
        setRemotePeers(prev => prev.filter(p => p.username !== peerUsername));
    }
  };

  // ==========================
  // 4. DATA HANDLING
  // ==========================
  const dcOnMessage = (event: MessageEvent, peerUsername: string) => {
    const data = JSON.parse(event.data);
    if (data.message && !data.joystick) {
        setChatMessages(prev => [...prev, { username: data.username, message: data.message, isMe: false }]);
    }
  };

  const broadcastData = (data: any) => {
    const json = JSON.stringify(data);
    Object.values(mapPeers.current).forEach(([_, dc]) => {
        if (dc && dc.readyState === 'open') dc.send(json);
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setIsLoggedIn(true);
      const stream = await startCamera();
      if (stream) connectWebSocket(username);
    }
  };

  const sendChatMessage = (msg: string) => {
    setChatMessages(prev => [...prev, { username: 'Me', message: msg, isMe: true }]);
    broadcastData({ username, message: msg });
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
             <h1 className="text-xl font-bold">ROBOT CONTROL: {username}</h1>
             <button onClick={() => sendSignal('new-peer', {})} className="icon-btn">🔄 Odśwież</button>
          </header>
          <div className="main-grid">
            <div className="panel">
               <VideoGrid 
                   localStream={localStream} 
                   remotePeers={remotePeers} 
                   isAudioMuted={isAudioMuted} 
                   isVideoStopped={isVideoStopped}
                   onToggleAudio={() => {
                       if (localStreamRef.current) {
                           const t = localStreamRef.current.getAudioTracks()[0];
                           t.enabled = !t.enabled;
                           setIsAudioMuted(!t.enabled);
                       }
                   }}
                   onToggleVideo={() => {
                       if (localStreamRef.current) {
                           const t = localStreamRef.current.getVideoTracks()[0];
                           t.enabled = !t.enabled;
                           setIsVideoStopped(!t.enabled);
                       }
                   }}
                   onShareScreen={() => {}}
                   isScreenSharing={isScreenSharing}
               />
            </div>
            <div className="panel">
                <JoystickController 
                    onMove={(l, a) => {
                        const now = Date.now();
                        if (now - lastSentTime.current > 100 || (l === 0 && a === 0)) {
                            broadcastData({ username, joystick: { linear: l, angular: a } });
                            lastSentTime.current = now;
                        }
                    }} 
                    onStop={() => broadcastData({ username, joystick: { linear: 0, angular: 0 } })} 
                    onCommand={(cmd) => broadcastData({ username, message: cmd })} 
                />
            </div>
            <div className="panel flex-1">
                <Chat messages={chatMessages} onSendMessage={sendChatMessage} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;