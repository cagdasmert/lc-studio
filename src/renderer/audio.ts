import type { Composition } from '../types';
import { collectAudibleLayers, type AudioTiming } from '../lib/audio-tracks';

/** One scheduled sound. */
export interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Preview playback of audio layers and unmuted video layers' sound. Timing
 * comes from collectAudibleLayers, the helper the export uses, so preview
 * places, trims and fades every sound where the render does. One difference:
 * Web Audio's playbackRate shifts pitch, where FFmpeg's atempo keeps it.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private decoded = new Map<string, AudioBuffer>();
  private voices: Voice[] = [];

  constructor(
    private readonly loadBlob: (src: string) => Promise<Blob>,
    private readonly createContext: () => AudioContext = () => new AudioContext(),
  ) {}

  private context(): AudioContext {
    if (!this.ctx) this.ctx = this.createContext();
    return this.ctx;
  }

  /** Decode every audible file in every scene. Files without playable audio are skipped. */
  async preload(composition: Composition): Promise<void> {
    await Promise.all(collectAudibleLayers(composition).map(({ layer }) => this.load(layer.src)));
  }

  private load(src: string): Promise<AudioBuffer | null> {
    let buffer = this.buffers.get(src);
    if (!buffer) {
      buffer = this.loadBlob(src)
        .then((blob) => blob.arrayBuffer())
        .then((bytes) => this.context().decodeAudioData(bytes))
        .then((decoded) => {
          this.decoded.set(src, decoded);
          return decoded;
        })
        .catch((err) => {
          console.warn(`No playable audio in ${src}:`, err);
          return null;
        });
      this.buffers.set(src, buffer);
    }
    return buffer;
  }

  /** Resume audio from inside a user gesture; WebKit keeps it suspended until one. */
  unlock(): void {
    const ctx = this.context();
    if (ctx.state === 'suspended') void ctx.resume();
  }

  /** Play from `globalFrame`, replacing whatever was playing. `speed` is the preview speed. */
  seekTo(globalFrame: number, composition: Composition, speed = 1): void {
    this.stopAll();
    const ctx = this.context();
    if (ctx.state === 'suspended') void ctx.resume();
    this.voices = this.schedule(ctx, composition, globalFrame / composition.output.fps, ctx.currentTime, speed);
  }

  /**
   * Schedule every decoded sound still to come at timeline second `fromSecs`
   * onto `ctx`, with that second landing on context time `at`. Timeline time
   * passes `speed` times faster than real time. Public so a test run can
   * render the timeline into an OfflineAudioContext.
   */
  schedule(ctx: BaseAudioContext, composition: Composition, fromSecs: number, at: number, speed = 1): Voice[] {
    const voices: Voice[] = [];
    for (const { layer, timing } of collectAudibleLayers(composition)) {
      const buffer = this.decoded.get(layer.src);
      if (!buffer) continue;
      if (timing.timelineOffsetSecs + timing.durationSecs <= fromSecs) continue;

      // Seconds of this sound's output already behind the playhead.
      const skipped = Math.max(0, fromSecs - timing.timelineOffsetSecs);
      const when = at + Math.max(0, timing.timelineOffsetSecs - fromSecs) / speed;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = timing.playbackRate * speed;
      const gain = ctx.createGain();
      applyEnvelope(gain.gain, timing, skipped, when, speed);
      source.connect(gain).connect(ctx.destination);
      // offset and duration count buffer seconds, which pass playbackRate times per output second.
      source.start(
        when,
        timing.sourceStartSecs + skipped * timing.playbackRate,
        (timing.durationSecs - skipped) * timing.playbackRate,
      );
      voices.push({ source, gain });
    }
    return voices;
  }

  stopAll(): void {
    for (const { source } of this.voices) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      source.disconnect();
    }
    this.voices = [];
  }

  dispose(): void {
    this.stopAll();
    this.buffers.clear();
    this.decoded.clear();
    void this.ctx?.close();
    this.ctx = null;
  }
}

/**
 * Volume with linear fades, as FFmpeg's afade draws them. Output second s of
 * the sound plays at context time when + (s − skipped) / speed.
 */
function applyEnvelope(param: AudioParam, t: AudioTiming, skipped: number, when: number, speed: number): void {
  const time = (s: number) => when + (s - skipped) / speed;
  const level = (s: number) => t.volume * Math.max(0, Math.min(
    1,
    t.fadeInSecs > 0 ? s / t.fadeInSecs : 1,
    t.fadeOutSecs > 0 ? (t.durationSecs - s) / t.fadeOutSecs : 1,
  ));

  param.setValueAtTime(level(skipped), when);
  if (t.fadeInSecs > skipped) param.linearRampToValueAtTime(level(t.fadeInSecs), time(t.fadeInSecs));
  if (t.fadeOutSecs > 0) {
    const fadeOutStart = t.durationSecs - t.fadeOutSecs;
    if (fadeOutStart > skipped) param.setValueAtTime(level(fadeOutStart), time(fadeOutStart));
    param.linearRampToValueAtTime(0, time(t.durationSecs));
  }
}
