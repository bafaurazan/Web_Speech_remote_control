/**
 * PLIK: helpers.ts
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
    log("⬛ [Media] Generowanie czarnego ekranu (Dummy) z animacją...");
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');

    // === POPRAWKA: Funkcja rysująca w pętli ===
    const draw = () => {
        if (!ctx) return;
        
        // 1. Tło
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 640, 480);
        
        // 2. Napisy stałe
        ctx.fillStyle = 'white';
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('NO CAMERA', 320, 240);
        ctx.font = '16px Arial';
        ctx.fillText('(Audio Only)', 320, 270);

        // 3. Element zmienny (Zegar) - wymusza na WebRTC wysyłanie nowych klatek
        // Bez tego elementu przeglądarka może uznać obraz za statyczny i przestać wysyłać dane.
        const time = new Date().toISOString().split('T')[1].split('.')[0];
        ctx.font = '12px Monospace';
        ctx.fillStyle = '#555'; // Ciemnoszary
        ctx.fillText(time, 320, 460);
    };

    // Uruchamiamy pętlę rysowania (15 FPS wystarczy dla dummy stream)
    // Używamy setInterval zamiast requestAnimationFrame, żeby działało nawet w tle
    setInterval(draw, 1000 / 15);
    
    // Pierwsze rysowanie natychmiast
    draw();

    const videoStream = canvas.captureStream(15);
    
    // Generowanie cichego audio
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const dst = audioCtx.createMediaStreamDestination();
    
    // Tworzymy oscylator o zerowej głośności, aby ścieżka audio była "aktywna"
    const oscillator = audioCtx.createOscillator();
    oscillator.start();
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0; // Cisza
    oscillator.connect(gainNode);
    gainNode.connect(dst);

    const audioTrack = dst.stream.getAudioTracks()[0];
    const videoTrack = videoStream.getVideoTracks()[0];

    // Ważne: ustawiamy enabled na true
    videoTrack.enabled = true;
    audioTrack.enabled = true;

    return new MediaStream([videoTrack, audioTrack]);
};