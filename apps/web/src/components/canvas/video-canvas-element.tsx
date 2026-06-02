"use client";

import { Play } from "lucide-react";
import { useCallback, useRef, useState } from "react";

type VideoCanvasElementProps = {
  src: string;
  width: number;
  height: number;
};

export function VideoCanvasElement({
  src,
  width,
  height,
}: VideoCanvasElementProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {});
    setPlaying(true);
  }, []);

  const pause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setPlaying(false);
  }, []);

  const handleClick = useCallback(
    (_e: React.MouseEvent) => {
      if (playing) {
        pause();
      } else {
        play();
      }
    },
    [playing, play, pause],
  );

  return (
    <div
      style={{ width, height }}
      className="relative flex items-center justify-center overflow-hidden rounded-lg bg-black"
      onMouseEnter={play}
      onMouseLeave={pause}
      onClick={handleClick}
    >
      <video
        ref={videoRef}
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
      />

      {!playing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity duration-200">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
            <Play className="h-5 w-5 text-white" fill="white" />
          </div>
        </div>
      )}
    </div>
  );
}
