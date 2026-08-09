import { save } from '@tauri-apps/plugin-dialog';

export async function pickOutputFile(): Promise<string | null> {
  const path = await save({
    title: 'Save rendered video',
    defaultPath: 'output.mp4',
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });
  return path;
}
