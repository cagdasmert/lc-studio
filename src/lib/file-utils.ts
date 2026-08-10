import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv'];

export async function pickImageFile(): Promise<string | null> {
  const path = await open({
    title: 'Select image',
    multiple: false,
    filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
  });
  return path ?? null;
}

export async function pickAudioFile(): Promise<string | null> {
  const path = await open({
    title: 'Select audio',
    multiple: false,
    filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
  });
  return path ?? null;
}

export async function pickVideoFile(): Promise<string | null> {
  const path = await open({
    title: 'Select video',
    multiple: false,
    filters: [{ name: 'Video', extensions: VIDEO_EXTENSIONS }],
  });
  return path ?? null;
}

/**
 * Read a local file and return a blob URL that the WebView can load.
 * Used for images and audio assets.
 */
export async function fileToBlobUrl(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const mime = getMimeType(ext);
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    aac: 'audio/aac',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
  };
  return map[ext] || 'application/octet-stream';
}
