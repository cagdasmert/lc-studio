import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import type { AudioLayerData, AudioTrackSpec, Composition, VideoLayerData } from '../types';
import { resolveAssetPath } from './asset-manager';
import { loadMediaBlob } from './media-bytes';

/** Where and how one layer's sound plays. Shared by export and preview, so they agree. */
export interface AudioTiming {
  timelineOffsetSecs: number; // where it starts in the output
  sourceStartSecs: number;    // where it starts reading in the source
  durationSecs: number;       // how long it lasts in the output
  volume: number;
  fadeInSecs: number;
  fadeOutSecs: number;
  playbackRate: number;
}

export interface AudibleLayer {
  layer: AudioLayerData | VideoLayerData;
  timing: AudioTiming;
}

/**
 * Timing for one layer of a scene that starts at `sceneStartFrame`. A layer
 * plays for its frame range, cut at the scene's end as its visuals are, and
 * no further than `endTime` when that is after `startTime`. Audio layers
 * carry volume and fades; video layers carry speed.
 */
export function audioTiming(
  layer: AudioLayerData | VideoLayerData,
  sceneStartFrame: number,
  sceneDurationFrames: number,
  fps: number,
): AudioTiming {
  const isAudio = layer.type === 'audio';
  const rate = !isAudio && layer.playbackRate > 0 ? layer.playbackRate : 1;
  const endFrame = Math.min(layer.endFrame, sceneDurationFrames);
  let durationSecs = (endFrame - layer.startFrame) / fps;
  if (layer.endTime > layer.startTime) {
    durationSecs = Math.min(durationSecs, (layer.endTime - layer.startTime) / rate);
  }
  return {
    timelineOffsetSecs: (sceneStartFrame + layer.startFrame) / fps,
    sourceStartSecs: layer.startTime,
    durationSecs: Math.max(0, durationSecs),
    volume: isAudio ? layer.volume : 1,
    fadeInSecs: isAudio ? layer.fadeInFrames / fps : 0,
    fadeOutSecs: isAudio ? layer.fadeOutFrames / fps : 0,
    playbackRate: rate,
  };
}

/**
 * Every layer that should be heard, with its timing: visible audio layers
 * and visible unmuted video layers. Scenes play back to back (transitions
 * happen inside the outgoing scene), so each starts where the last ended.
 * Whether a video file actually has sound needs the file; see buildAudioTracks.
 */
export function collectAudibleLayers(composition: Composition): AudibleLayer[] {
  const { fps } = composition.output;
  const audible: AudibleLayer[] = [];
  let sceneStart = 0;
  for (const scene of composition.scenes) {
    for (const layer of scene.layers) {
      if (!layer.visible) continue;
      if (layer.type !== 'audio' && !(layer.type === 'video' && !layer.muted)) continue;
      const timing = audioTiming(layer, sceneStart, scene.durationFrames, fps);
      if (timing.durationSecs > 0) audible.push({ layer, timing });
    }
    sceneStart += scene.durationFrames;
  }
  return audible;
}

/** Whether a media file has an audio track, read from its container (no decoding). */
export async function hasAudioTrack(blob: Blob): Promise<boolean> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    return (await input.getPrimaryAudioTrack()) !== null;
  } finally {
    input.dispose();
  }
}

/**
 * The FFmpeg audio tracks for an export. Video layers whose file has no audio
 * stream are dropped silently, because FFmpeg fails on a missing stream.
 */
export async function buildAudioTracks(
  composition: Composition,
  projectDir: string | null,
  probe: (src: string) => Promise<boolean> = async (src) => hasAudioTrack(await loadMediaBlob(src, projectDir)),
): Promise<AudioTrackSpec[]> {
  const probed = new Map<string, Promise<boolean>>();
  const hasSound = (src: string) => {
    let result = probed.get(src);
    if (!result) {
      result = probe(src).catch((err) => {
        console.warn(`Could not read ${src}; leaving its sound out:`, err);
        return false;
      });
      probed.set(src, result);
    }
    return result;
  };

  const tracks: AudioTrackSpec[] = [];
  for (const { layer, timing } of collectAudibleLayers(composition)) {
    if (layer.type === 'video' && !(await hasSound(layer.src))) continue;
    tracks.push({
      path: await resolveAssetPath(layer.src, projectDir),
      startTimeSecs: timing.sourceStartSecs,
      durationSecs: timing.durationSecs,
      volume: timing.volume,
      timelineOffsetSecs: timing.timelineOffsetSecs,
      fadeInSecs: timing.fadeInSecs,
      fadeOutSecs: timing.fadeOutSecs,
      playbackRate: timing.playbackRate,
    });
  }
  return tracks;
}
