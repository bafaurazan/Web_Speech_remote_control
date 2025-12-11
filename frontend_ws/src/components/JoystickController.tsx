import React, { useEffect, useRef, useState } from 'react';
import nipplejs from 'nipplejs';

interface JoystickProps {
  onMove: (linear: number, angular: number) => void;
  onStop: () => void;
  onCommand: (cmd: string) => void; // np. "forward_rover"
}

export const JoystickController: React.FC<JoystickProps> = ({ onMove, onStop, onCommand }) => {
  const joystickContainerRef = useRef<HTMLDivElement>(null);
  const [keyboardActive, setKeyboardActive] = useState(false);

  // Inicjalizacja Nipple.js
  useEffect(() => {
    if (!joystickContainerRef.current) return;

    const manager = nipplejs.create({
      zone: joystickContainerRef.current,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: 'blue',
      size: 150
    });

    manager.on('move', (_: any, data: any) => {
      const maxDist = 75; // size / 2
      const dist = Math.min(data.distance, maxDist);
      const angleRad = data.angle.radian;

      const linear = (dist * Math.sin(angleRad)) / maxDist;
      const angular = (dist * Math.cos(angleRad)) / maxDist;

      // Clamp values -1 to 1
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
      
      switch (e.key.toLowerCase()) {
        case 'w': onCommand('forward_rover'); break;
        case 's': onCommand('backward_rover'); break;
        case 'a': onCommand('left_rover'); break;
        case 'd': onCommand('right_rover'); break;
        case 'e': onCommand('stop_rover'); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardActive, onCommand]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-2">
        <button onClick={() => setKeyboardActive(!keyboardActive)} className={`px-4 py-2 rounded ${keyboardActive ? 'bg-green-500 text-white' : 'bg-gray-300'}`}>
          {keyboardActive ? 'Keyboard Control ON' : 'Enable Keyboard Control'}
        </button>
      </div>
      
      {/* Kontener Joysticka */}
      <div className="relative w-64 h-64 bg-gray-100 rounded-full border-2 border-gray-300" ref={joystickContainerRef} />
      
      <div className="grid grid-cols-3 gap-2 mt-2">
         <div></div>
         <button className="p-2 bg-gray-200 rounded" onClick={() => onCommand('forward_rover')}>▲</button>
         <div></div>
         <button className="p-2 bg-gray-200 rounded" onClick={() => onCommand('left_rover')}>◀</button>
         <button className="p-2 bg-red-200 rounded" onClick={() => onCommand('stop_rover')}>STOP</button>
         <button className="p-2 bg-gray-200 rounded" onClick={() => onCommand('right_rover')}>▶</button>
         <div></div>
         <button className="p-2 bg-gray-200 rounded" onClick={() => onCommand('backward_rover')}>▼</button>
         <div></div>
      </div>
    </div>
  );
};