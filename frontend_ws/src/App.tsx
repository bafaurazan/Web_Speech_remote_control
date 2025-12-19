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

// === KONFIGURACJA WEBRTC (STUN SERVERS) ===
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ]
};

// === POMOCNIK LOGOWANIA Z CZASEM ===
const log = (prefix: string, ...args: any[]) => {
    const now = new Date();
    const time = now.toISOString().split('T')[1].slice(0, -1); // HH:MM:SS.ms
    console.log(`[${time}] ${prefix}`, ...args);
};

// === 1. GENERATOR CZARNEGO EKRANU (DUMMY STREAM) ===
const createBlackScreenStream = () => {
    log("⬛ [Media] Generowanie czarnego ekranu (Dummy Stream)...");
    
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = 'white';
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('NO CAMERA', 320, 240);
        ctx.font = '15px Arial';
        ctx.fillText('(Audio Only / Dummy)', 320, 270);
    }
    
    const videoStream = canvas.captureStream(15);
    
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const dst = audioCtx.createMediaStreamDestination();
    
    const audioTrack = dst.stream.getAudioTracks()[0];
    const videoTrack = videoStream.getVideoTracks()[0];
    
    return new MediaStream([videoTrack, audioTrack]);
};

function App() {
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<'operator' | 'hub' | 'ai'>('operator');
  
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isVideoStopped, setIsVideoStopped] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // STAN ŁADOWANIA (STATUS POŁĄCZENIA)
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<PeerData[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const ws = useRef<WebSocket | null>(null);
  const mapPeers = useRef<{ [username: string]: [RTCPeerConnection, RTCDataChannel?] }>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const lastSentTime = useRef<number>(0);
  const isScreenSharingRef = useRef(false);

  useEffect(() => {
    return () => {
        if (ws.current) {
            log("🛑 [System] Zamykanie aplikacji - czyszczenie WS");
            ws.current.close();
        }
        Object.values(mapPeers.current).forEach(([pc]) => pc.close());
    };
  }, []);

  useEffect(() => {
      isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

  // ==========================
  // 2. MEDIA SETUP
  // ==========================
  const setupLocalStream = (stream: MediaStream) => {
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      stream.getAudioTracks().forEach(t => t.enabled = !isAudioMuted);
      
      const isCanvas = stream.getVideoTracks()[0].label.toLowerCase().includes('canvas') || 
                       stream.getVideoTracks()[0].label.toLowerCase().includes('stream');
      
      if (!isCanvas) {
          stream.getVideoTracks().forEach(t => t.enabled = !isVideoStopped);
      }
      
      log("✅ [Media] Strumień aktywny. ID:", stream.id);
      return stream;
  };

  const startCamera = async () => {
    log("📷 [Media] Start inicjalizacji mediów...");
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: { width: { ideal: 640 }, height: { ideal: 480 } }
        });
        return setupLocalStream(stream);
    } catch (err) {
        log("⚠️ [Media] Kamera niedostępna lub błąd. Przełączam na DUMMY STREAM.", err);
    }

    const dummy = createBlackScreenStream();
    return setupLocalStream(dummy);
  };

  // ==========================
  // 3. SIGNALING & WS
  // ==========================
  const connectWebSocket = (currentUserName: string) => {
    const url = getWebSocketUrl();
    log(`🔌 [WS] Próba połączenia z: ${url}`);
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
        log('✅ [WS] Połączenie OTWARTE!');
        sendSignal('new-peer', {});
    };

    ws.current.onerror = (err) => log("❌ [WS] Błąd socketa:", err);
    ws.current.onclose = (e) => log(`⚠️ [WS] Połączenie ZAMKNIĘTE (Kod: ${e.code})`);

    ws.current.onmessage = (event) => {
        const parsed: SignalMessage = JSON.parse(event.data);
        const { peer: peerUsername, action, message } = parsed;
        
        log(`📩 [WS RECV] Od: ${peerUsername} | Akcja: ${action}`, message);

        if (peerUsername === currentUserName) return;

        const receiverChannel = message.receiver_channel_name;
        
        if (action === 'new-peer') {
            if (!receiverChannel) {
                log(`⚠️ [WS] Ignoruję new-peer od ${peerUsername} (brak kanału zwrotnego)`);
                return;
            }
            log(`🆕 [WS] New Peer: ${peerUsername} -> Inicjuję Ofertę`);
            createOfferer(peerUsername, receiverChannel);
        } 
        else if (action === 'new-offer') {
            const existingPeer = mapPeers.current[peerUsername];
            const targetChannel = receiverChannel || (existingPeer?.[0] as any)?.remoteChannelName;

            if (existingPeer) {
                if (message.sdp) {
                    log(`🔄 [WebRTC] Renegocjacja (Otrzymano Offer) od ${peerUsername}`);
                    handleRenegotiationOffer(existingPeer[0], message.sdp, peerUsername, targetChannel);
                }
            } else {
                if (message.sdp && targetChannel) {
                    log(`✨ [WebRTC] Nowe połączenie (Otrzymano Offer) od ${peerUsername} -> Tworzę Answer`);
                    createAnswerer(message.sdp, peerUsername, targetChannel);
                }
            }
        } 
        else if (action === 'new-answer') {
            const peerData = mapPeers.current[peerUsername];
            if (peerData && message.sdp) {
                try {
                    if (peerData[0].signalingState === 'stable') {
                        log(`⚠️ [WebRTC] Ignoruję Answer od ${peerUsername} - stan już STABLE.`);
                        return;
                    }
                    log(`🤝 [WebRTC] Ustawiam RemoteDesc (Answer) od ${peerUsername}`);
                    peerData[0].setRemoteDescription(new RTCSessionDescription(message.sdp));
                } catch (e) {
                    log(`❌ [WebRTC] Błąd przy ustawianiu Answer od ${peerUsername}:`, e);
                }
            }
        }
    };
  };

  const sendSignal = (action: string, message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
        const payload = { peer: username, action, message };
        log(`🚀 [WS SEND] ${action}`, payload);
        ws.current.send(JSON.stringify(payload));
    } else {
        log("⚠️ [WS] Nie mogę wysłać - socket zamknięty.");
    }
  };

  // ==========================
  // 4. WEBRTC LOGIC & OBSERVERS
  // ==========================
  
  // Funkcja dodająca nasłuchiwacze na PeerConnection (Z OBSŁUGĄ LOADINGU)
  const addPcListeners = (pc: RTCPeerConnection, peerName: string) => {
      // Śledzenie stanu ICE (Checking, Connected, Failed)
      pc.oniceconnectionstatechange = () => {
          const state = pc.iceConnectionState;
          log(`🧊 [ICE State] ${peerName}: ${state}`);
          
          if (state === 'checking') {
              setConnectionStatus(`Łączenie z ${peerName}... (NAT/Firewall)`);
          } else if (state === 'connected' || state === 'completed') {
              setConnectionStatus(null); // UKRYJ LOADER
              log(`🟢 [ICE] Połączenie z ${peerName} USTABILIZOWANE!`);
          } else if (state === 'failed') {
              setConnectionStatus(`Błąd połączenia z ${peerName}`);
              log(`⚠️ [ICE] Połączenie z ${peerName} zerwane/nieudane.`);
              // Po 3 sekundach ukryj błąd, żeby nie zasłaniał wszystkiego
              setTimeout(() => setConnectionStatus(null), 3000);
          } else if (state === 'disconnected') {
               // Disconnected to czasem stan przejściowy (np. przy renegocjacji)
               // Możemy pokazać loader, ale krótko.
               setConnectionStatus(`Utracono sygnał z ${peerName}...`);
          }
      };

      pc.onsignalingstatechange = () => {
          log(`🚦 [Signaling State] ${peerName}: ${pc.signalingState}`);
      };

      // Śledzenie zbierania kandydatów STUN
      pc.onicegatheringstatechange = () => {
          const state = pc.iceGatheringState;
          log(`🕵️ [ICE Gathering] ${peerName}: ${state}`);
          if (state === 'gathering') {
               setConnectionStatus(`STUN: Szukanie trasy do ${peerName}...`);
          }
      };

      pc.onnegotiationneeded = () => {
          log(`🔔 [Negotiation Needed] ${peerName} - wymagana renegocjacja.`);
      };
  };

  const renegotiate = async (pc: RTCPeerConnection, peerUsername: string, receiverChannel: string) => {
      log(`🔄 [Renegotiation] Start (JA -> ${peerUsername})`);
      setConnectionStatus("Renegocjacja strumienia..."); // Pokaż loader przy zmianie
      try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal('new-offer', { sdp: pc.localDescription, receiver_channel_name: receiverChannel });
      } catch (e) {
          log(`❌ [Renegotiation] Błąd:`, e);
          setConnectionStatus(null);
      }
  };

  const handleRenegotiationOffer = async (pc: RTCPeerConnection, sdp: RTCSessionDescriptionInit, peerUsername: string, receiverChannel: string) => {
      try {
          log(`📥 [Renegotiation] Przetwarzam Ofertę od ${peerUsername}...`);
          
          if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer' && pc.signalingState !== 'have-remote-offer') {
               log(`⚠️ [Renegotiation] Ryzykowny stan PC: ${pc.signalingState}`);
          }

          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal('new-answer', { sdp: pc.localDescription, receiver_channel_name: receiverChannel });
      } catch (e) {
          log(`❌ [Renegotiation Handler] Błąd przy ${peerUsername}:`, e);
      }
  };

  const setupDataChannel = (dc: RTCDataChannel, peerUsername: string) => {
    dc.onopen = () => log(`✅ [DataChannel] Stan: OPEN z ${peerUsername}`);
    dc.onclose = () => log(`🚫 [DataChannel] Stan: CLOSED z ${peerUsername}`);
    dc.onerror = (e) => log(`❌ [DataChannel] BŁĄD z ${peerUsername}:`, e);

    dc.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.joystick) {
            log(`🕹️ [DC RECV] Joystick od ${peerUsername}:`, data.joystick);
            return;
        }
        if (data.message) {
            log(`💬 [DC RECV] Chat od ${peerUsername}:`, data.message);
            setChatMessages(prev => [...prev, { username: data.username, message: data.message, isMe: false }]);
        }
    };
  };

  const createOfferer = async (peerUsername: string, receiverChannel: string) => {
    log(`🛠️ [WebRTC] Tworzę PeerConnection (Offerer) dla ${peerUsername}`);
    setConnectionStatus(`Inicjalizacja wideo z ${peerUsername}...`); // LOADER

    const pc = new RTCPeerConnection(rtcConfig); 
    (pc as any).remoteChannelName = receiverChannel;
    addPcListeners(pc, peerUsername);

    const dc = pc.createDataChannel('chat');
    log(`🛠️ [DataChannel] Utworzono kanał 'chat' dla ${peerUsername}`);
    mapPeers.current[peerUsername] = [pc, dc];
    setupDataChannel(dc, peerUsername);

    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => {
            log(`➕ [Track] Dodaję lokalny track ${t.kind} do PC ${peerUsername}`);
            pc.addTrack(t, localStreamRef.current!);
        });
    }

    pc.onicecandidate = (e) => {
        if (!e.candidate) {
            log(`❄️ [ICE] Zbieranie zakończone. Wysyłam OFFER do ${peerUsername}`);
            sendSignal('new-offer', { sdp: pc.localDescription, receiver_channel_name: receiverChannel });
        }
    };

    pc.ontrack = (e) => handleRemoteTrack(e, peerUsername);
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
  };

  const createAnswerer = async (offer: RTCSessionDescriptionInit, peerUsername: string, receiverChannel: string) => {
    log(`🛠️ [WebRTC] Tworzę PeerConnection (Answerer) dla ${peerUsername}`);
    setConnectionStatus(`Odbieranie wideo od ${peerUsername}...`); // LOADER

    const pc = new RTCPeerConnection(rtcConfig);
    (pc as any).remoteChannelName = receiverChannel;
    addPcListeners(pc, peerUsername);
    
    pc.ondatachannel = (e) => {
        log(`🔗 [WebRTC] Otrzymano DataChannel od ${peerUsername}`);
        const dc = e.channel;
        mapPeers.current[peerUsername] = [pc, dc];
        setupDataChannel(dc, peerUsername);
    };

    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => {
            log(`➕ [Track] Dodaję lokalny track ${t.kind} do PC ${peerUsername}`);
            pc.addTrack(t, localStreamRef.current!);
        });
    }

    pc.onicecandidate = (e) => {
        if (!e.candidate) {
            log(`❄️ [ICE] Zbieranie zakończone. Wysyłam ANSWER do ${peerUsername}`);
            sendSignal('new-answer', { sdp: pc.localDescription, receiver_channel_name: receiverChannel });
        }
    };

    pc.ontrack = (e) => handleRemoteTrack(e, peerUsername);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
  };

  const handleRemoteTrack = (e: RTCTrackEvent, peerUsername: string) => {
    log(`🎥 [WebRTC] Odebrano ZDALNY STREAM od ${peerUsername}. Tracks: ${e.streams[0]?.getTracks().length}`);
    const [stream] = e.streams;
    setRemotePeers(prev => {
        if (prev.find(p => p.username === peerUsername)) return prev;
        return [...prev, { username: peerUsername, stream }];
    });
  };

  // ==========================
  // 5. ACTIONS & BROADCAST
  // ==========================
  const broadcastData = (payload: any) => {
    if (payload.joystick) {
        log(`🕹️ [BROADCAST] Joystick: L=${payload.joystick.linear}, A=${payload.joystick.angular}`);
    } else {
        log(`📤 [BROADCAST] Dane:`, payload);
    }

    const json = JSON.stringify(payload);
    Object.values(mapPeers.current).forEach(([_, dc]) => {
        if (dc?.readyState === 'open') {
            dc.send(json);
        }
    });
  };

  const sendRobotCommand = (cmd: string) => {
      log(`🤖 [Command] Wysyłam komendę: ${cmd}`);
      broadcastData({ username, message: cmd });
  };

  const toggleAudio = () => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if(t) { 
        t.enabled = !t.enabled; 
        setIsAudioMuted(!t.enabled); 
        log(`🎤 Mikrofon przełączono na: ${t.enabled ? 'ON' : 'OFF'}`);
    }
  };

  const toggleVideo = () => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if(t) { 
        t.enabled = !t.enabled; 
        setIsVideoStopped(!t.enabled); 
        log(`📷 Wideo przełączono na: ${t.enabled ? 'ON' : 'OFF'}`);
    }
  };

  // --- SCREEN SHARE ---
  const startScreenShare = async () => {
      log("🖥️ [ScreenShare] Próba uruchomienia...");
      try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const screenTrack = screenStream.getVideoTracks()[0];
          
          log(`🖥️ [ScreenShare] Otrzymano strumień ekranu: ${screenTrack.label}`);

          Object.values(mapPeers.current).forEach(([pc]) => {
              const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
              if (videoSender) {
                  log("🖥️ [ScreenShare] Zastępowanie tracka wideo...");
                  videoSender.replaceTrack(screenTrack).catch(e => log("❌ ReplaceTrack error:", e));
              } else {
                  log("🖥️ [ScreenShare] Dodawanie nowego tracka...");
                  pc.addTrack(screenTrack, screenStream);
                  const channelName = (pc as any).remoteChannelName;
                  if(channelName) renegotiate(pc, "peer", channelName);
              }
          });

          setLocalStream(screenStream);
          setIsScreenSharing(true);
          setIsVideoStopped(false); 

          screenTrack.onended = () => {
              log("🛑 [ScreenShare] Zatrzymano z UI przeglądarki (pasek).");
              if (isScreenSharingRef.current) {
                  stopScreenShare();
              }
          };

      } catch (e: any) {
          if (e.name === 'NotAllowedError') {
              log("🛑 [ScreenShare] Anulowano przez użytkownika.");
          } else {
              log("❌ [ScreenShare] Błąd startu:", e);
          }
          setIsScreenSharing(false);
      }
  };

  const stopScreenShare = async () => {
      log("🖥️ [ScreenShare] Zatrzymywanie...");
      setIsScreenSharing(false);

      if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => {
              log(`🛑 [ScreenShare] Zatrzymuję lokalny track ekranu: ${t.label}`);
              t.stop();
          });
      }

      const camStream = await startCamera(); 
      
      Object.values(mapPeers.current).forEach(([pc]) => {
          const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (videoSender && camStream) {
               const videoTrack = camStream.getVideoTracks()[0];
               try {
                   log("📷 [ScreenShare] Przywracanie kamery/dummy...");
                   videoSender.replaceTrack(videoTrack).catch(e => log("⚠️ RevertTrack warn:", e));
               } catch(e) {}
          }
      });
  };

  const toggleScreenShare = () => {
      if (isScreenSharing) {
          stopScreenShare();
      } else {
          startScreenShare();
      }
  };

  const handleRefreshPeers = () => {
      log("🔄 [System] Ręczne odświeżanie. Czyszczę stare połączenia...");
      setConnectionStatus("Resetowanie połączeń...");
      
      Object.values(mapPeers.current).forEach(([pc]) => pc.close());
      mapPeers.current = {};
      setRemotePeers([]);

      sendSignal('new-peer', {});
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      log(`👤 [Login] Logowanie jako: ${username}`);
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
           {showMenu && (
              <div className="menu-overlay" onClick={() => setShowMenu(false)}>
                <div className="menu-content" onClick={e => e.stopPropagation()}>
                  <div className="menu-group">
                    <button onClick={() => { setActiveTab('operator'); setShowMenu(false); }} className="menu-btn">🎮 Pilot</button>
                    <button onClick={() => { setActiveTab('hub'); setShowMenu(false); }} className="menu-btn">🌐 Chat</button>
                    <button onClick={() => { setActiveTab('ai'); setShowMenu(false); }} className="menu-btn">🧠 AI Voice</button>
                  </div>
                  <hr className="menu-divider" />
                  <button onClick={() => window.location.reload()} className="styled-btn logout">Wyloguj</button>
                </div>
              </div>
            )}
           <div className="flex gap-2">
              <button onClick={toggleAudio} className="icon-btn">{isAudioMuted ? '🔇' : '🎤'}</button>
              <button onClick={toggleVideo} className="icon-btn">{isVideoStopped ? '📷 OFF' : '📷 ON'}</button>
              
              <button 
                onClick={toggleScreenShare} 
                className={`icon-btn ${isScreenSharing ? 'bg-red-600 text-white' : ''}`}
                title={isScreenSharing ? "Stop Sharing" : "Share Screen"}
              >
                {isScreenSharing ? '⏹️ Stop Share' : '🖥️ Share'}
              </button>
              
              <button onClick={handleRefreshPeers} className="icon-btn">🔄</button>
           </div>
          </header>

          <div className="main-grid">
            {activeTab === 'operator' && (
              <div className="view-section operator-view">
                <div className="panel">
                {/* LOADER OVERLAY - POKAZUJE SIĘ GDY TRWA ŁĄCZENIE */}
                {connectionStatus && (
                    <div className="loader-overlay">
                        <div className="spinner"></div>
                        <div className="loader-text">{connectionStatus}</div>
                        <div className="loader-subtext">Czekam na odpowiedź STUN...</div>
                    </div>
                )}
                <VideoGrid 
                    localStream={localStream} 
                    remotePeers={remotePeers} 
                    isAudioMuted={isAudioMuted} 
                    isVideoStopped={isVideoStopped} 
                    onToggleAudio={toggleAudio} 
                    onToggleVideo={toggleVideo} 
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
              </div>
            )}
            
            {/* W INNYCH ZAKŁADKACH TEŻ DODAJEMY LOADER */}
            {activeTab === 'hub' && (
              <div className="view-section operator-view">
                <div className="panel">
                {connectionStatus && (
                    <div className="loader-overlay">
                        <div className="spinner"></div>
                        <div>{connectionStatus}</div>
                    </div>
                )}
                <VideoGrid 
                    localStream={localStream} 
                    remotePeers={remotePeers} 
                    isAudioMuted={isAudioMuted} 
                    isVideoStopped={isVideoStopped} 
                    onToggleAudio={toggleAudio} 
                    onToggleVideo={toggleVideo} 
                    />
              </div>
                <div className="panel flex-1">
                  <Chat messages={chatMessages} onSendMessage={(msg) => {
                      setChatMessages(prev => [...prev, { username: 'Me', message: msg, isMe: true }]);
                      broadcastData({ username, message: msg });
                  }} />
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="view-section ai-view">
                <div className="panel">
                  {connectionStatus && (
                      <div className="loader-overlay">
                          <div className="spinner"></div>
                          <div>{connectionStatus}</div>
                      </div>
                  )}
                  <VideoGrid 
                    localStream={localStream} 
                    remotePeers={remotePeers} 
                    isAudioMuted={isAudioMuted} 
                    isVideoStopped={isVideoStopped} 
                    onToggleAudio={toggleAudio} 
                    onToggleVideo={toggleVideo} 
                    />
                </div>
                <div className="panel flex-1">
                  <SpeechControl onCommand={sendRobotCommand} />
              </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default App;