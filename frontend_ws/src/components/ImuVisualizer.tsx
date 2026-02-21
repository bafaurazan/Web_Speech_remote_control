import React from 'react';

// Rozszerzone typy
interface Vector3 { x: number; y: number; z: number; }
interface Quaternion { x: number; y: number; z: number; w: number; }

export interface PoseData {
    imu?: {
        orientation: Quaternion;
        angular_velocity: Vector3;
        linear_acceleration: Vector3;
    };
    position?: Vector3;
}

interface Props {
    data: PoseData | null;
}

const quaternionToEuler = (q: Quaternion) => {
    const sinr_cosp = 2 * (q.w * q.x + q.y * q.z);
    const cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);

    const sinp = 2 * (q.w * q.y - q.z * q.x);
    let pitch = 0;
    if (Math.abs(sinp) >= 1)
        pitch = (Math.PI / 2) * Math.sign(sinp);
    else
        pitch = Math.asin(sinp);

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
    if (!data || !data.imu) return <div style={{ color: 'white', padding: '20px' }}>Oczekiwanie na dane 6DOF...</div>;

    const euler = quaternionToEuler(data.imu.orientation);
    const pos = data.position || { x: 0, y: 0, z: 0 };

    const PIXELS_PER_METER = 40; 
    const translateX = pos.x * PIXELS_PER_METER;
    const translateY = -pos.y * PIXELS_PER_METER; 
    const translateZ = pos.z * PIXELS_PER_METER;

    return (
        <div style={{ 
            padding: '15px', 
            background: 'linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.9))', 
            borderRadius: '16px', 
            color: 'white', 
            display: 'flex', 
            gap: '30px',
            alignItems: 'center',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}>
            
            {/* Scena 3D */}
            <div style={{ 
                width: '160px', 
                height: '160px', 
                perspective: '800px', // Głębia perspektywy
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                borderRadius: '12px',
                background: 'rgba(0,0,0,0.3)',
                overflow: 'hidden',
                position: 'relative'
            }}>
                {/* ŚWIAT (Kamera obrócona izometrycznie) */}
                <div style={{
                    width: '100%',
                    height: '100%',
                    position: 'absolute',
                    transformStyle: 'preserve-3d',
                    // Obracamy cały świat, żeby patrzeć "z góry i z boku"
                    transform: 'rotateX(-25deg) rotateY(-45deg)' 
                }}>
                    
                    {/* PODŁOGA (Grid) - dodaje poczucie przemieszczania w osiach XYZ */}
                    <div style={{
                        position: 'absolute',
                        width: '300px', height: '300px',
                        left: '50%', top: '50%',
                        transform: 'translate(-50%, -50%) rotateX(90deg) translateZ(-40px)', // Podłoga poniżej kostki
                        background: `
                            linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
                        `,
                        backgroundSize: '20px 20px',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }} />

                    {/* OBIEKT (Kostka robota) */}
                    <div style={{ 
                        width: '40px', 
                        height: '40px', 
                        position: 'absolute', 
                        left: 'calc(50% - 20px)', // Centrowanie
                        top: 'calc(50% - 20px)',  // Centrowanie
                        transformStyle: 'preserve-3d', 
                        transform: `translate3d(${translateX}px, ${translateY}px, ${translateZ}px) rotateX(${euler.pitch}deg) rotateZ(${-euler.roll}deg) rotateY(${euler.yaw}deg)`, 
                        transition: 'transform 0.05s linear'
                    }}>
                        {/* Ściany mają lekko zmodyfikowane kolory, żeby imitować światło */}
                        <div style={{ ...faceStyle, transform: 'translateZ(20px)', background: '#ef4444' }}>F</div>
                        <div style={{ ...faceStyle, transform: 'rotateY(180deg) translateZ(20px)', background: '#991b1b' }}>B</div>
                        <div style={{ ...faceStyle, transform: 'rotateY(90deg) translateZ(20px)', background: '#16a34a' }}>R</div>
                        <div style={{ ...faceStyle, transform: 'rotateY(-90deg) translateZ(20px)', background: '#15803d' }}>L</div>
                        <div style={{ ...faceStyle, transform: 'rotateX(90deg) translateZ(20px)', background: '#3b82f6' }}>T</div>
                        <div style={{ ...faceStyle, transform: 'rotateX(-90deg) translateZ(20px)', background: '#1e40af' }}>D</div>
                    </div>
                </div>
            </div>

            {/* Panele Danych (Oczyszczone i wyrównane) */}
            <div style={{ fontSize: '0.85rem', fontFamily: 'monospace', display: 'flex', gap: '24px' }}>
                <div>
                    <div style={{ fontWeight: 'bold', color: '#60a5fa', borderBottom: '1px solid #60a5fa', paddingBottom: '4px', marginBottom: '8px' }}>ROTACJA (°)</div>
                    <div>R: {euler.roll.toFixed(1).padStart(6, '\u00A0')}</div>
                    <div>P: {euler.pitch.toFixed(1).padStart(6, '\u00A0')}</div>
                    <div>Y: {euler.yaw.toFixed(1).padStart(6, '\u00A0')}</div>
                </div>
                <div>
                    <div style={{ fontWeight: 'bold', color: '#34d399', borderBottom: '1px solid #34d399', paddingBottom: '4px', marginBottom: '8px' }}>POZYCJA (m)</div>
                    <div>X: {pos.x.toFixed(2).padStart(6, '\u00A0')}</div>
                    <div>Y: {pos.y.toFixed(2).padStart(6, '\u00A0')}</div>
                    <div>Z: {pos.z.toFixed(2).padStart(6, '\u00A0')}</div>
                </div>
                <div>
                    <div style={{ fontWeight: 'bold', color: '#f87171', borderBottom: '1px solid #f87171', paddingBottom: '4px', marginBottom: '8px' }}>ACCEL (m/s²)</div>
                    <div>X: {data.imu.linear_acceleration.x.toFixed(2).padStart(6, '\u00A0')}</div>
                    <div>Y: {data.imu.linear_acceleration.y.toFixed(2).padStart(6, '\u00A0')}</div>
                    <div>Z: {data.imu.linear_acceleration.z.toFixed(2).padStart(6, '\u00A0')}</div>
                </div>
            </div>
        </div>
    );
};

const faceStyle: React.CSSProperties = {
    position: 'absolute',
    width: '40px',
    height: '40px',
    border: '1px solid rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: '900',
    color: 'rgba(255,255,255,0.9)',
    boxShadow: 'inset 0 0 15px rgba(0,0,0,0.4)' // Dodaje głębi ściankom
};