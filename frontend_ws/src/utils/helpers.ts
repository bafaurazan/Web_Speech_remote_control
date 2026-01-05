/**
 * PLIK: helpers.ts
 * OPIS: Funkcje pomocnicze dla całej aplikacji.
 * - getWebSocketUrl: dynamiczne określanie adresu WS.
 * - log: ujednolicony format logowania z timestampem.
 * - createBlackScreenStream: generuje "pusty" strumień wideo, gdy kamera jest niedostępna.
 */

export const STUN_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ]
};

export const NO_STUN_CONFIG = {
    iceServers: [] 
};

export const getWebSocketUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const host = window.location.host; 
    return `${protocol}${host}/ws`; 
}; 

export const log = (prefix: string, ...args: any[]) => {
    const now = new Date();
    const time = now.toISOString().split('T')[1].slice(0, -1); 
    console.log(`[${time}] ${prefix}`, ...args);
};

export const createBlackScreenStream = () => {
    log("⬛ [Media] Generowanie czarnego ekranu (Dummy)...");
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
        ctx.font = '16px Arial';
        ctx.fillText('(Audio Only)', 320, 270);
    }
    const videoStream = canvas.captureStream(15);
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const dst = audioCtx.createMediaStreamDestination();
    const audioTrack = dst.stream.getAudioTracks()[0];
    const videoTrack = videoStream.getVideoTracks()[0];
    return new MediaStream([videoTrack, audioTrack]);
};