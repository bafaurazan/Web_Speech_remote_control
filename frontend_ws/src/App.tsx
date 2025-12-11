import React, { useState, useRef } from 'react';
import { VideoGrid } from './components/VideoGrid';
import { Chat } from './components/Chat';
import { JoystickController } from './components/JoystickController';
import { SpeechControl } from './components/SpeechControl';
import type { ChatMessage, PeerData, SignalMessage } from './types';

// WAŻNE: Adres Twojego backendu Django
const WS_URL = 'ws://127.0.0.1:8000/ws/chat/'; 

function App() {
  // --- STATE ---
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // UI State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<PeerData[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoStopped, setIsVideoStopped] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // --- REFS (Mutable logic) ---
  const ws = useRef<WebSocket | null>(null);
  const peerConnections = useRef<{ [username: string]: RTCPeerConnection }>({});
  const dataChannels = useRef<{ [username: string]: RTCDataChannel }>({});
  
  // Przechowujemy referencję do strumienia
  const localStreamRef = useRef<MediaStream | null>(null);

  // ==========================
  // 1. SETUP MEDIA
  // ==========================
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      stream.getAudioTracks()[0].enabled = true; 
    } catch (err) {
      console.error("Camera error:", err);
    }
  };

  // ==========================
  // 2. WEBSOCKET & SIGNALING
  // ==========================
  const connectWebSocket = (user: string) => {
    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      console.log('WS Connected');
      sendSignal('new-peer', {});
    };

    ws.current.onmessage = (event) => {
      const parsed: SignalMessage = JSON.parse(event.data);
      const { peer, action, message } = parsed;

      if (peer === user) return; 

      const receiverChannel = message.receiver_channel_name;

      if (action === 'new-peer') {
        createOfferer(peer, receiverChannel);
      } else if (action === 'new-offer') {
        createAnswerer(message.sdp, peer, receiverChannel);
      } else if (action === 'new-answer') {
        const pc = peerConnections.current[peer];
        if (pc && message.sdp) {
          pc.setRemoteDescription(message.sdp);
        }
      }
    };
  };

  const sendSignal = (action: string, message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        peer: username,
        action,
        message
      }));
    }
  };

  // ==========================
  // 3. WEBRTC LOGIC
  // ==========================
  const addLocalTracks = (pc: RTCPeerConnection) => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }
  };

  const createOfferer = async (peerUsername: string, receiverChannel: any) => {
    const pc = new RTCPeerConnection();
    peerConnections.current[peerUsername] = pc;

    addLocalTracks(pc);

    const dc = pc.createDataChannel('chat');
    setupDataChannel(dc, peerUsername);

    pc.onicecandidate = (e) => {
      if (e.candidate) return; 
      sendSignal('new-offer', {
        sdp: pc.localDescription,
        receiver_channel_name: receiverChannel
      });
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

    pc.ondatachannel = (e) => {
      setupDataChannel(e.channel, peerUsername);
    };

    pc.onicecandidate = (e) => {
        if (e.candidate) return;
        sendSignal('new-answer', {
          sdp: pc.localDescription,
          receiver_channel_name: receiverChannel
        });
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

  // ==========================
  // 4. DATA CHANNELS & BROADCAST
  // ==========================
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
        if (data.joystick) {
            console.log("Joystick data:", data.joystick);
        }
    };
  };

  const broadcastData = (payload: any) => {
    const json = JSON.stringify(payload);
    Object.values(dataChannels.current).forEach(dc => {
        if (dc.readyState === 'open') dc.send(json);
    });
  };

  // ==========================
  // 5. USER ACTIONS
  // ==========================
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

  const sendRobotCommand = (cmd: string) => {
    console.log("Sending command:", cmd);
    broadcastData({ username, message: cmd });
  };

  const sendJoystickData = (linear: number, angular: number) => {
    broadcastData({ username, joystick: { linear, angular } });
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
            screenTrack.onended = () => toggleScreenShare();
        } catch (e) {
            console.error(e);
        }
    } else {
        if(localStreamRef.current) {
            const camTrack = localStreamRef.current.getVideoTracks()[0];
             Object.values(peerConnections.current).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(camTrack);
            });
            setLocalStream(localStreamRef.current);
            setIsScreenSharing(false);
        }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
        localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
        setIsAudioMuted(!localStream.getAudioTracks()[0].enabled);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
        localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
        setIsVideoStopped(!localStream.getVideoTracks()[0].enabled);
    }
  };

  // ==========================
  // RENDER
  // ==========================
  if (!isLoggedIn) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded shadow-md w-80">
          <h2 className="text-2xl mb-4 text-center">Login</h2>
          <input 
            className="w-full border p-2 mb-4 rounded" 
            placeholder="Username" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
          />
          <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded">Join</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-200 p-4">
      <header className="flex justify-between items-center mb-4 bg-white p-4 rounded shadow">
        <h1 className="text-xl font-bold">Robot Control Center</h1>
        <div>User: {username}</div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* LEWA KOLUMNA: WIDEO */}
        <div className="lg:col-span-2 bg-white p-4 rounded shadow">
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

        {/* PRAWA KOLUMNA: CZAT I STEROWANIE */}
        <div className="flex flex-col gap-4">
            <div className="bg-white p-4 rounded shadow">
                <h2 className="font-bold mb-2">Controls</h2>
                <JoystickController 
                    onMove={sendJoystickData} 
                    onStop={() => sendJoystickData(0,0)} 
                    onCommand={sendRobotCommand}
                />

                {/* --- NOWY PRZYCISK DLA NLP/RAG --- */}
                <hr className="my-4" />
                <button 
                  className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded shadow transition duration-200 flex items-center justify-center gap-2"
                  onClick={() => alert("moduł nlp przeniesiony do frontend_ws/src/nlp i jest nieskonfigurowany")}
                >
                  <span>🧠</span> Start NLP / RAG
                </button>
                {/* ---------------------------------- */}

            </div>
            
            <SpeechControl onCommand={sendRobotCommand} />

            <div className="flex-1">
                <Chat messages={chatMessages} onSendMessage={sendChatMessage} />
            </div>
        </div>
      </div>
    </div>
  );
}

export default App;