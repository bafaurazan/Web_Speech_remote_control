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