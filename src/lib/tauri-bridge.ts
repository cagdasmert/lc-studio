import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { RenderProgress } from '../types';

export async function checkFfmpeg(): Promise<string> {
  return invoke<string>('check_ffmpeg');
}

export async function startRender(params: {
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
}): Promise<void> {
  return invoke('start_render', {
    output_path: params.outputPath,
    width: params.width,
    height: params.height,
    fps: params.fps,
    total_frames: params.totalFrames,
  });
}

export async function writeFrame(rgbaPixels: Uint8Array): Promise<void> {
  return invoke('write_frame', rgbaPixels);
}

export async function finishRender(): Promise<void> {
  return invoke('finish_render');
}

export async function cancelRender(): Promise<void> {
  return invoke('cancel_render');
}

export function onRenderProgress(
  callback: (progress: RenderProgress) => void,
): Promise<UnlistenFn> {
  return listen<RenderProgress>('render:progress', (event) => {
    callback(event.payload);
  });
}
