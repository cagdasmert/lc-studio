import { useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import { drawCompositionFrame, getTotalFrames } from '../../renderer/compositor';
import { createMediaCache, type MediaCache } from '../../renderer/media-cache';
import type { Layer } from '../../types';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate' | null;

interface DragState {
  type: 'move' | 'resize' | 'rotate' | 'pan';
  startMouseX: number;
  startMouseY: number;
  startLayerX: number;
  startLayerY: number;
  startLayerW: number;
  startLayerH: number;
  startRotation: number;
  startPanX: number;
  startPanY: number;
  handle: Handle;
  layerId: string | null;
}

const HANDLE_SIZE = 8;
const ROTATE_HANDLE_OFFSET = 20;

export function CanvasWorkspace() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaCacheRef = useRef<MediaCache>(createMediaCache());
  const dragRef = useRef<DragState | null>(null);

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
  const updateLayer = useStore((s) => s.updateLayer);
  const toolMode = useStore((s) => s.toolMode);
  const canvasZoom = useStore((s) => s.canvasZoom);
  const setCanvasZoom = useStore((s) => s.setCanvasZoom);
  const showGrid = useStore((s) => s.showGrid);
  const snapToGrid = useStore((s) => s.snapToGrid);
  const gridSize = useStore((s) => s.gridSize);
  const panX = useStore((s) => s.panX);
  const panY = useStore((s) => s.panY);
  const setPan = useStore((s) => s.setPan);

  const { width, height, fps } = composition.output;
  const totalFrames = getTotalFrames(composition);

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = useCallback(
    (clientX: number, clientY: number): { cx: number; cy: number } => {
      const container = containerRef.current;
      if (!container) return { cx: 0, cy: 0 };
      const rect = container.getBoundingClientRect();
      const cx = (clientX - rect.left - rect.width / 2 - panX) / canvasZoom + width / 2;
      const cy = (clientY - rect.top - rect.height / 2 - panY) / canvasZoom + height / 2;
      return { cx, cy };
    },
    [canvasZoom, panX, panY, width, height],
  );

  const snap = useCallback(
    (val: number): number => {
      if (!snapToGrid) return val;
      return Math.round(val / gridSize) * gridSize;
    },
    [snapToGrid, gridSize],
  );

  // Get selected layer's bounding box in canvas coords
  const getSelectedLayerBounds = useCallback((): {
    layer: Layer;
    lx: number;
    ly: number;
    lw: number;
    lh: number;
  } | null => {
    if (!selectedLayerId) return null;
    const scene = composition.scenes[selectedSceneIndex];
    if (!scene) return null;
    const layer = scene.layers.find((l) => l.id === selectedLayerId);
    if (!layer || layer.type === 'audio') return null;
    const lx = layer.x - layer.width * layer.anchorX;
    const ly = layer.y - layer.height * layer.anchorY;
    return { layer, lx, ly, lw: layer.width, lh: layer.height };
  }, [composition, selectedSceneIndex, selectedLayerId]);

  // Determine which handle (if any) is under the cursor
  const hitTestHandle = useCallback(
    (cx: number, cy: number): Handle => {
      const bounds = getSelectedLayerBounds();
      if (!bounds) return null;
      const { lx, ly, lw, lh } = bounds;
      const hs = HANDLE_SIZE / canvasZoom;

      // Rotate handle
      const rotX = lx + lw / 2;
      const rotY = ly - ROTATE_HANDLE_OFFSET / canvasZoom;
      if (Math.abs(cx - rotX) < hs && Math.abs(cy - rotY) < hs) return 'rotate';

      // Corner and edge handles
      const handles: { handle: Handle; hx: number; hy: number }[] = [
        { handle: 'nw', hx: lx, hy: ly },
        { handle: 'n', hx: lx + lw / 2, hy: ly },
        { handle: 'ne', hx: lx + lw, hy: ly },
        { handle: 'e', hx: lx + lw, hy: ly + lh / 2 },
        { handle: 'se', hx: lx + lw, hy: ly + lh },
        { handle: 's', hx: lx + lw / 2, hy: ly + lh },
        { handle: 'sw', hx: lx, hy: ly + lh },
        { handle: 'w', hx: lx, hy: ly + lh / 2 },
      ];

      for (const { handle, hx, hy } of handles) {
        if (Math.abs(cx - hx) < hs && Math.abs(cy - hy) < hs) return handle;
      }

      return null;
    },
    [getSelectedLayerBounds, canvasZoom],
  );

  const drawFrame = useCallback(
    (frame: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Apply zoom and pan
      const containerW = canvas.width;
      const containerH = canvas.height;
      ctx.translate(containerW / 2 + panX * devicePixelRatio, containerH / 2 + panY * devicePixelRatio);
      ctx.scale(canvasZoom, canvasZoom);
      ctx.translate(-width / 2, -height / 2);

      // Draw composition
      drawCompositionFrame(ctx, composition, frame, mediaCacheRef.current);

      // Grid overlay
      if (showGrid) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1 / canvasZoom;
        for (let x = 0; x <= width; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = 0; y <= height; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
      }

      // Selection overlay
      if (selectedLayerId) {
        const bounds = getSelectedLayerBounds();
        if (bounds) {
          const { layer, lx, ly, lw, lh } = bounds;

          // Check if layer is active at current frame
          let frameOffset = 0;
          for (let i = 0; i < selectedSceneIndex; i++) {
            frameOffset += composition.scenes[i].durationFrames;
          }
          const frameInScene = frame - frameOffset;

          if (frameInScene >= layer.startFrame && frameInScene < layer.endFrame) {
            const lw2 = 2 / canvasZoom;

            // Bounding box
            ctx.strokeStyle = '#00aaff';
            ctx.lineWidth = lw2;
            ctx.setLineDash([6 / canvasZoom, 3 / canvasZoom]);
            ctx.strokeRect(lx, ly, lw, lh);
            ctx.setLineDash([]);

            // Resize handles
            const hs = HANDLE_SIZE / canvasZoom;
            ctx.fillStyle = '#00aaff';
            const handles = [
              [lx, ly], [lx + lw / 2, ly], [lx + lw, ly],
              [lx + lw, ly + lh / 2],
              [lx + lw, ly + lh], [lx + lw / 2, ly + lh], [lx, ly + lh],
              [lx, ly + lh / 2],
            ];
            for (const [hx, hy] of handles) {
              ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
            }

            // Rotation handle
            const rotX = lx + lw / 2;
            const rotY = ly - ROTATE_HANDLE_OFFSET / canvasZoom;
            ctx.beginPath();
            ctx.moveTo(rotX, ly);
            ctx.lineTo(rotX, rotY);
            ctx.strokeStyle = '#00aaff';
            ctx.lineWidth = lw2;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(rotX, rotY, hs / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.restore();
    },
    [composition, selectedLayerId, selectedSceneIndex, canvasZoom, panX, panY, width, height, showGrid, gridSize, getSelectedLayerBounds],
  );

  // Stable refs for values used in effects that shouldn't trigger re-creation
  const drawFrameRef = useRef(drawFrame);
  drawFrameRef.current = drawFrame;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const frameRef = useRef(currentFrame);
  frameRef.current = currentFrame;

  // Resize canvas to fill container — uses refs to avoid recreating the observer
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      canvas.style.width = `${container.clientWidth}px`;
      canvas.style.height = `${container.clientHeight}px`;
      if (!playingRef.current) drawFrameRef.current(frameRef.current);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;

    let animId: number;
    let lastTime = 0;
    const frameDuration = 1000 / (fps * speed);
    let frame = frameRef.current;

    function tick(time: number) {
      if (lastTime === 0) {
        lastTime = time;
        // Draw immediately on first tick so canvas isn't blank
        drawFrameRef.current(frame);
      }
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
        drawFrameRef.current(frame);
      }
      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [playing, fps, speed, loop, totalFrames, setCurrentFrame, setPlaying]);

  // Redraw on state change when paused
  useEffect(() => {
    if (!playing) {
      drawFrame(currentFrame);
    }
  }, [currentFrame, composition, playing, drawFrame, canvasZoom, panX, panY, showGrid, selectedLayerId]);

  // ── Mouse interaction ───────────────────────────────

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const { cx, cy } = screenToCanvas(e.clientX, e.clientY);

    // Hand tool or middle button → pan
    if (toolMode === 'hand' || e.button === 1) {
      dragRef.current = {
        type: 'pan',
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startPanX: panX,
        startPanY: panY,
        startLayerX: 0, startLayerY: 0, startLayerW: 0, startLayerH: 0,
        startRotation: 0, handle: null, layerId: null,
      };
      return;
    }

    // Check resize/rotate handles first
    const handle = hitTestHandle(cx, cy);
    if (handle && selectedLayerId) {
      const bounds = getSelectedLayerBounds()!;
      dragRef.current = {
        type: handle === 'rotate' ? 'rotate' : 'resize',
        startMouseX: cx,
        startMouseY: cy,
        startLayerX: bounds.layer.x,
        startLayerY: bounds.layer.y,
        startLayerW: bounds.layer.width,
        startLayerH: bounds.layer.height,
        startRotation: bounds.layer.rotation,
        startPanX: panX, startPanY: panY,
        handle,
        layerId: selectedLayerId,
      };
      return;
    }

    // Hit test layers for selection
    const scene = composition.scenes[selectedSceneIndex];
    if (!scene) return;

    let frameOffset = 0;
    for (let i = 0; i < selectedSceneIndex; i++) {
      frameOffset += composition.scenes[i].durationFrames;
    }
    const frameInScene = currentFrame - frameOffset;

    const sorted = [...scene.layers]
      .filter((l) => l.visible && !l.locked && l.type !== 'audio')
      .sort((a, b) => b.zIndex - a.zIndex);

    for (const layer of sorted) {
      if (frameInScene < layer.startFrame || frameInScene >= layer.endFrame) continue;
      const lx = layer.x - layer.width * layer.anchorX;
      const ly = layer.y - layer.height * layer.anchorY;

      if (cx >= lx && cx <= lx + layer.width && cy >= ly && cy <= ly + layer.height) {
        selectLayer(layer.id);

        // Start move if select or move tool
        if (toolMode === 'select' || toolMode === 'move') {
          dragRef.current = {
            type: 'move',
            startMouseX: cx,
            startMouseY: cy,
            startLayerX: layer.x,
            startLayerY: layer.y,
            startLayerW: layer.width,
            startLayerH: layer.height,
            startRotation: layer.rotation,
            startPanX: panX, startPanY: panY,
            handle: null,
            layerId: layer.id,
          };
        }
        return;
      }
    }

    // Clicked empty space
    selectLayer(null);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) {
      // Update cursor based on handle hover
      const { cx, cy } = screenToCanvas(e.clientX, e.clientY);
      const handle = hitTestHandle(cx, cy);
      const canvas = canvasRef.current;
      if (canvas) {
        if (toolMode === 'hand') {
          canvas.style.cursor = 'grab';
        } else if (handle === 'rotate') {
          canvas.style.cursor = 'crosshair';
        } else if (handle === 'n' || handle === 's') {
          canvas.style.cursor = 'ns-resize';
        } else if (handle === 'e' || handle === 'w') {
          canvas.style.cursor = 'ew-resize';
        } else if (handle === 'nw' || handle === 'se') {
          canvas.style.cursor = 'nwse-resize';
        } else if (handle === 'ne' || handle === 'sw') {
          canvas.style.cursor = 'nesw-resize';
        } else {
          canvas.style.cursor = toolMode === 'move' ? 'move' : 'default';
        }
      }
      return;
    }

    if (drag.type === 'pan') {
      const dx = e.clientX - drag.startMouseX;
      const dy = e.clientY - drag.startMouseY;
      setPan(drag.startPanX + dx, drag.startPanY + dy);
      return;
    }

    if (!drag.layerId) return;

    const { cx, cy } = screenToCanvas(e.clientX, e.clientY);

    if (drag.type === 'move') {
      const dx = cx - drag.startMouseX;
      const dy = cy - drag.startMouseY;
      const newX = snap(drag.startLayerX + dx);
      const newY = snap(drag.startLayerY + dy);
      updateLayer(selectedSceneIndex, drag.layerId, { x: newX, y: newY } as Partial<Layer>);
    } else if (drag.type === 'resize') {
      const h = drag.handle!;
      let newX = drag.startLayerX;
      let newY = drag.startLayerY;
      let newW = drag.startLayerW;
      let newH = drag.startLayerH;

      const dx = cx - drag.startMouseX;
      const dy = cy - drag.startMouseY;

      // Adjust size based on which handle is being dragged
      if (h.includes('e')) newW = Math.max(10, drag.startLayerW + dx);
      if (h.includes('w')) {
        newW = Math.max(10, drag.startLayerW - dx);
        newX = drag.startLayerX + dx;
      }
      if (h.includes('s')) newH = Math.max(10, drag.startLayerH + dy);
      if (h.includes('n')) {
        newH = Math.max(10, drag.startLayerH - dy);
        newY = drag.startLayerY + dy;
      }

      // Shift = maintain aspect ratio
      if (e.shiftKey) {
        const aspect = drag.startLayerW / drag.startLayerH;
        if (h === 'n' || h === 's') {
          newW = newH * aspect;
        } else if (h === 'e' || h === 'w') {
          newH = newW / aspect;
        } else {
          // Corner handles
          const avgScale = (newW / drag.startLayerW + newH / drag.startLayerH) / 2;
          newW = drag.startLayerW * avgScale;
          newH = drag.startLayerH * avgScale;
        }
      }

      newW = snap(newW);
      newH = snap(newH);

      const patch: Partial<Layer> = { width: newW, height: newH };
      // Adjust position for anchored layers when resizing from top/left
      if (h.includes('w') || h.includes('n')) {
        const bounds = getSelectedLayerBounds();
        if (bounds) {
          patch.x = snap(newX + newW * bounds.layer.anchorX) as number;
          patch.y = snap(newY + newH * bounds.layer.anchorY) as number;
        }
      }
      updateLayer(selectedSceneIndex, drag.layerId, patch);
    } else if (drag.type === 'rotate') {
      const bounds = getSelectedLayerBounds();
      if (bounds) {
        const centerX = bounds.lx + bounds.lw / 2;
        const centerY = bounds.ly + bounds.lh / 2;
        const angle = Math.atan2(cy - centerY, cx - centerX) * (180 / Math.PI) + 90;
        updateLayer(selectedSceneIndex, drag.layerId, {
          rotation: Math.round(angle),
        } as Partial<Layer>);
      }
    }
  }

  function handleMouseUp() {
    dragRef.current = null;
  }

  // Mouse wheel zoom
  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setCanvasZoom(canvasZoom + delta);
  }

  // Cursor style
  const cursorStyle =
    toolMode === 'hand' ? 'grab' :
    toolMode === 'move' ? 'move' : 'default';

  return (
    <div className="canvas-workspace" ref={containerRef}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: cursorStyle }}
      />
    </div>
  );
}
