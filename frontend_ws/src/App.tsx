// 1. Biblioteki zewnętrzne (React)
import React, { useState, useRef, useEffect, useCallback } from 'react';

// 2. Typy
import type { ChatMessage, PeerData, SignalMessage } from './types';
import { ImuVisualizer } from './components/ImuVisualizer';
import type { PoseData } from './components/ImuVisualizer';

// 3. Funkcje pomocnicze (Utils)
import { 
  getWebSocketUrl, 
  getApiUrl,
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
    setPendingPeers([]); 
    setConnectionStatus(null);
    };

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(''); 
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const authToken = useRef<string | null>(null);
  
  const [isRegistering, setIsRegistering] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');

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
  
  const isLoggingOut = useRef(false);

  const [imuData, setImuData] = useState<PoseData | null>(null);

  // === 1. FUNKCJA WYLOGOWANIA ===
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
    setPassword(''); // <--- DODAJ
    authToken.current = null; // <--- DODAJ
    }, []); 


  // === 2. FUNKCJA USUWANIA MARTWEGO PEERA ===
  const removeDeadPeer = useCallback((peerName: string) => {
      if (isLoggingOut.current) return;

      log(`🗑️ [System] Usuwanie martwego peera: ${peerName}`);
      
      const peerData = mapPeers.current[peerName];
      if (peerData) {
          const [pc, dc] = peerData;
          if (dc) dc.close();
          pc.close();
          delete mapPeers.current[peerName];
      }

      setRemotePeers(prev => prev.filter(p => p.username !== peerName));
      setPendingPeers(prev => prev.filter(p => p !== peerName));
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
        
        // --- 1. KTOŚ PROSI O POŁĄCZENIE (Lobby) ---
        if (action === 'request-connect' || action === 'new-peer') {
            // === POPRAWKA: Sprawdzamy, czy już nie jesteśmy połączeni ===
            if (mapPeers.current[peerUsername]) {
                log(`ℹ️ [WS] ${peerUsername} wysłał request, ale już jesteśmy połączeni. Ignoruję.`);
                return; 
            }

            log(`👋 [WS] ${peerUsername} prosi o połączenie/wszedł. Dodaję do oczekujących.`);
            setPendingPeers(prev => {
                if (prev.includes(peerUsername)) return prev;
                return [...prev, peerUsername];
            });
        }
        
        else if (action === 'start-call') {
            const target = message.target;
            
            // === POPRAWKA: Jeśli sygnał jest do kogoś innego, ignorujemy go ===
            if (target && target !== currentUserName) {
                log(`😶 [WS] Ignoruję start-call od ${peerUsername} (Cel: ${target}, Ja: ${currentUserName})`);
                return;
            }

            log(`📞 [WS] ${peerUsername} zatwierdził połączenie DO MNIE! Dzwonię (Tworzę Ofertę).`);
            setPendingPeers(prev => prev.filter(p => p !== peerUsername));
            
            if (receiverChannel) {
                createOfferer(peerUsername, receiverChannel);
            } else {
                log(`❌ [Błąd] Otrzymano start-call od ${peerUsername}, ale brak receiver_channel_name.`);
            }
        }

        // --- 3. OTRZYMANO OFERTĘ ---
        else if (action === 'new-offer') {
            log(`✨ [WebRTC] Otrzymano Ofertę od ${peerUsername}. Tworzę Answer.`);
            
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
                    createAnswerer(message.sdp, peerUsername, targetChannel);
                }
            }
        } 
        // --- 4. ODPOWIEDŹ ---
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

  // === UI: Użytkownik klika "Zatwierdź" ===
  const approveConnection = async (peerName: string) => {
      log(`🚀 [User] Zatwierdzam połączenie z ${peerName}. Wysyłam 'start-call'.`);
      
      setPendingPeers(prev => prev.filter(p => p !== peerName));
      
      if (mapPeers.current[peerName]) {
          removeDeadPeer(peerName);
      }

      // === POPRAWKA: Dodajemy "target", żeby tylko ten peer zareagował ===
      sendSignal('start-call', { target: peerName }); 
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
        if (!isLoggingOut.current) log(`❌ [DataChannel] BŁĄD z ${peerUsername}:`, e);
    };

    dc.onmessage = (e) => {
        if (isLoggingOut.current) return;
        const data = JSON.parse(e.data);
        
        if (data.joystick) return; 

        if (data.message) {
            setChatMessages(prev => [...prev, { username: data.username, message: data.message, isMe: false }]);
        }

        if (data.imu || data.position) {
            setImuData(data); 
        }
    };
  };

  // === [PRZYWRÓCONE] Create Offerer (potrzebne dla Browser-to-Browser) ===
  const createOfferer = async (peerUsername: string, receiverChannel: string) => {
    const config = getCurrentConfig();
    log(`🛠️ [WebRTC] Tworzę Offerer dla ${peerUsername}.`);
    setConnectionStatus(`Dzwonię do ${peerUsername}...`);

    const pc = new RTCPeerConnection(config); 
    (pc as any).remoteChannelName = receiverChannel;
    addPcListeners(pc, peerUsername);

    // Offerer tworzy Data Channel
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
    log(`🛠️ [WebRTC] Tworzę Answerer dla ${peerUsername}.`);
    setConnectionStatus(`Odbieranie wideo od ${peerUsername}...`);

    const pc = new RTCPeerConnection(config);
    (pc as any).remoteChannelName = receiverChannel;
    addPcListeners(pc, peerUsername);
    
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
            log(`❄️ [ICE] Zbieranie zakończone. Wysyłam ANSWER do ${peerUsername}`);
            sendSignal('new-answer', { sdp: pc.localDescription, receiver_channel_name: receiverChannel });
        }
    };

    pc.ontrack = (e) => handleRemoteTrack(e, peerUsername);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
  };

  // Wewnątrz komponentu App, funkcja handleRemoteTrack:

  const handleRemoteTrack = (e: RTCTrackEvent, peerUsername: string) => {
    log(`🎥 [WebRTC] Odebrano ZDALNY STREAM od ${peerUsername}.`);
    
    // === POPRAWKA: Zabezpieczenie przed pustym e.streams ===
    let stream = e.streams[0];
    
    if (!stream) {
        log(`⚠️ [WebRTC] Brak obiektu stream w zdarzeniu. Tworzę nowy MediaStream z tracka.`);
        stream = new MediaStream();
        stream.addTrack(e.track);
    }

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
    }
  };

  const toggleVideo = () => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if(t) { 
        t.enabled = !t.enabled; 
        setIsVideoStopped(!t.enabled); 
    }
  };

  // --- SCREEN SHARE ---
  const startScreenShare = async () => {
      try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const screenTrack = screenStream.getVideoTracks()[0];
          
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
              if (isScreenSharingRef.current) stopScreenShare();
          };

      } catch (e: any) {
          log("❌ [ScreenShare] Błąd startu:", e);
          setIsScreenSharing(false);
      }
  };

  const stopScreenShare = async () => {
      setIsScreenSharing(false);
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());

      const camStream = await startCamera(); 
      
      Object.values(mapPeers.current).forEach(([pc]) => {
          const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (videoSender && camStream) {
               const videoTrack = camStream.getVideoTracks()[0];
               videoSender.replaceTrack(videoTrack).catch(() => {});
          }
      });
  };

  const toggleScreenShare = () => {
      isScreenSharing ? stopScreenShare() : startScreenShare();
  };

  const handleRefreshPeers = async () => {
    log("🔄 [System] Refresh");
    teardownConnections();
    connectWebSocket(username);
  };

  // === NOWA FUNKCJA: Obsługuje Logowanie i Rejestrację ===
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoading(true);

    // 1. Walidacja pustości
    if (!username.trim() || !password.trim()) {
        setLoginError("Podaj login i hasło");
        setIsLoading(false);
        return;
    }

    // 2. Walidacja dla REJESTRACJI
    if (isRegistering) {
        // Czy hasła są identyczne?
        if (password !== confirmPassword) {
            setLoginError("Hasła nie są identyczne!");
            setIsLoading(false);
            return;
        }

        // --- Standardy Bezpieczeństwa (Regex) ---
        const minLength = 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        if (password.length < minLength) {
            setLoginError(`Hasło za krótkie! Minimum ${minLength} znaków.`);
            setIsLoading(false);
            return;
        }
        if (!hasUpperCase) {
            setLoginError("Hasło musi zawierać wielką literę (A-Z).");
            setIsLoading(false);
            return;
        }
        if (!hasLowerCase) {
            setLoginError("Hasło musi zawierać małą literę (a-z).");
            setIsLoading(false);
            return;
        }
        if (!hasNumber) {
            setLoginError("Hasło musi zawierać cyfrę (0-9).");
            setIsLoading(false);
            return;
        }
        if (!hasSpecialChar) {
            setLoginError("Hasło musi zawierać znak specjalny (np. ! @ # $).");
            setIsLoading(false);
            return;
        }
    }

    try {
        // Wybieramy endpoint w zależności od trybu
        const endpoint = isRegistering ? 'api/register/' : 'api/login/';
        
        log(`👤 [Auth] Wysyłam żądanie do: ${endpoint}`);

        // Używamy helpera getApiUrl
        const response = await fetch(getApiUrl(endpoint), { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const text = await response.text(); 
        if (!response.ok) {
            throw new Error(text || `Błąd serwera: ${response.status}`);
        }

        const data = text ? JSON.parse(text) : {};
        
        if (data.error) throw new Error(data.error);
        if (!data.token) throw new Error("Brak tokenu w odpowiedzi.");

        // SUKCES
        authToken.current = data.token;
        isLoggingOut.current = false;
        setIsLoggedIn(true);

        const stream = await startCamera();
        if (stream) connectWebSocket(username);

    } catch (err: any) {
        // Próbujemy wyczyścić komunikat błędu z JSONa
        let msg = err.message;
        try {
            const parsed = JSON.parse(msg);
            if(parsed.error) msg = parsed.error;
        } catch {}
        
        setLoginError(msg);
        setIsLoggedIn(false);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="dashboard">
      {!isLoggedIn ? (
        <div className="login-container">
             <form onSubmit={handleAuth} className="login-card">
            <h2 className="title-header">
                {isRegistering ? 'REJESTRACJA' : 'LOGOWANIE'}
            </h2>
            
            <div className="input-row">
                 <input 
                    className="styled-input" 
                    placeholder="Użytkownik" 
                    value={username} 
                    onChange={e => setUsername(e.target.value)} 
                    disabled={isLoading}
                 />
            </div>

            <div className="input-row">
                 <input 
                    type="password"
                    className="styled-input" 
                    placeholder="Hasło" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    disabled={isLoading}
                 />
            </div>

            {/* Dodatkowe pole, widoczne tylko przy rejestracji */}
            {isRegistering && (
                <div className="input-row">
                    <input 
                        type="password"
                        className="styled-input" 
                        placeholder="Potwierdź hasło" 
                        value={confirmPassword} 
                        onChange={e => setConfirmPassword(e.target.value)} 
                        disabled={isLoading}
                    />
                </div>
            )}

            {loginError && (
                <div style={{color: '#ff6b6b', textAlign: 'center', marginBottom: '10px', fontWeight: 'bold', fontSize: '0.9rem'}}>
                    {loginError}
                </div>
            )}

            {/* Checkbox STUN (Zachowany z Twojego kodu) */}
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

            <button type="submit" className="styled-btn" disabled={isLoading}>
                {isLoading ? 'Przetwarzanie...' : (isRegistering ? 'Zarejestruj' : 'Zaloguj')}
            </button>

            {/* Przełącznik: Mam konto / Nie mam konta */}
            <div style={{marginTop: '15px', textAlign: 'center', color: '#666', fontSize: '0.9rem'}}>
                {isRegistering ? "Masz już konto? " : "Nie masz konta? "}
                <span 
                    onClick={() => {
                        setIsRegistering(!isRegistering);
                        setLoginError(null);
                    }}
                    style={{
                        color: '#4c1d95', 
                        fontWeight: 'bold', 
                        cursor: 'pointer',
                        textDecoration: 'underline'
                    }}
                >
                    {isRegistering ? "Zaloguj się" : "Zarejestruj się"}
                </span>
            </div>

          </form>
        </div>
      ) : (
        <>
          {/* === NAGŁÓWEK (HEADER) === */}
          <header className="top-bar">
             {/* ... (zawartość nagłówka bez zmian) ... */}
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
              <button onClick={toggleScreenShare} className={`icon-btn ${isScreenSharing ? 'bg-red-600 text-white' : ''}`}>
                {isScreenSharing ? '⏹️ Stop Share' : '🖥️ Share'}
              </button>
              <button onClick={handleRefreshPeers} className="icon-btn">🔄</button>
           </div>
          </header>

          {/* === NOWOŚĆ: POWIADOMIENIA PRAWY GÓRNY RÓG (GLOBALNE) === */}
          <div className="notifications-container">
            {pendingPeers.map(peer => (
                <div key={peer} className="notification-card">
                    <div className="notification-text">
                        🤖 {peer} <br/> chce dołączyć!
                    </div>
                    <button 
                        className="notification-btn"
                        onClick={() => approveConnection(peer)}
                    >
                        ✅ ZATWIERDŹ
                    </button>
                </div>
            ))}
          </div>

          {/* === GŁÓWNA ZAWARTOŚĆ === */}
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

                  {/* USUNIĘTO STĄD CZARNE OKIENKA (przeniesione wyżej do notifications-container) */}

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
                    <div style={{ position: 'absolute', bottom: '10px', left: '10px', zIndex: 10 }}>
                     <ImuVisualizer data={imuData} />
                  </div>
              </div>
            )}
            
            {/* ... reszta tabów bez zmian ... */}
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