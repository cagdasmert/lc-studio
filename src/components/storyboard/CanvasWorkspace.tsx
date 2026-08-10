import { useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import { drawCompositionFrame, getTotalFrames } from '../../renderer/compositor';
import { createMediaCache, type MediaCache } from '../../renderer/media-cache';

export function CanvasWorkspace() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaCacheRef = useRef<MediaCache>(createMediaCache());

  const composition = useStore((s) => s.composition);
  const currentFrame = useStore((s) => s.currentFrame);
  const playing = useStore((s) => s.playing);
  const loop = useStore((s) => s.loop);
  const speed = useStore((s) => s.speed);
  const setCurrentFrame = useStore((s) => s.setCurrentFrame);
  const setPlaying = useStore((s) => s.setPlaying);
  const selectedLayerId = useStore((s) => s.selectedLayerId);
  const selectedSceneIndex = useStore((s) => s.selectedSceneIndex);
  const selectLayer = useStore((s) => s.selectLayer);

  const { width, height, fps } = composition.output;
  const totalFrames = getTotalFrames(composition);

  const drawFrame = useCallback(
    (frame: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawCompositionFrame(ctx, composition, frame, mediaCacheRef.current);

      // Draw selection overlay for selected layer
      if (selectedLayerId) {
        const scene = composition.scenes[selectedSceneIndex];
        if (scene) {
          const layer = scene.layers.find((l) => l.id === selectedLayerId);
          if (layer && layer.type !== 'audio' && layer.visible) {
            // Calculate frame within scene
            let frameOffset = 0;
            for (let i = 0; i < selectedSceneIndex; i++) {
              frameOffset += composition.scenes[i].durationFrames;
            }
            const frameInScene = frame - frameOffset;

            if (frameInScene >= layer.startFrame && frameInScene < layer.endFrame) {
              ctx.save();
              ctx.strokeStyle = '#00aaff';
              ctx.lineWidth = 2;
              ctx.setLineDash([6, 3]);
              ctx.strokeRect(layer.x - layer.width * layer.anchorX, layer.y - layer.height * layer.anchorY, layer.width, layer.height);
              ctx.restore();
            }
          }
        }
      }
    },
    [composition, selectedLayerId, selectedSceneIndex],
  );

  // Playback loop
  useEffect(() => {
    if (!playing) return;

    let animId: number;
    let lastTime = 0;
    const frameDuration = 1000 / (fps * speed);
    let frame = currentFrame;

    function tick(time: number) {
      if (time - lastTime >= frameDuration) {
        lastTime = time;
        frame++;
        if (frame >= totalFrames) {
          if (loop) {
            frame = 0;
          } else {
            setPlaying(false);
            return;
          }
        }
        setCurrentFrame(frame);
        drawFrame(frame);
      }
      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [playing, fps, speed, loop, totalFrames, drawFrame, setCurrentFrame, setPlaying, currentFrame]);

  // Redraw on frame or composition change when paused
  useEffect(() => {
    if (!playing) {
      drawFrame(currentFrame);
    }
  }, [currentFrame, composition, playing, drawFrame]);

  // Hit testing for layer selection on canvas click
  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const scene = composition.scenes[selectedSceneIndex];
    if (!scene) return;

    // Calculate frame in scene
    let frameOffset = 0;
    for (let i = 0; i < selectedSceneIndex; i++) {
      frameOffset += composition.scenes[i].durationFrames;
    }
    const frameInScene = currentFrame - frameOffset;

    // Check layers in reverse z-order (top first)
    const sorted = [...scene.layers]
      .filter((l) => l.visible && !l.locked && l.type !== 'audio')
      .sort((a, b) => b.zIndex - a.zIndex);

    for (const layer of sorted) {
      if (frameInScene < layer.startFrame || frameInScene >= layer.endFrame) continue;

      const lx = layer.x - layer.width * layer.anchorX;
      const ly = layer.y - layer.height * layer.anchorY;

      if (clickX >= lx && clickX <= lx + layer.width &&
          clickY >= ly && clickY <= ly + layer.height) {
        selectLayer(layer.id);
        return;
      }
    }

    // Clicked empty space — deselect
    selectLayer(null);
  }

  return (
    <div className="canvas-workspace">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleCanvasClick}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          cursor: 'crosshair',
        }}
      />
    </div>
  );
}
