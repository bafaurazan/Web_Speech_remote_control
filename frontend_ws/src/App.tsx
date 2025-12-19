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
  
  // Zmiana stanów początkowych na true, aby mikrofon i kamera były OFF na starcie
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
        
        // Ścieżki zostaną wyłączone na starcie, ponieważ !true = false
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
        console.log('[WS] Połączenie otwarte!');
        sendSignal('new-peer', {});
    };

    ws.current.onmessage = (event) => {
        const parsed: SignalMessage = JSON.parse(event.data);
        const { peer: peerUsername, action, message } = parsed;
        if (peerUsername === currentUserName) return;

        const receiverChannel = message.receiver_channel_name;
        if (!receiverChannel) return;

        if (action === 'new-peer') {
            createOfferer(peerUsername, receiverChannel);
        } else if (action === 'new-offer') {
            if (message.sdp) createAnswerer(message.sdp, peerUsername, receiverChannel);
        } else if (action === 'new-answer') {
            const peerData = mapPeers.current[peerUsername];
            if (peerData && message.sdp) {
                peerData[0].setRemoteDescription(new RTCSessionDescription(message.sdp));
            }
        }
    };
  };

  const sendSignal = (action: string, message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ peer: username, action, message }));
    }
  };

  // ==========================
  // 3. WEBRTC & DATA CHANNEL
  // ==========================
  const setupDataChannel = (dc: RTCDataChannel, peerUsername: string) => {
    dc.onopen = () => console.log(`[DataChannel] OTWARTY z: ${peerUsername}`);
    dc.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.joystick) {
            console.log("Odebrano dane joysticka:", data.joystick);
            return;
        }
        if (data.message) {
            setChatMessages(prev => [...prev, { username: data.username, message: data.message, isMe: false }]);
        }
    };
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
    if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
        pc.close();
        delete mapPeers.current[peerUsername];
        setRemotePeers(prev => prev.filter(p => p.username !== peerUsername));
    }
  };

  // ==========================
  // 4. ACTIONS & BROADCAST
  // ==========================
  const broadcastData = (payload: any) => {
    const json = JSON.stringify(payload);
    Object.values(mapPeers.current).forEach(([_, dc]) => {
        if (dc?.readyState === 'open') dc.send(json);
    });
  };

  const sendRobotCommand = (cmd: string) => broadcastData({ username, message: cmd });

  const toggleAudio = () => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if(t) { t.enabled = !t.enabled; setIsAudioMuted(!t.enabled); }
  };

  const toggleVideo = () => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if(t) { t.enabled = !t.enabled; setIsVideoStopped(!t.enabled); }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = stream.getVideoTracks()[0];
            Object.values(mapPeers.current).forEach(([pc]) => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
            });
            setLocalStream(stream);
            setIsScreenSharing(true);
            screenTrack.onended = () => toggleScreenShare();
        } catch (e) { console.error(e); }
    } else {
        const stream = await startCamera();
        if (stream) {
            const camTrack = stream.getVideoTracks()[0];
            Object.values(mapPeers.current).forEach(([pc]) => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(camTrack);
            });
            setIsScreenSharing(false);
        }
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
             <div className="flex gap-4 items-center">
                <button className="icon-btn" onClick={() => setShowMenu(!showMenu)}>☰</button>
                <h1 className="text-xl font-bold">ROBOT: {username}</h1>
             </div>
             <div className="flex gap-2">
                <button onClick={toggleAudio} className="icon-btn">{isAudioMuted ? '🔇' : '🎤'}</button>
                <button onClick={toggleVideo} className="icon-btn">{isVideoStopped ? '📷 OFF' : '📷 ON'}</button>
                <button onClick={() => sendSignal('new-peer', {})} className="icon-btn">🔄</button>
             </div>
          </header>

          {showMenu && (
            <div className="menu-overlay" onClick={() => setShowMenu(false)}>
              <div className="menu-content" onClick={e => e.stopPropagation()}>
                <button onClick={() => window.location.reload()} className="styled-btn">Logout</button>
              </div>
            </div>
          )}

          <div className="main-grid">
            <div className="panel">
               <VideoGrid 
                  localStream={localStream} remotePeers={remotePeers} 
                  isAudioMuted={isAudioMuted} isVideoStopped={isVideoStopped} 
                  onToggleAudio={toggleAudio} onToggleVideo={toggleVideo} 
                  onShareScreen={toggleScreenShare} isScreenSharing={isScreenSharing} 
               />
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
                    onCommand={sendRobotCommand} 
                />
            </div>
            <div className="panel flex-1">
                <SpeechControl onCommand={sendRobotCommand} />
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