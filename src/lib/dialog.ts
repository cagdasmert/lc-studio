import { save, open } from '@tauri-apps/plugin-dialog';
import type { ExportFormat } from '../types';

const FORMAT_FILTERS: Record<Exclude<ExportFormat, 'png-sequence'>, { name: string; extensions: string[]; defaultPath: string }> = {
  mp4: { name: 'MP4 Video', extensions: ['mp4'], defaultPath: 'output.mp4' },
  webm: { name: 'WebM Video', extensions: ['webm'], defaultPath: 'output.webm' },
  gif: { name: 'GIF Animation', extensions: ['gif'], defaultPath: 'output.gif' },
  mov: { name: 'MOV Video', extensions: ['mov'], defaultPath: 'output.mov' },
};

export async function pickOutputFile(format: ExportFormat = 'mp4'): Promise<string | null> {
  if (format === 'png-sequence') {
    const dir = await open({
      title: 'Choose folder for PNG sequence',
      directory: true,
    });
    // open() returns string | string[] | null for directory mode
    if (Array.isArray(dir)) return dir[0] ?? null;
    return dir;
  }

  const info = FORMAT_FILTERS[format];
  const path = await save({
    title: 'Save rendered video',
    defaultPath: info.defaultPath,
    filters: [{ name: info.name, extensions: info.extensions }],
  });
  return path;
}
