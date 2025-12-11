import React, { useEffect, useRef } from 'react';
import type { PeerData } from '../types';

interface VideoGridProps {
  localStream: MediaStream | null;
  remotePeers: PeerData[];
  isAudioMuted: boolean;
  isVideoStopped: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onShareScreen: () => void;
  isScreenSharing: boolean;
}

const VideoPlayer: React.FC<{ stream: MediaStream; muted?: boolean; label: string }> = ({ stream, muted, label }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative border border-gray-700 bg-black rounded overflow-hidden w-full h-64">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 text-sm rounded">
        {label}
      </div>
    </div>
  );
};

export const VideoGrid: React.FC<VideoGridProps> = ({
  localStream,
  remotePeers,
  isAudioMuted,
  isVideoStopped,
  onToggleAudio,
  onToggleVideo,
  onShareScreen,
  isScreenSharing
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Local Video */}
        {localStream && (
          <VideoPlayer stream={localStream} muted={true} label="Me" />
        )}
        
        {/* Remote Videos */}
        {remotePeers.map((peer) => (
          <VideoPlayer key={peer.username} stream={peer.stream} label={peer.username} />
        ))}
      </div>

      <div className="flex gap-2 justify-center">
        <button onClick={onToggleAudio} className="btn-primary">
          {isAudioMuted ? 'Unmute Mic' : 'Mute Mic'}
        </button>
        <button onClick={onToggleVideo} className="btn-primary">
          {isVideoStopped ? 'Camera On' : 'Camera Off'}
        </button>
        <button onClick={onShareScreen} className={`btn-primary ${isScreenSharing ? 'bg-red-600' : ''}`}>
          {isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
        </button>
      </div>
    </div>
  );
};