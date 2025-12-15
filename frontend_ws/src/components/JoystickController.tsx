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

  // Inicjalizacja Nipple.js
  useEffect(() => {
    if (!joystickContainerRef.current) return;

    // Upewniamy się, że kontener jest pusty przed inicjalizacją (zapobiega dublowaniu)
    joystickContainerRef.current.innerHTML = '';

    const manager = nipplejs.create({
      zone: joystickContainerRef.current,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: '#4c1d95',
      size: 120 
    });

    manager.on('move', (_: any, data: any) => {
      const maxDist = 60; 
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
  }, [onMove, onStop]);

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
    // Używamy własnej klasy CSS zamiast klas Tailwind
    <div className="joystick-layout">
      
      {/* LEWA STRONA: Strefa Joysticka */}
      <div className="joystick-zone" ref={joystickContainerRef} />
      
      {/* PRAWA STRONA: Panel przycisków */}
      <div className="joystick-right-panel">
         
         <button 
            onClick={() => setKeyboardActive(!keyboardActive)} 
            className={`key-toggle-btn ${keyboardActive ? 'active' : ''}`}
         >
          {keyboardActive ? '⌨️ ON' : '⌨️ Enable Keys'}
         </button>

         {/* Siatka D-Pad */}
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