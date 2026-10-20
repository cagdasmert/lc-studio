import type { Composition, Layer, VideoLayerData } from '../types';
import { openMediabunnySink } from '../renderer/video-frames';
import { loadMediaBlob } from './media-bytes';

/** Remembered per project folder and file: decodability doesn't change while the app runs. */
const decodable = new Map<string, Promise<boolean>>();

/** Whether this webview can decode a video file's frames. */
export function isVideoDecodable(src: string, projectDir: string | null): Promise<boolean> {
  const key = `${projectDir ?? ''}\u0000${src}`;
  let result = decodable.get(key);
  if (!result) {
    result = loadMediaBlob(src, projectDir)
      .then(openMediabunnySink)
      .then((sink) => { sink.dispose(); return true; }, () => false);
    decodable.set(key, result);
  }
  return result;
}

function visibleVideoLayers(composition: Composition): VideoLayerData[] {
  return composition.scenes
    .flatMap((s) => s.layers)
    .filter((l: Layer): l is VideoLayerData => l.type === 'video' && l.visible);
}

/** How many visible video layers will render as nothing because their file can't be decoded. */
export async function countUndecodableVideoLayers(composition: Composition, projectDir: string | null): Promise<number> {
  const ok = await Promise.all(visibleVideoLayers(composition).map((l) => isVideoDecodable(l.src, projectDir)));
  return ok.filter((d) => !d).length;
}

export function undecodableWarning(count: number): string | null {
  if (count === 0) return null;
  return count === 1
    ? "1 video layer can't be decoded; convert it to H.264 MP4"
    : `${count} video layers can't be decoded; convert them to H.264 MP4`;
}

/** Changes only when the visible video layers or their files do, so the probe isn't re-run on every edit. */
export function videoSourcesKey(composition: Composition): string {
  return visibleVideoLayers(composition).map((l) => `${l.id}:${l.src}`).join('\n');
}
