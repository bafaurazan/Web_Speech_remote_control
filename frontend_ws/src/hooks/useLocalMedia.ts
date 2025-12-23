import { useState, useRef, useCallback } from 'react';
import { log, createBlackScreenStream } from '../utils/helpers';

export const useLocalMedia = () => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isVideoStopped, setIsVideoStopped] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  const localStreamRef = useRef<MediaStream | null>(null);

  const setupStream = useCallback((stream: MediaStream) => {
    localStreamRef.current = stream;
    setLocalStream(stream);
    
    // Ustawienie początkowe tracków zgodnie ze stanem
    stream.getAudioTracks().forEach(t => t.enabled = !isAudioMuted);
    const isCanvas = stream.getVideoTracks()[0].label.toLowerCase().includes('canvas');
    if (!isCanvas) {
        stream.getVideoTracks().forEach(t => t.enabled = !isVideoStopped);
    }
    return stream;
  }, [isAudioMuted, isVideoStopped]);

  const startCamera = useCallback(async () => {
    log("📷 [Media] Start inicjalizacji mediów...");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: { width: { ideal: 640 }, height: { ideal: 480 } }
        });
        return setupStream(stream);
    } catch (err) {
        log("⚠️ [Media] Kamera niedostępna. Fallback do Dummy.", err);
        return setupStream(createBlackScreenStream());
    }
  }, [setupStream]);

  const toggleAudio = useCallback(() => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      setIsAudioMuted(!t.enabled);
      log(`🎤 Mikrofon przełączono na: ${t.enabled ? 'ON' : 'OFF'}`);
    }
  }, []);

  const toggleVideo = useCallback(() => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      setIsVideoStopped(!t.enabled);
      log(`📷 Wideo przełączono na: ${t.enabled ? 'ON' : 'OFF'}`);
    }
  }, []);

  const getDisplayMedia = useCallback(async () => {
      try {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          setIsScreenSharing(true);
          setIsVideoStopped(false); // Włącz wideo przy screen share
          setLocalStream(stream);
          localStreamRef.current = stream;
          return stream;
      } catch (e) {
          throw e;
      }
  }, []);

  const stopLocalScreenShare = useCallback(async () => {
      setIsScreenSharing(false);
      if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      // Wracamy do kamery
      const camStream = await startCamera();
      return camStream;
  }, [startCamera]);

  return {
    localStream,
    localStreamRef,
    isAudioMuted,
    isVideoStopped,
    isScreenSharing,
    startCamera,
    toggleAudio,
    toggleVideo,
    getDisplayMedia,
    stopLocalScreenShare
  };
};