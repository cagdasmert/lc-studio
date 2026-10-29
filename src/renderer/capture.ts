import type { Composition, ExportFormat, QualityPreset } from '../types';
import { getTotalFrames, drawCompositionFrame } from './compositor';
import { createMediaCache, preloadComposition, clearCache } from './media-cache';
import { startRender, writeFrame, finishRender } from '../lib/tauri-bridge';
import { buildAudioTracks } from '../lib/audio-tracks';
import { MediaBlobCache } from '../lib/media-bytes';
import { VideoFrameCache, prepareVideoFrames } from './video-frames';
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

/** A PNG sequence's file name for a frame, e.g. `frame-0012.png`. */
export function framePngName(frame: number, totalFrames: number): string {
  return `frame-${padFrame(frame, totalFrames)}.png`;
}

/** A canvas as PNG bytes: the one encoder for PNG sequences and command-line stills. */
export async function encodePng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await canvasToBlob(canvas, 'image/png');
  return new Uint8Array(await blob.arrayBuffer());
}

/** What one export needs to draw frames, and to let go of afterwards. */
export async function createFrameRenderer(composition: Composition, projectDir: string | null) {
  const { width, height } = composition.output;

  const mediaCache = createMediaCache();
  await preloadComposition(mediaCache, composition.scenes, projectDir);
  const blobs = new MediaBlobCache(projectDir);
  const videoFrames = new VideoFrameCache((src) => blobs.get(src));

  // An offscreen canvas at the output resolution
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D context');

  return {
    canvas,
    ctx,
    /** Draw a frame, decoding its video frames first: export never draws a video layer without its exact frame. */
    async draw(frame: number): Promise<void> {
      await prepareVideoFrames(composition, frame, videoFrames);
      drawCompositionFrame(ctx, composition, frame, mediaCache, videoFrames);
    },
    dispose(): void {
      videoFrames.dispose();
      blobs.clear();
      clearCache(mediaCache);
    },
  };
}

async function renderPngSequence(
  composition: Composition,
  outputDir: string,
  onProgress?: (current: number, total: number) => void,
  projectDir?: string | null,
): Promise<void> {
  const totalFrames = getTotalFrames(composition);
  const renderer = await createFrameRenderer(composition, projectDir ?? null);

  // Ensure output directory exists
  try {
    await mkdir(outputDir, { recursive: true });
  } catch {
    // directory may already exist
  }

  try {
    for (let frame = 0; frame < totalFrames; frame++) {
      await renderer.draw(frame);

      await writeFile(`${outputDir}/${framePngName(frame, totalFrames)}`, await encodePng(renderer.canvas));

      onProgress?.(frame + 1, totalFrames);

      if (frame % 5 === 0) {
        await yieldToEventLoop();
      }
    }
  } finally {
    renderer.dispose();
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

  // Preload images and set up video decoding
  const renderer = await createFrameRenderer(composition, projectDir ?? null);

  try {
    // GIF never carries sound, so skip reading the files.
    const audioTracks = format === 'gif' ? [] : await buildAudioTracks(composition, projectDir ?? null);

    // Start the FFmpeg process on the Rust side
    await startRender({
      outputPath,
      width,
      height,
      fps,
      totalFrames,
      audioTracks,
      format,
      quality,
    });

    await pipeFrames(renderer, width, height, totalFrames, onProgress);
  } finally {
    renderer.dispose();
  }
}

/** Draw every frame and send it to FFmpeg; cancel the render if anything fails. */
async function pipeFrames(
  renderer: Awaited<ReturnType<typeof createFrameRenderer>>,
  width: number,
  height: number,
  totalFrames: number,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  try {
    for (let frame = 0; frame < totalFrames; frame++) {
      // Draw the frame
      await renderer.draw(frame);

      // Extract raw RGBA pixels
      const imageData = renderer.ctx.getImageData(0, 0, width, height);
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
  }
}
