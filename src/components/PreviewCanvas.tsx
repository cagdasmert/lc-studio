import { useRef, useEffect, useCallback, useState } from 'react';
import type { Composition } from '../types';
import { drawCompositionFrame, getTotalFrames } from '../renderer/compositor';

interface PreviewCanvasProps {
  composition: Composition;
}

export function PreviewCanvas({ composition }: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const playingRef = useRef(true);
  const [playing, setPlaying] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);

  const totalFrames = getTotalFrames(composition);
  const { width, height, fps } = composition.output;

  const drawFrame = useCallback(
    (frame: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawCompositionFrame(ctx, composition, frame);
    },
    [composition],
  );

  useEffect(() => {
    let animId: number;
    let lastTime = 0;
    const frameDuration = 1000 / fps;

    function tick(time: number) {
      if (!playingRef.current) {
        animId = requestAnimationFrame(tick);
        return;
      }

      if (time - lastTime >= frameDuration) {
        lastTime = time;
        const frame = frameRef.current % totalFrames;
        drawFrame(frame);
        setCurrentFrame(frame);
        frameRef.current = frame + 1;
      }
      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [drawFrame, totalFrames, fps]);

  // Redraw current frame when composition changes while paused
  useEffect(() => {
    if (!playing) {
      drawFrame(frameRef.current % totalFrames);
    }
  }, [composition, playing, drawFrame, totalFrames]);

  function togglePlay() {
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
  }

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const frame = Number(e.target.value);
    frameRef.current = frame;
    setCurrentFrame(frame);
    drawFrame(frame);
  }

  return (
    <div className="preview-canvas">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          maxWidth: '100%',
          maxHeight: '60vh',
          border: '1px solid #333',
          borderRadius: 4,
        }}
      />
      <div className="preview-controls">
        <button onClick={togglePlay}>{playing ? '⏸ Pause' : '▶ Play'}</button>
        <input
          type="range"
          min={0}
          max={totalFrames - 1}
          value={currentFrame}
          onChange={handleScrub}
        />
        <span>
          {currentFrame} / {totalFrames} frames
        </span>
      </div>
    </div>
  );
}
