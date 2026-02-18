export interface SignalMessage {
  peer: string;
  action: 'new-peer' | 'new-offer' | 'new-answer'| 'request-connect' | 'start-call';
  message: {
    receiver_channel_name?: string;
    sdp?: RTCSessionDescriptionInit;
    [key: string]: any;
  };
}

export interface ChatMessage {
  username: string;
  message: string;
  isMe: boolean;
}

export interface PeerData {
  username: string;
  stream: MediaStream;
}

// --- NOWE TYPY IMU ---
export interface Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;
}

export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

export interface ImuData {
    orientation: Quaternion;
    angular_velocity: Vector3;
    linear_acceleration: Vector3;
}