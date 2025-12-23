import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage, PeerData, SignalMessage } from '../types';
import { log, getWebSocketUrl } from '../utils/helpers';

const STUN_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ]
};

const NO_STUN_CONFIG = {
    iceServers: [] 
};

interface UseWebRTCProps {
    username: string;
    localStreamRef: React.MutableRefObject<MediaStream | null>;
    useStun: boolean;
}

export const useWebRTC = ({ username, localStreamRef, useStun }: UseWebRTCProps) => {
    const [remotePeers, setRemotePeers] = useState<PeerData[]>([]);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<string | null>(null);

    const ws = useRef<WebSocket | null>(null);
    const mapPeers = useRef<{ [username: string]: [RTCPeerConnection, RTCDataChannel?] }>({});
    const isLoggingOut = useRef(false);
    const useStunRef = useRef(useStun);

    // Aktualizacja refa STUN przy zmianie propsa
    useEffect(() => { useStunRef.current = useStun; }, [useStun]);

    const getCurrentConfig = () => useStunRef.current ? STUN_CONFIG : NO_STUN_CONFIG;

    const sendSignal = useCallback((action: string, message: any) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            const payload = { peer: username, action, message };
            ws.current.send(JSON.stringify(payload));
        } else {
            log("⚠️ [WS] Nie mogę wysłać - socket zamknięty.");
        }
    }, [username]);

    // === ZARZĄDZANIE PEERAMI ===
    
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
        setConnectionStatus(prev => (prev && prev.includes(peerName)) ? null : prev);
    }, []);

    const broadcastData = useCallback((payload: any) => {
        const json = JSON.stringify(payload);
        if (payload.joystick) log(`🕹️ [SEND] Joystick: L=${payload.joystick.linear} A=${payload.joystick.angular}`);
        else if (payload.message) log(`💬 [SEND] Chat: "${payload.message}"`);

        Object.values(mapPeers.current).forEach(([_, dc]) => {
            if (dc?.readyState === 'open') dc.send(json);
        });
    }, []);

    // === METODY POMOCNICZE WEBRTC ===

    const handleRemoteTrack = (e: RTCTrackEvent, peerUsername: string) => {
        log(`🎥 [WebRTC] Odebrano ZDALNY STREAM od ${peerUsername}.`);
        setRemotePeers(prev => {
            if (prev.find(p => p.username === peerUsername)) return prev;
            return [...prev, { username: peerUsername, stream: e.streams[0] }];
        });
    };

    const setupDataChannel = (dc: RTCDataChannel, peerUsername: string) => {
        dc.onopen = () => log(`✅ [DataChannel] OPEN z ${peerUsername}`);
        dc.onclose = () => { if(!isLoggingOut.current) removeDeadPeer(peerUsername); };
        dc.onmessage = (e) => {
            if (isLoggingOut.current) return;
            const data = JSON.parse(e.data);
            if (data.joystick) log(`🕹️ [RECV] Joystick od ${peerUsername}`);
            if (data.message) {
                log(`💬 [RECV] Chat od ${peerUsername}: "${data.message}"`);
                setChatMessages(prev => [...prev, { username: data.username, message: data.message, isMe: false }]);
            }
        };
    };

    const addPcListeners = (pc: RTCPeerConnection, peerName: string) => {
        pc.oniceconnectionstatechange = () => {
            if (isLoggingOut.current) return;
            const state = pc.iceConnectionState;
            log(`🧊 [ICE] ${peerName}: ${state}`);
            if (state === 'checking') setConnectionStatus(`Łączenie z ${peerName}...`);
            else if (['connected', 'completed'].includes(state)) setConnectionStatus(null);
            else if (['failed', 'disconnected', 'closed'].includes(state)) {
                log(`⚠️ [ICE] Utracono ${peerName}.`);
                removeDeadPeer(peerName);
            }
        };
    };

    // === TWORZENIE POŁĄCZEŃ ===

    const createOfferer = async (peerUsername: string, receiverChannel: string) => {
        const pc = new RTCPeerConnection(getCurrentConfig());
        (pc as any).remoteChannelName = receiverChannel;
        addPcListeners(pc, peerUsername);

        const dc = pc.createDataChannel('chat');
        mapPeers.current[peerUsername] = [pc, dc];
        setupDataChannel(dc, peerUsername);

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
        }

        pc.onicecandidate = (e) => {
            if (!e.candidate) sendSignal('new-offer', { sdp: pc.localDescription, receiver_channel_name: receiverChannel });
        };
        pc.ontrack = (e) => handleRemoteTrack(e, peerUsername);

        await pc.setLocalDescription(await pc.createOffer());
    };

    const createAnswerer = async (offer: RTCSessionDescriptionInit, peerUsername: string, receiverChannel: string) => {
        const pc = new RTCPeerConnection(getCurrentConfig());
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
            if (!e.candidate) sendSignal('new-answer', { sdp: pc.localDescription, receiver_channel_name: receiverChannel });
        };
        pc.ontrack = (e) => handleRemoteTrack(e, peerUsername);

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await pc.setLocalDescription(await pc.createAnswer());
    };

    // ZMIANA: Usunięto parametr 'peerUsername' z listy argumentów
    const handleRenegotiationOffer = async (pc: RTCPeerConnection, sdp: RTCSessionDescriptionInit, receiverChannel: string) => {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await pc.setLocalDescription(await pc.createAnswer());
        sendSignal('new-answer', { sdp: pc.localDescription, receiver_channel_name: receiverChannel });
    };

    // === PUBLICZNE API HOOKA ===

    const connectWebSocket = () => {
        isLoggingOut.current = false;
        const url = getWebSocketUrl();
        log(`🔌 [WS] Łączenie z ${url}`);
        ws.current = new WebSocket(url);

        ws.current.onopen = () => {
            log('✅ [WS] Otwarto');
            sendSignal('new-peer', {});
        };

        ws.current.onmessage = (event) => {
            if (isLoggingOut.current) return;
            const parsed: SignalMessage = JSON.parse(event.data);
            const { peer: peerUsername, action, message } = parsed;

            if (peerUsername === username) return;
            
            // Logika routingu wiadomości
            const receiverChannel = message.receiver_channel_name;
            const existingPeer = mapPeers.current[peerUsername];

            if (action === 'new-peer') {
                if (receiverChannel) createOfferer(peerUsername, receiverChannel);
            } else if (action === 'new-offer') {
                if (existingPeer && message.sdp) {
                    // ZMIANA: Usunięto przekazywanie peerUsername (3 argument)
                    handleRenegotiationOffer(existingPeer[0], message.sdp, receiverChannel || '');
                } else if (message.sdp && receiverChannel) {
                    createAnswerer(message.sdp, peerUsername, receiverChannel);
                }
            } else if (action === 'new-answer') {
                if (existingPeer && message.sdp && existingPeer[0].signalingState !== 'stable') {
                    existingPeer[0].setRemoteDescription(new RTCSessionDescription(message.sdp));
                }
            }
        };
    };

    const replaceVideoTrack = (newTrack: MediaStreamTrack) => {
        // ZMIANA: Używamy Object.values zamiast Object.entries, 
        // dzięki temu nie musimy deklarować nieużywanego 'peerName'
        Object.values(mapPeers.current).forEach(([pc]) => {
            const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (videoSender) {
                videoSender.replaceTrack(newTrack).catch(e => log("❌ ReplaceTrack error:", e));
            } else {
                // Jeśli nie było wideo, dodajemy (wymaga renegocjacji)
                const stream = localStreamRef.current;
                if(stream) pc.addTrack(newTrack, stream);
                
                const channelName = (pc as any).remoteChannelName;
                if (channelName) {
                    pc.createOffer().then(offer => pc.setLocalDescription(offer))
                      .then(() => sendSignal('new-offer', { sdp: pc.localDescription, receiver_channel_name: channelName }));
                }
            }
        });
    };

    const cleanup = () => {
        isLoggingOut.current = true;
        if (ws.current) ws.current.close();
        Object.values(mapPeers.current).forEach(([pc, dc]) => {
            if(dc) dc.close();
            pc.close();
        });
        mapPeers.current = {};
        setRemotePeers([]);
    };
    
    // Auto-cleanup przy unmount
    useEffect(() => {
        return () => { isLoggingOut.current = true; if(ws.current) ws.current.close(); };
    }, []);

    return {
        remotePeers,
        chatMessages,
        setChatMessages, // do dodawania własnych wiadomości
        connectionStatus,
        connectWebSocket,
        broadcastData,
        replaceVideoTrack,
        cleanup,
        refreshPeers: () => {
             cleanup();
             isLoggingOut.current = false;
             connectWebSocket();
        }
    };
};