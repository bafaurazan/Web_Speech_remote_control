// 1. Biblioteki zewnętrzne (React)
import React, { useState, useRef, useEffect, useCallback } from 'react';

// 2. Typy
import type { ChatMessage, PeerData, SignalMessage } from './types';

// 3. Funkcje pomocnicze (Utils)
import { 
  getWebSocketUrl, 
  STUN_CONFIG, 
  NO_STUN_CONFIG, 
  log, 
  createBlackScreenStream 
} from './utils/helpers';

// 4. Komponenty (UI)
import { VideoGrid } from './components/VideoGrid';
import { Chat } from './components/Chat';
import { JoystickController } from './components/JoystickController';
import { SpeechControl } from './components/SpeechControl';

// 5. Style (Side-effects)
import './App.css';

function App() {
    const teardownConnections = () => {
    log("🧹 [Teardown] Zamykanie WS + WebRTC");

    // 1. WebSocket
    if (ws.current) {
        ws.current.onopen = null;
        ws.current.onmessage = null;
        ws.current.onerror = null;
        ws.current.onclose = null;
        ws.current.close();
        ws.current = null;
    }

    // 2. WebRTC
    Object.values(mapPeers.current).forEach(([pc, dc]) => {
        try {
            dc?.close();
            pc.onicecandidate = null;
            pc.ontrack = null;
            pc.oniceconnectionstatechange = null;
            pc.close();
        } catch {}
    });

    mapPeers.current = {};
    setRemotePeers([]);
    setPendingPeers([]); // Czyścimy listę oczekujących przy resecie
    setConnectionStatus(null);
    };

  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<'operator' | 'hub' | 'ai'>('operator');
  
  const [useStun, setUseStun] = useState(false);
  const useStunRef = useRef(false);

  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isVideoStopped, setIsVideoStopped] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);

  // === NOWOŚĆ: Lista peerów oczekujących na zatwierdzenie ===
  const [pendingPeers, setPendingPeers] = useState<string[]>([]);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<PeerData[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const ws = useRef<WebSocket | null>(null);
  const mapPeers = useRef<{ [username: string]: [RTCPeerConnection, RTCDataChannel?] }>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const lastSentTime = useRef<number>(0);
  const isScreenSharingRef = useRef(false);
  
  // Flaga blokująca logi przy wylogowywaniu
  const isLoggingOut = useRef(false);

  // === 1. FUNKCJA WYLOGOWANIA (TYLKO DLA CIEBIE) ===
  const handleLogout = useCallback(() => {
    isLoggingOut.current = true;
    log("👋 [System] Wylogowywanie");

    teardownConnections();

    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
    }

    setIsLoggedIn(false);
    setUsername('');
    }, []); 


  // === 2. FUNKCJA USUWANIA MARTWEGO PEERA ===
  const removeDeadPeer = useCallback((peerName: string) => {
      if (isLoggingOut.current) return;

      log(`🗑️ [System] Usuwanie martwego peera: ${peerName}`);
      
      // 1. Zamknij połączenie lokalnie
      const peerData = mapPeers.current[peerName];
      if (peerData) {
          const [pc, dc] = peerData;
          if (dc) dc.close();
          pc.close();
          delete mapPeers.current[peerName];
      }

      // 2. Usuń z listy wideo (To usunie "wiszące okienko")
      setRemotePeers(prev => prev.filter(p => p.username !== peerName));
      
      // 3. Usuń z pending (jeśli tam był)
      setPendingPeers(prev => prev.filter(p => p !== peerName));

      // 4. Wyczyść status (jeśli dotyczył tego peera)
      setConnectionStatus(prev => (prev && prev.includes(peerName)) ? null : prev);

  }, []);

  useEffect(() => {
    return () => {
        isLoggingOut.current = true;
        if (ws.current) ws.current.close();
        Object.values(mapPeers.current).forEach(([pc]) => pc.close());
    };
  }, [handleLogout]);

  useEffect(() => {
      isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

  const handleStunChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setUseStun(e.target.checked);
      useStunRef.current = e.target.checked;
      log(`🔧 [Config] STUN ustawiony na: ${e.target.checked ? 'ON (Internet)' : 'OFF (Local Only)'}`);
  };

  // ==========================
  // MEDIA SETUP
  // ==========================
  const setupLocalStream = (stream: MediaStream) => {
      localStreamRef.current = stream;
      setLocalStream(stream);
      stream.getAudioTracks().forEach(t => t.enabled = !isAudioMuted);
      const isCanvas = stream.getVideoTracks()[0].label.toLowerCase().includes('canvas');
      if (!isCanvas) {
          stream.getVideoTracks().forEach(t => t.enabled = !isVideoStopped);
      }
      return stream;
  };

  const startCamera = async () => {
    log("📷 [Media] Start inicjalizacji mediów...");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: {
                width: { ideal: 320 },
                height: { ideal: 240 },
                frameRate: { ideal: 20, max: 30 }
            }
        });
        return setupLocalStream(stream);
    } catch (err) {
        log("⚠️ [Media] Kamera niedostępna. Fallback do Dummy.", err);
    }
    return setupLocalStream(createBlackScreenStream());
  };

  // ==========================
  // OBSŁUGA STANU WEBRTC
  // ==========================
  
  const getCurrentConfig = () => useStunRef.current ? STUN_CONFIG : NO_STUN_CONFIG;

  const addPcListeners = (pc: RTCPeerConnection, peerName: string) => {
      pc.oniceconnectionstatechange = () => {
          if (isLoggingOut.current) return;

          const state = pc.iceConnectionState;
          log(`🧊 [ICE State] ${peerName}: ${state}`);

          if (state === 'checking') {
              setConnectionStatus(`Łączenie z ${peerName}...`);
          } 
          else if (state === 'connected' || state === 'completed') {
              setConnectionStatus(null);
          } 
          else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              // === ZMIANA: ZAMIAST WYLOGOWYWAĆ NAS, USUWAMY PEERA ===
              log(`⚠️ [ICE] Utracono połączenie z ${peerName}. Usuwam go z listy.`);
              removeDeadPeer(peerName);
          }
      };

      pc.onicegatheringstatechange = () => {
          if (isLoggingOut.current) return;
          if (pc.iceGatheringState === 'gathering') {
               setConnectionStatus(`STUN: Szukanie trasy do ${peerName}...`);
          }
      };
  };

  // ==========================
  // SIGNALING
  // ==========================
  const connectWebSocket = (currentUserName: string) => {
    const url = getWebSocketUrl();
    log(`🔌 [WS] Próba połączenia z: ${url}`);
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
        log('✅ [WS] Połączenie OTWARTE!');
        sendSignal('new-peer', {});
    };

    ws.current.onerror = (err) => {
        if(!isLoggingOut.current) log("❌ [WS] Błąd socketa:", err);
    };
    
    ws.current.onclose = (e) => {
        if(!isLoggingOut.current) log(`⚠️ [WS] Połączenie ZAMKNIĘTE (Kod: ${e.code})`);
    };

    ws.current.onmessage = (event) => {
        if (isLoggingOut.current) return;

        const parsed: SignalMessage = JSON.parse(event.data);
        const { peer: peerUsername, action, message } = parsed;
        
        log(`📩 [WS RECV] Od: ${peerUsername} | Akcja: ${action}`, message);

        if (peerUsername === currentUserName) return;

        const receiverChannel = message.receiver_channel_name;
        
        // --- 1. ROBOT PROSI O POŁĄCZENIE (lub wszedł nowy) ---
        // Dodajemy do listy oczekujących (pendingPeers) zamiast dzwonić
        if (action === 'request-connect' || action === 'new-peer') {
            log(`👋 [WS] ${peerUsername} prosi o połączenie/wszedł. Dodaję do oczekujących.`);
            setPendingPeers(prev => {
                // Unikamy duplikatów
                if (prev.includes(peerUsername)) return prev;
                return [...prev, peerUsername];
            });
        } 
        // --- 2. OTRZYMANO OFERTĘ (To się stanie po wysłaniu start-call) ---
        // Jeśli Robot jednak zadzwonił, to tutaj odbieramy połączenie
        else if (action === 'new-offer') {
            log(`✨ [WebRTC] Otrzymano Ofertę od ${peerUsername}. Tworzę Answer.`);
            
            // Usuwamy z pending, bo połączenie już trwa
            setPendingPeers(prev => prev.filter(p => p !== peerUsername));
            
            const existingPeer = mapPeers.current[peerUsername];
            const targetChannel = receiverChannel || (existingPeer?.[0] as any)?.remoteChannelName;

            if (existingPeer) {
                if (message.sdp) {
                    log(`🔄 [WebRTC] Renegocjacja od ${peerUsername}`);
                    handleRenegotiationOffer(existingPeer[0], message.sdp, peerUsername, targetChannel);
                }
            } else {
                if (message.sdp && targetChannel) {
                    // Tworzymy Answerer (odbieramy wideo)
                    createAnswerer(message.sdp, peerUsername, targetChannel);
                }
            }
        } 
        // --- 3. ODPOWIEDŹ (Gdybyśmy jednak byli Offererem) ---
        else if (action === 'new-answer') {
            const peerData = mapPeers.current[peerUsername];
            if (peerData && message.sdp) {
                try {
                    if (peerData[0].signalingState !== 'stable') {
                        peerData[0].setRemoteDescription(new RTCSessionDescription(message.sdp));
                    }
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
        ws.current.send(JSON.stringify(payload));
    } else {
        log("⚠️ [WS] Nie mogę wysłać - socket zamknięty.");
    }
  };

  // === KLUCZOWA FUNKCJA: Użytkownik klika "Zatwierdź" ===
  const approveConnection = async (peerName: string) => {
      log(`🚀 [User] Zatwierdzam połączenie z ${peerName}. Wysyłam 'start-call'.`);
      
      // 1. Usuwamy z listy oczekujących (UI)
      setPendingPeers(prev => prev.filter(p => p !== peerName));
      
      // 2. Jeśli mamy stare połączenie z tym peerem, zamykamy je dla czystości
      if (mapPeers.current[peerName]) {
          log(`🧹 [Approve] Zamykam stare połączenie z ${peerName}`);
          removeDeadPeer(peerName);
      }

      // 3. Wysyłamy sygnał do bridge.py: "Bądź Offererem i dzwoń do mnie!"
      sendSignal('start-call', {}); 
  };

  // ==========================
  // WEBRTC CORE
  // ==========================

  const renegotiate = async (pc: RTCPeerConnection, peerUsername: string, receiverChannel: string) => {
      log(`🔄 [Renegotiation] Start (JA -> ${peerUsername})`);
      setConnectionStatus(`Renegocjacja z ${peerUsername}...`);
      try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal('new-offer', { sdp: pc.localDescription, receiver_channel_name: receiverChannel });
      } catch (e) {
          log(`❌ [Renegotiation] Błąd przy ${peerUsername}:`, e);
          setConnectionStatus(null);
      }
  };

  const handleRenegotiationOffer = async (pc: RTCPeerConnection, sdp: RTCSessionDescriptionInit, peerUsername: string, receiverChannel: string) => {
      try {
          log(`📥 [Renegotiation] Przetwarzam Ofertę od ${peerUsername}...`);
          if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer' && pc.signalingState !== 'have-remote-offer') {
               log(`⚠️ [Renegotiation] Ryzykowny stan PC przy ${peerUsername}: ${pc.signalingState}`);
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
    
    dc.onclose = () => { 
        if(!isLoggingOut.current) {
            log(`🚫 [DataChannel] Stan: CLOSED z ${peerUsername}`);
            removeDeadPeer(peerUsername);
        }
    };
    
    dc.onerror = (e: any) => {
        if (isLoggingOut.current) return;
        if (e.error?.message?.includes('User-Initiated Abort') || e.error?.name === 'OperationError') return;
        log(`❌ [DataChannel] BŁĄD z ${peerUsername}:`, e);
    };

    dc.onmessage = (e) => {
        if (isLoggingOut.current) return;
        const data = JSON.parse(e.data);
        
        if (data.joystick) {
            log(`🕹️ [DC RECV] Joystick od ${peerUsername}: L=${data.joystick.linear} A=${data.joystick.angular}`);
            return; 
        }
        
        if (data.message) {
            log(`💬 [DC RECV] Chat od ${peerUsername}: "${data.message}"`);
            setChatMessages(prev => [...prev, { username: data.username, message: data.message, isMe: false }]);
        }
    };
  };

  const createAnswerer = async (offer: RTCSessionDescriptionInit, peerUsername: string, receiverChannel: string) => {
    const config = getCurrentConfig();
    log(`🛠️ [WebRTC] Tworzę Answerer dla ${peerUsername}. STUN: ${useStunRef.current ? 'ON' : 'OFF'}`);
    setConnectionStatus(`Odbieranie wideo od ${peerUsername}...`);

    const pc = new RTCPeerConnection(config);
    (pc as any).remoteChannelName = receiverChannel;
    addPcListeners(pc, peerUsername);
    
    pc.ondatachannel = (e) => {
        log(`🔗 [WebRTC] Otrzymano DataChannel od ${peerUsername}`);
        const dc = e.channel;
        mapPeers.current[peerUsername] = [pc, dc];
        setupDataChannel(dc, peerUsername);
    };

    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
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
  // ACTIONS & BROADCAST
  // ==========================
  const broadcastData = (payload: any) => {
    const json = JSON.stringify(payload);
    let sentCount = 0;

    Object.values(mapPeers.current).forEach(([_, dc]) => {
        if (dc?.readyState === 'open') {
            dc.send(json);
            sentCount++;
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
      try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const screenTrack = screenStream.getVideoTracks()[0];
          
          log(`🖥️ [ScreenShare] Otrzymano strumień ekranu: ${screenTrack.label}`);

          Object.entries(mapPeers.current).forEach(([peerName, [pc]]) => {
              const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
              if (videoSender) {
                  videoSender.replaceTrack(screenTrack).catch(e => log("❌ ReplaceTrack error:", e));
              } else {
                  pc.addTrack(screenTrack, screenStream);
                  const channelName = (pc as any).remoteChannelName;
                  if(channelName) renegotiate(pc, peerName, channelName);
              }
          });

          setLocalStream(screenStream);
          setIsScreenSharing(true);
          setIsVideoStopped(false); 

          screenTrack.onended = () => {
              if (isScreenSharingRef.current) {
                  stopScreenShare();
              }
          };

      } catch (e: any) {
          log("❌ [ScreenShare] Błąd startu:", e);
          setIsScreenSharing(false);
      }
  };

  const stopScreenShare = async () => {
      log("🖥️ [ScreenShare] Zatrzymywanie...");
      setIsScreenSharing(false);

      if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
      }

      const camStream = await startCamera(); 
      
      Object.values(mapPeers.current).forEach(([pc]) => {
          const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (videoSender && camStream) {
               const videoTrack = camStream.getVideoTracks()[0];
               try {
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

  const handleRefreshPeers = async () => {
    log("🔄 [System] Refresh → pełny reset połączeń");
    teardownConnections();
    connectWebSocket(username);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      isLoggingOut.current = false; 
      log(`👤 [Login] Logowanie jako: ${username} | STUN: ${useStun}`);
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
            <h2 className="title-header">LOGIN</h2>
            
            <div className="input-row">
                 <input className="styled-input" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
            </div>

            <div className="flex items-center gap-2 mb-2" style={{width: '100%', justifyContent: 'center'}}>
                <label className="switch-label flex items-center gap-2" style={{cursor: 'pointer', fontWeight: 'bold', color: '#4c1d95'}}>
                    <input 
                        type="checkbox" 
                        checked={useStun} 
                        onChange={handleStunChange} 
                        style={{width: '20px', height: '20px'}}
                    />
                    <span>Używaj serwerów STUN (Internet)</span>
                </label>
            </div>

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
                  <button onClick={handleLogout} className="styled-btn logout">Wyloguj</button>
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
                
                {connectionStatus && (
                    <div className="loader-overlay">
                        <div className="spinner"></div>
                        <div className="loader-text">{connectionStatus}</div>
                        {connectionStatus.includes('STUN') && <div className="loader-subtext">To może chwilę potrwać...</div>}
                    </div>
                )}
                
                {/* GRID Z WIDEO */}
                <VideoGrid 
                    localStream={localStream} 
                    remotePeers={remotePeers} 
                    isAudioMuted={isAudioMuted} 
                    isVideoStopped={isVideoStopped} 
                    onToggleAudio={toggleAudio} 
                    onToggleVideo={toggleVideo} 
                    />

                {/* CZARNE OKIENKA DO ZATWIERDZENIA */}
                {pendingPeers.length > 0 && (
                    <div style={{display:'flex', gap:'15px', marginTop:'20px', flexWrap:'wrap', justifyContent:'center'}}>
                        {pendingPeers.map(peer => (
                            <div key={peer} style={{
                                width: '320px', height: '240px', 
                                backgroundColor: 'black', 
                                border: '4px dashed #ef4444', borderRadius: '10px',
                                display: 'flex', flexDirection: 'column', 
                                alignItems: 'center', justifyContent: 'center',
                                color: 'white', boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                            }}>
                                <div style={{fontSize: '1.2rem', marginBottom: '15px', fontWeight: 'bold'}}>
                                    🤖 {peer} chce dołączyć!
                                </div>
                                <button 
                                    onClick={() => approveConnection(peer)}
                                    style={{
                                        backgroundColor: '#22c55e', color: 'white',
                                        border: 'none', padding: '10px 20px',
                                        borderRadius: '5px', fontWeight: 'bold',
                                        cursor: 'pointer', fontSize: '1rem',
                                        boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
                                    }}
                                >
                                    ✅ ZATWIERDŹ
                                </button>
                            </div>
                        ))}
                    </div>
                )}

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