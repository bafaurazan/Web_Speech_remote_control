import React from 'react';
import type { ImuData, Quaternion } from '../types';

interface Props {
    data: ImuData | null;
}

// Funkcja pomocnicza: Kwaterniony -> Kąty Eulera (do obracania DIV-a)
const quaternionToEuler = (q: Quaternion) => {
    // Roll (x-axis rotation)
    const sinr_cosp = 2 * (q.w * q.x + q.y * q.z);
    const cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);

    // Pitch (y-axis rotation)
    const sinp = 2 * (q.w * q.y - q.z * q.x);
    let pitch = 0;
    if (Math.abs(sinp) >= 1)
        pitch = (Math.PI / 2) * Math.sign(sinp); // use 90 degrees if out of range
    else
        pitch = Math.asin(sinp);

    // Yaw (z-axis rotation)
    const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
    const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);

    return {
        roll: roll * (180 / Math.PI),
        pitch: pitch * (180 / Math.PI),
        yaw: yaw * (180 / Math.PI)
    };
};

export const ImuVisualizer: React.FC<Props> = ({ data }) => {
    if (!data) return <div className="imu-panel">Oczekiwanie na dane IMU...</div>;

    const euler = quaternionToEuler(data.orientation);

    // Styl dla kostki 3D
    const cubeStyle: React.CSSProperties = {
        transform: `rotateX(${euler.pitch}deg) rotateZ(${-euler.roll}deg) rotateY(${euler.yaw}deg)`, 
        // Uwaga: Mapowanie osi zależy od układu współrzędnych (ROS vs CSS). 
        // Tutaj przyjąłem standardowe mapowanie, ale może wymagać korekty w zależności od montażu IMU.
    };

    return (
        <div className="imu-container" style={{ padding: '10px', background: 'rgba(0,0,0,0.5)', borderRadius: '8px', color: 'white', display: 'flex', gap: '20px' }}>
            
            {/* Sekcja 1: Wizualizacja 3D */}
            <div className="scene" style={{ width: '100px', height: '100px', perspective: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="cube" style={{ 
                    width: '60px', height: '60px', position: 'relative', transformStyle: 'preserve-3d', transition: 'transform 0.1s', ...cubeStyle 
                }}>
                    <div className="cube-face front"  style={{ ...faceStyle, transform: 'translateZ(30px)', background: 'rgba(255,0,0,0.6)' }}>FRONT</div>
                    <div className="cube-face back"   style={{ ...faceStyle, transform: 'rotateY(180deg) translateZ(30px)', background: 'rgba(255,0,0,0.6)' }}>BACK</div>
                    <div className="cube-face right"  style={{ ...faceStyle, transform: 'rotateY(90deg) translateZ(30px)', background: 'rgba(0,255,0,0.6)' }}>RIGHT</div>
                    <div className="cube-face left"   style={{ ...faceStyle, transform: 'rotateY(-90deg) translateZ(30px)', background: 'rgba(0,255,0,0.6)' }}>LEFT</div>
                    <div className="cube-face top"    style={{ ...faceStyle, transform: 'rotateX(90deg) translateZ(30px)', background: 'rgba(0,0,255,0.6)' }}>TOP</div>
                    <div className="cube-face bottom" style={{ ...faceStyle, transform: 'rotateX(-90deg) translateZ(30px)', background: 'rgba(0,0,255,0.6)' }}>BTM</div>
                </div>
            </div>

            {/* Sekcja 2: Dane liczbowe */}
            <div className="imu-data" style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>IMU SENSOR</div>
                
                <div style={{ color: '#aaa' }}>Orientation (Euler):</div>
                <div>Roll:  {euler.roll.toFixed(1)}°</div>
                <div>Pitch: {euler.pitch.toFixed(1)}°</div>
                <div>Yaw:   {euler.yaw.toFixed(1)}°</div>

                <div style={{ color: '#aaa', marginTop: '5px' }}>Lin. Accel (m/s²):</div>
                <div>X: {data.linear_acceleration.x.toFixed(2)}</div>
                <div>Y: {data.linear_acceleration.y.toFixed(2)}</div>
                <div>Z: {data.linear_acceleration.z.toFixed(2)}</div>
            </div>
        </div>
    );
};

const faceStyle: React.CSSProperties = {
    position: 'absolute',
    width: '60px',
    height: '60px',
    border: '1px solid white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 'bold',
    color: 'white'
};