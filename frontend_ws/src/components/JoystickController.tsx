import React, { useEffect, useRef, useState } from 'react';
import nipplejs from 'nipplejs';

interface JoystickProps {
  onMove: (linear: number, angular: number) => void;
  onStop: () => void;
  onCommand: (cmd: string) => void;
}

export const JoystickController: React.FC<JoystickProps> = ({ onMove, onStop, onCommand }) => {
  const joystickContainerRef = useRef<HTMLDivElement>(null);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const [isJoystickActive, setIsJoystickActive] = useState(false);

  useEffect(() => {
    if (!isJoystickActive || !joystickContainerRef.current) return;

    // Reset kontenera
    joystickContainerRef.current.innerHTML = '';

    const manager = nipplejs.create({
      zone: joystickContainerRef.current,
      mode: 'static', // Tryb pół-statyczny (widoczny środek, ale łapie dotyk obok)
      catchDistance: 150,
      position: { left: '50%', top: '50%' },
      color: '#4c1d95',
      size: 100,
      threshold: 0.1, 
    });

    manager.on('move', (_: any, data: any) => {
      const maxDist = 50; 
      const dist = Math.min(data.distance, maxDist);
      const angleRad = data.angle.radian;

      const linear = (dist * Math.sin(angleRad)) / maxDist;
      const angular = (dist * Math.cos(angleRad)) / maxDist;

      onMove(
        Math.max(-1, Math.min(1, linear)),
        Math.max(-1, Math.min(1, angular))
      );
    });

    manager.on('end', () => {
      onStop();
    });

    return () => {
      manager.destroy();
    };
  }, [isJoystickActive, onMove, onStop]);

  // Obsługa klawiatury
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!keyboardActive) return;
      if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight", " "].indexOf(e.key) > -1) {
          e.preventDefault();
      }
      switch (e.key.toLowerCase()) {
        case 'w': case 'arrowup': onCommand('forward_rover'); break;
        case 's': case 'arrowdown': onCommand('backward_rover'); break;
        case 'a': case 'arrowleft': onCommand('left_rover'); break;
        case 'd': case 'arrowright': onCommand('right_rover'); break;
        case ' ': case 'e': onCommand('stop_rover'); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardActive, onCommand]);

  return (
    <div className="joystick-layout">
      
      {/* LEWA STRONA: Wrapper Joysticka */}
      <div className="joystick-wrapper">
          {/* Przycisk w stylu aplikacji */}
          <button 
            onClick={() => setIsJoystickActive(!isJoystickActive)}
            className="joystick-toggle-btn"
          >
            {isJoystickActive ? '🔄 Zresetuj Joystick' : '🕹️ Włącz Joystick'}
          </button>

          <div 
            className={`joystick-zone ${isJoystickActive ? 'active' : 'inactive'}`} 
            ref={joystickContainerRef}
          >
             {!isJoystickActive && <span className="disabled-msg">Wyłączony</span>}
          </div>
      </div>
      
      {/* PRAWA STRONA: Przyciski */}
      <div className="joystick-right-panel">
         
         <button 
            onClick={() => setKeyboardActive(!keyboardActive)} 
            className={`key-toggle-btn ${keyboardActive ? 'active' : ''}`}
         >
          {keyboardActive ? '⌨️ ON' : '⌨️ Enable Keys'}
         </button>

         <div className="d-pad-grid-local">
             <div></div>
             <button className="d-btn-local" onClick={() => onCommand('forward_rover')}>▲</button>
             <div></div>
             
             <button className="d-btn-local" onClick={() => onCommand('left_rover')}>◀</button>
             <button className="d-btn-local stop" onClick={() => onCommand('stop_rover')}>🛑</button>
             <button className="d-btn-local" onClick={() => onCommand('right_rover')}>▶</button>
             
             <div></div>
             <button className="d-btn-local" onClick={() => onCommand('backward_rover')}>▼</button>
             <div></div>
         </div>
      </div>

    </div>
  );
};