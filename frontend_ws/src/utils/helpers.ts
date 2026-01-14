/**
 * PLIK: helpers.ts
 */

// Konfiguracja adresu
const BASE_HOST = 'rafal.tail692f2a.ts.net';
const USE_SSL = true; // Zmień na false jeśli testujesz lokalnie bez certyfikatu

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
    const protocol = USE_SSL ? 'wss://' : 'ws://';
    return `${protocol}${BASE_HOST}/ws`; 
}; 

// Helper do API (logowanie itp)
export const getApiUrl = (endpoint: string) => {
    const protocol = USE_SSL ? 'https://' : 'http://';
    // Usuwamy wiodący slash, żeby nie dublować
    const path = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    return `${protocol}${BASE_HOST}/${path}`;
};

export const log = (prefix: string, ...args: any[]) => {
    const now = new Date();
    const time = now.toISOString().split('T')[1].slice(0, -1); 
    console.log(`[${time}] ${prefix}`, ...args);
};

export const createBlackScreenStream = () => {
    log("⬛ [Media] Generowanie czarnego ekranu (Dummy) z animacją...");
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');

    const draw = () => {
        if (!ctx) return;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = 'white';
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('NO CAMERA', 320, 240);
        ctx.font = '16px Arial';
        ctx.fillText('(Audio Only)', 320, 270);
        const time = new Date().toISOString().split('T')[1].split('.')[0];
        ctx.font = '12px Monospace';
        ctx.fillStyle = '#555';
        ctx.fillText(time, 320, 460);
    };

    setInterval(draw, 1000 / 15);
    draw();

    const videoStream = canvas.captureStream(15);
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const dst = audioCtx.createMediaStreamDestination();
    const oscillator = audioCtx.createOscillator();
    oscillator.start();
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0; 
    oscillator.connect(gainNode);
    gainNode.connect(dst);

    const audioTrack = dst.stream.getAudioTracks()[0];
    const videoTrack = videoStream.getVideoTracks()[0];
    videoTrack.enabled = true;
    audioTrack.enabled = true;

    return new MediaStream([videoTrack, audioTrack]);
};