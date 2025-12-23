import React, { useState, useRef } from 'react';
import './App.css'; 

import { VideoGrid } from './components/VideoGrid';
import { Chat } from './components/Chat';
import { JoystickController } from './components/JoystickController';
import { SpeechControl } from './components/SpeechControl';

import { useLocalMedia } from './hooks/useLocalMedia';
import { useWebRTC } from './hooks/useWebRTC';
import { log } from './utils/helpers';

function App() {
  // === UI State ===
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<'operator' | 'hub' | 'ai'>('operator');
  const [useStun, setUseStun] = useState(true);

  // === Hooks ===
  const media = useLocalMedia();
  const webrtc = useWebRTC({ 
      username, 
      localStreamRef: media.localStreamRef, 
      useStun 
  });
  
  const lastSentTime = useRef<number>(0);

  // === Actions ===
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      log(`👤 [Login] Logowanie jako: ${username}`);
      setIsLoggedIn(true);
      await media.startCamera();
      webrtc.connectWebSocket();
    }
  };

  const handleLogout = () => {
      webrtc.cleanup();
      media.stopLocalScreenShare(); // To czyści też lokalne tracki
      setIsLoggedIn(false);
      setUsername('');
      window.location.reload();
  };

  // Obsługa Screen Sharing
  const toggleScreenShare = async () => {
      if (media.isScreenSharing) {
          log("🖥️ [ScreenShare] Zatrzymywanie...");
          const camStream = await media.stopLocalScreenShare();
          if (camStream) {
              const videoTrack = camStream.getVideoTracks()[0];
              webrtc.replaceVideoTrack(videoTrack);
          }
      } else {
          try {
              log("🖥️ [ScreenShare] Start...");
              const screenStream = await media.getDisplayMedia();
              const screenTrack = screenStream.getVideoTracks()[0];
              
              // Nasłuchuj na przycisk "Stop" przeglądarki
              screenTrack.onended = () => {
                 log("🛑 [ScreenShare] Zatrzymano z UI przeglądarki.");
                 toggleScreenShare(); // wywołaj ponownie by posprzątać
              };
              
              webrtc.replaceVideoTrack(screenTrack);
          } catch (e) {
              log("❌ [ScreenShare] Anulowano/Błąd", e);
          }
      }
  };

  const sendRobotCommand = (cmd: string) => {
      log(`🤖 [Command] Wysyłam komendę: ${cmd}`);
      webrtc.broadcastData({ username, message: cmd });
  };

  // === Render ===
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
                    <input type="checkbox" checked={useStun} onChange={e => setUseStun(e.target.checked)} style={{width: '20px', height: '20px'}} />
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
              <button onClick={media.toggleAudio} className="icon-btn">{media.isAudioMuted ? '🔇' : '🎤'}</button>
              <button onClick={media.toggleVideo} className="icon-btn">{media.isVideoStopped ? '📷 OFF' : '📷 ON'}</button>
              
              <button 
                onClick={toggleScreenShare} 
                className={`icon-btn ${media.isScreenSharing ? 'bg-red-600 text-white' : ''}`}
                title={media.isScreenSharing ? "Stop Sharing" : "Share Screen"}
              >
                {media.isScreenSharing ? '⏹️ Stop Share' : '🖥️ Share'}
              </button>
              
              <button onClick={webrtc.refreshPeers} className="icon-btn">🔄</button>
           </div>
          </header>

          <div className="main-grid">
            {/* Wspólny komponent VideoGrid dla każdego widoku */}
            <div className={`view-section ${activeTab === 'ai' ? 'ai-view' : 'operator-view'}`}>
                <div className="panel">
                    {webrtc.connectionStatus && (
                        <div className="loader-overlay">
                            <div className="spinner"></div>
                            <div className="loader-text">{webrtc.connectionStatus}</div>
                        </div>
                    )}
                    <VideoGrid 
                        localStream={media.localStream} 
                        remotePeers={webrtc.remotePeers} 
                        isAudioMuted={media.isAudioMuted} 
                        isVideoStopped={media.isVideoStopped} 
                        onToggleAudio={media.toggleAudio} 
                        onToggleVideo={media.toggleVideo} 
                    />
                </div>

                {/* Dolny Panel Zależny od Tabu */}
                <div className="panel flex-1">
                    {activeTab === 'operator' && (
                        <JoystickController 
                            onMove={(l, a) => {
                                const now = Date.now();
                                if ((l === 0 && a === 0) || (now - lastSentTime.current > 100)) {
                                    webrtc.broadcastData({ username, joystick: { linear: l, angular: a } });
                                    lastSentTime.current = now;
                                }
                            }} 
                            onStop={() => webrtc.broadcastData({ username, joystick: { linear: 0, angular: 0 } })} 
                            onCommand={sendRobotCommand} 
                        />
                    )}

                    {activeTab === 'hub' && (
                        <Chat 
                            messages={webrtc.chatMessages} 
                            onSendMessage={(msg) => {
                                webrtc.setChatMessages(prev => [...prev, { username: 'Me', message: msg, isMe: true }]);
                                webrtc.broadcastData({ username, message: msg });
                            }} 
                        />
                    )}

                    {activeTab === 'ai' && (
                         <SpeechControl onCommand={sendRobotCommand} />
                    )}
                </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;