import React, { useEffect, useRef } from 'react';
import type { PeerData } from '../types';

interface VideoGridProps {
  localStream: MediaStream | null;
  remotePeers: PeerData[];
  isAudioMuted: boolean;
  isVideoStopped: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
}

const VideoPlayer: React.FC<{ stream: MediaStream; muted?: boolean; label: string }> = ({ stream, muted, label }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative border border-gray-700 bg-black rounded overflow-hidden w-full h-64 shadow">
      <video ref={videoRef} autoPlay playsInline muted={muted} className="w-full h-full object-cover" />
      <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 text-sm rounded font-bold">
        {label}
      </div>
    </div>
  );
};

export const VideoGrid: React.FC<VideoGridProps> = ({
  localStream,
  remotePeers,
}) => {
  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {localStream ? (
          <VideoPlayer stream={localStream} muted={true} label="Me" />
        ) : (
          <div className="flex items-center justify-center bg-gray-900 border-2 border-dashed border-gray-600 rounded h-64 text-gray-400 font-bold">
            📷 Brak kamery / Zajęta
          </div>
        )}
        {remotePeers.map((peer) => (
          <VideoPlayer key={peer.username} stream={peer.stream} label={peer.username} />
        ))}
      </div>
    </div>
  );
};