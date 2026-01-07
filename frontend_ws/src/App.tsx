// 1. Biblioteki zewnętrzne (React)
import React, { useState, useRef, useEffect, useCallback } from 'react';

// 2. Typy (często daje się je wysoko, lub zaraz przed użyciem)
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

      // 3. Wyczyść status (jeśli dotyczył tego peera)
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
                width: { ideal: 320 },  // Zmniejszone z 640
                height: { ideal: 240 }, // Zmniejszone z 480
                frameRate: { ideal: 20, max: 30 } // Ograniczenie klatkarzu Twojej kamery
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
          } else if (pc.iceGatheringState === 'complete') {
               // setConnectionStatus(null); // Opcjonalnie
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
        ws.current.send(JSON.stringify(payload));
    } else {
        log("⚠️ [WS] Nie mogę wysłać - socket zamknięty.");
    }
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
        
        // Logowanie odbioru Joysticka
        if (data.joystick) {
            log(`🕹️ [DC RECV] Joystick od ${peerUsername}: L=${data.joystick.linear} A=${data.joystick.angular}`);
            return; 
        }
        
        // Logowanie odbioru Czatu
        if (data.message) {
            log(`💬 [DC RECV] Chat od ${peerUsername}: "${data.message}"`);
            setChatMessages(prev => [...prev, { username: data.username, message: data.message, isMe: false }]);
        }
    };
  };

  const createOfferer = async (peerUsername: string, receiverChannel: string) => {
    const config = getCurrentConfig();
    log(`🛠️ [WebRTC] Tworzę Offerer dla ${peerUsername}. STUN: ${useStunRef.current ? 'ON' : 'OFF'}`);
    setConnectionStatus(`Inicjalizacja wideo z ${peerUsername}...`);

    const pc = new RTCPeerConnection(config); 
    (pc as any).remoteChannelName = receiverChannel;
    addPcListeners(pc, peerUsername);

    const dc = pc.createDataChannel('chat');
    mapPeers.current[peerUsername] = [pc, dc];
    setupDataChannel(dc, peerUsername);

    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    } else {
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
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
        // Unikamy duplikatów
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

    // Logowanie wysyłania przed pętlą
    if (payload.joystick) {
        log(`🕹️ [BROADCAST SEND] Joystick: L=${payload.joystick.linear} A=${payload.joystick.angular}`);
    } else if (payload.message) {
        log(`💬 [BROADCAST SEND] Chat: "${payload.message}"`);
    } else {
        log(`📤 [BROADCAST SEND] Dane:`, payload);
    }

    Object.values(mapPeers.current).forEach(([_, dc]) => {
        if (dc?.readyState === 'open') {
            dc.send(json);
            sentCount++;
        }
    });

    // Opcjonalnie: logowanie, jeśli nikt nie odebrał
    if (sentCount === 0) {
        // log(`⚠️ [BROADCAST] Nie wysłano do nikogo (brak otwartych kanałów).`);
    }
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

          Object.entries(mapPeers.current).forEach(([peerName, [pc]]) => {
              const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
              if (videoSender) {
                  log("🖥️ [ScreenShare] Zastępowanie tracka wideo...");
                  videoSender.replaceTrack(screenTrack).catch(e => log("❌ ReplaceTrack error:", e));
              } else {
                  log("🖥️ [ScreenShare] Dodawanie nowego tracka...");
                  pc.addTrack(screenTrack, screenStream);
                  const channelName = (pc as any).remoteChannelName;
                  if(channelName) renegotiate(pc, peerName, channelName);
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

  const handleRefreshPeers = async () => {
    log("🔄 [System] Refresh → pełny reset połączeń");

    teardownConnections();

    // WebSocket + signaling od nowa
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