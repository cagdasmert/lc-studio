import type { Composition, ExportFormat, QualityPreset } from '../types';
import { getTotalFrames, drawCompositionFrame } from './compositor';
import { createMediaCache, preloadComposition, clearCache } from './media-cache';
import { startRender, writeFrame, finishRender } from '../lib/tauri-bridge';
import { writeFile, mkdir } from '@tauri-apps/plugin-fs';

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create blob'));
    }, type);
  });
}

function padFrame(n: number, total: number): string {
  const digits = Math.max(4, String(total).length);
  return String(n).padStart(digits, '0');
}

async function renderPngSequence(
  composition: Composition,
  outputDir: string,
  onProgress?: (current: number, total: number) => void,
  projectDir?: string | null,
): Promise<void> {
  const { width, height } = composition.output;
  const totalFrames = getTotalFrames(composition);

  const mediaCache = createMediaCache();
  await preloadComposition(mediaCache, composition.scenes, projectDir);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D context');

  // Ensure output directory exists
  try {
    await mkdir(outputDir, { recursive: true });
  } catch {
    // directory may already exist
  }

  try {
    for (let frame = 0; frame < totalFrames; frame++) {
      drawCompositionFrame(ctx, composition, frame, mediaCache);

      const blob = await canvasToBlob(canvas, 'image/png');
      const buffer = new Uint8Array(await blob.arrayBuffer());
      const filePath = `${outputDir}/frame-${padFrame(frame, totalFrames)}.png`;
      await writeFile(filePath, buffer);

      onProgress?.(frame + 1, totalFrames);

      if (frame % 5 === 0) {
        await yieldToEventLoop();
      }
    }
  } finally {
    clearCache(mediaCache);
  }
}

export async function renderComposition(
  composition: Composition,
  outputPath: string,
  onProgress?: (current: number, total: number) => void,
  format: ExportFormat = 'mp4',
  quality: QualityPreset = 'medium',
  projectDir?: string | null,
): Promise<void> {
  // PNG sequence uses a completely different path (no FFmpeg)
  if (format === 'png-sequence') {
    return renderPngSequence(composition, outputPath, onProgress, projectDir);
  }

  const { width, height, fps } = composition.output;
  const totalFrames = getTotalFrames(composition);

  // Preload all image assets
  const mediaCache = createMediaCache();
  await preloadComposition(mediaCache, composition.scenes, projectDir);

  // Create an offscreen canvas at the output resolution
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D context');

  // Start the FFmpeg process on the Rust side
  await startRender({
    outputPath,
    width,
    height,
    fps,
    totalFrames,
    format,
    quality,
  });

  try {
    for (let frame = 0; frame < totalFrames; frame++) {
      // Draw the frame
      drawCompositionFrame(ctx, composition, frame, mediaCache);

      // Extract raw RGBA pixels
      const imageData = ctx.getImageData(0, 0, width, height);
      const pixels = new Uint8Array(imageData.data.buffer);

      // Send to Rust → FFmpeg stdin
      await writeFrame(pixels);

      onProgress?.(frame + 1, totalFrames);

      // Yield every 5 frames to keep UI responsive
      if (frame % 5 === 0) {
        await yieldToEventLoop();
      }
    }

    // Signal FFmpeg to finalize the output
    await finishRender();
  } catch (err) {
    // Attempt cleanup on error
    try {
      const { cancelRender } = await import('../lib/tauri-bridge');
      await cancelRender();
    } catch {
      // ignore cleanup errors
    }
    throw err;
  } finally {
    clearCache(mediaCache);
  }
}
