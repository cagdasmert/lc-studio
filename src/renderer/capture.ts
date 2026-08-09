import type { Composition } from '../types';
import { getTotalFrames, drawCompositionFrame } from './compositor';
import { startRender, writeFrame, finishRender } from '../lib/tauri-bridge';

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function renderComposition(
  composition: Composition,
  outputPath: string,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const { width, height, fps } = composition.output;
  const totalFrames = getTotalFrames(composition);

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
  });

  try {
    for (let frame = 0; frame < totalFrames; frame++) {
      // Draw the frame
      drawCompositionFrame(ctx, composition, frame);

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
  }
}
