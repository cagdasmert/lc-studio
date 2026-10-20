/*
 * Decoded-frame cache for video layers.
 *
 * Adapted from OpenCut Classic — apps/web/src/services/video-cache/service.ts
 * at commit cf5e79e9 (https://github.com/opencut-app/opencut-classic).
 * Copyright 2025-2026 OpenCut. MIT licence; the full notice is in
 * THIRD_PARTY_NOTICES.md.
 *
 * Kept from OpenCut: reuse the current frame when it covers the time; decode
 * forward for jumps under two seconds, otherwise seek; prefetch one frame
 * ahead; one promise chain per key so requests never race; a generation
 * counter so scrubbing drops stale requests.
 *
 * Changed for lc-studio: state is keyed by layer id rather than by file, so
 * two layers playing one file at different offsets don't fight over a decoder
 * (the bytes are shared through the loader); lookups have no tolerance, so
 * export gets the exact frame; times are clamped to the track, so a clip
 * shorter than its layer holds its last frame; a superseded request resolves
 * to nothing rather than the current frame; files that can't be opened are
 * remembered instead of retried; the decoder is injectable for tests; and
 * dispose() leaves the cache usable.
 */
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import type { Composition } from '../types';
import type { PreparedVideoFrames, VideoFrameImage } from './draw-video';
import { collectVideoDraws, type VideoDraw } from './video-time';

/** A decoded frame and the source span it covers, in seconds. */
export interface DecodedFrame {
  canvas: VideoFrameImage;
  timestamp: number;
  duration: number;
}

/** What the cache needs from a decoder: mediabunny's CanvasSink, narrowed. */
export interface FrameSink {
  /** Frames in presentation order, starting with the one shown at `start`. */
  frames(start: number): AsyncGenerator<DecodedFrame, void, unknown>;
  /** The first frame's timestamp and the end of the last frame. */
  readonly startTime: number;
  readonly endTime: number;
  dispose(): void;
}

/** Opens a file for decoding, or throws with the reason it can't be. */
export type OpenFrameSink = (blob: Blob) => Promise<FrameSink>;

/** Forward jumps shorter than this decode on from the current position; longer ones seek. */
const FORWARD_DECODE_SECS = 2;
/** Times past the track's end are pulled back this far, onto its last frame. */
const TRACK_END_EPSILON = 1e-3;

/** Open a file's primary video track with mediabunny (WebCodecs). */
export const openMediabunnySink: OpenFrameSink = async (blob) => {
  if (typeof VideoDecoder === 'undefined') {
    throw new Error('this webview has no WebCodecs VideoDecoder');
  }
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('the file has no video track');
    if (!(await track.canDecode())) {
      throw new Error(`its ${track.codec ?? 'unknown'} video can't be decoded by this webview`);
    }
    const sink = new CanvasSink(track, { poolSize: 3 });
    const startTime = await track.getFirstTimestamp();
    const endTime = await track.computeDuration();
    return {
      startTime,
      endTime,
      frames: (start) => sink.canvases(start),
      dispose: () => input.dispose(),
    };
  } catch (error) {
    input.dispose();
    throw error;
  }
};

interface LayerDecoder {
  src: string;
  sink: FrameSink;
  iterator: AsyncGenerator<DecodedFrame, void, unknown> | null;
  currentFrame: DecodedFrame | null;
  nextFrame: DecodedFrame | null;
  lastTime: number;
  prefetching: boolean;
  prefetchPromise: Promise<void> | null;
}

function isFrameValid(frame: DecodedFrame, time: number): boolean {
  return time >= frame.timestamp && time < frame.timestamp + frame.duration;
}

export class VideoFrameCache implements PreparedVideoFrames {
  private decoders = new Map<string, LayerDecoder>();
  private opening = new Map<string, Promise<LayerDecoder | null>>();
  private frameChain = new Map<string, Promise<unknown>>();
  private generations = new Map<string, number>();
  private prepared = new Map<string, DecodedFrame>();
  private failed = new Map<string, string>();
  /** Bumped by dispose(), so decoders that finish opening afterwards are closed, not kept. */
  private epoch = 0;

  constructor(
    private readonly loadBlob: (src: string) => Promise<Blob>,
    private readonly openSink: OpenFrameSink = openMediabunnySink,
  ) {}

  get(layerId: string): VideoFrameImage | undefined {
    return this.prepared.get(layerId)?.canvas;
  }

  /** Files that couldn't be opened, with the reason. */
  failures(): ReadonlyMap<string, string> {
    return this.failed;
  }

  /**
   * Decode the frame each draw needs and keep it for get(). Resolves true when
   * any layer's prepared frame changed; preview redraws on that.
   */
  async prepare(draws: VideoDraw[]): Promise<boolean> {
    const changed = await Promise.all(draws.map(async ({ layerId, src, sourceTime }) => {
      const frame = await this.getFrameAt(layerId, src, sourceTime);
      if (frame === undefined) return false; // superseded by a newer request
      if (frame === null) return this.prepared.delete(layerId);
      const before = this.prepared.get(layerId);
      this.prepared.set(layerId, frame);
      return before?.canvas !== frame.canvas || before.timestamp !== frame.timestamp;
    }));
    return changed.includes(true);
  }

  /** Close the decoders of layers not in `layerIds`. */
  retain(layerIds: ReadonlySet<string>): void {
    for (const id of [...this.decoders.keys()]) if (!layerIds.has(id)) this.clearLayer(id);
    for (const id of [...this.prepared.keys()]) if (!layerIds.has(id)) this.prepared.delete(id);
  }

  /** Close every decoder and forget everything. The cache can be used again afterwards. */
  dispose(): void {
    this.epoch++;
    for (const id of [...this.decoders.keys()]) this.clearLayer(id);
    this.opening.clear();
    this.prepared.clear();
    this.failed.clear();
  }

  /** The frame for `time`; null when there is none, undefined when a newer request superseded this one. */
  private async getFrameAt(layerId: string, src: string, time: number): Promise<DecodedFrame | null | undefined> {
    const decoder = await this.decoderFor(layerId, src);
    if (!decoder) return null;
    const t = Math.min(Math.max(time, decoder.sink.startTime), decoder.sink.endTime - TRACK_END_EPSILON);

    const generation = (this.generations.get(layerId) ?? 0) + 1;
    this.generations.set(layerId, generation);

    const previous = this.frameChain.get(layerId) ?? Promise.resolve();
    const current = previous.then(() => {
      if (this.generations.get(layerId) !== generation) return undefined;
      return this.resolveFrame(decoder, t);
    });
    this.frameChain.set(layerId, current.catch(() => {}));
    return current;
  }

  private async decoderFor(layerId: string, src: string): Promise<LayerDecoder | null> {
    const existing = this.decoders.get(layerId);
    if (existing?.src === src) return existing;
    if (existing) this.clearLayer(layerId); // the layer now plays another file
    if (this.failed.has(src)) return null;

    const key = `${layerId}\u0000${src}`;
    let opening = this.opening.get(key);
    if (!opening) {
      const epoch = this.epoch;
      opening = (async () => {
        const decoder = await this.openDecoder(src);
        this.opening.delete(key);
        if (!decoder) return null;
        const current = this.decoders.get(layerId);
        if (epoch !== this.epoch || current) {
          decoder.sink.dispose();
          return epoch === this.epoch && current?.src === src ? current : null;
        }
        this.decoders.set(layerId, decoder);
        return decoder;
      })();
      this.opening.set(key, opening);
    }
    return opening;
  }

  private async openDecoder(src: string): Promise<LayerDecoder | null> {
    try {
      const sink = await this.openSink(await this.loadBlob(src));
      return {
        src, sink, iterator: null, currentFrame: null, nextFrame: null,
        lastTime: -1, prefetching: false, prefetchPromise: null,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!this.failed.has(src)) console.warn(`Video ${src} can't be drawn: ${reason}`);
      this.failed.set(src, reason);
      return null;
    }
  }

  private async resolveFrame(d: LayerDecoder, time: number): Promise<DecodedFrame | null> {
    if (d.nextFrame && d.nextFrame.timestamp <= time) {
      d.currentFrame = d.nextFrame;
      d.nextFrame = null;
      this.startPrefetch(d);
    }

    if (d.currentFrame && isFrameValid(d.currentFrame, time)) {
      this.startPrefetch(d);
      return d.currentFrame;
    }

    if (d.iterator && d.currentFrame && time >= d.lastTime && time < d.lastTime + FORWARD_DECODE_SECS) {
      const frame = await this.iterateToTime(d, time);
      if (frame) {
        this.startPrefetch(d);
        return frame;
      }
    }

    return this.seekToTime(d, time);
  }

  private async iterateToTime(d: LayerDecoder, time: number): Promise<DecodedFrame | null> {
    try {
      while (true) {
        // Let a running prefetch finish before touching the iterator.
        if (d.prefetching && d.prefetchPromise) await d.prefetchPromise;
        if (!d.iterator) return null;

        if (d.nextFrame) {
          // OpenCut took a frame up to 50 ms early here; export needs the exact one.
          if (d.nextFrame.timestamp > time) return null;
          d.currentFrame = d.nextFrame;
          d.nextFrame = null;
        } else {
          const { value, done } = await d.iterator.next();
          if (done || !value) return null;
          d.currentFrame = value;
        }

        const frame = d.currentFrame;
        d.lastTime = frame.timestamp;
        if (isFrameValid(frame, time)) return frame;
        if (frame.timestamp > time) return null; // decoded past it: seek instead
      }
    } catch (error) {
      console.warn('Video decode failed; seeking instead:', error);
      d.iterator = null;
      return null;
    }
  }

  private async seekToTime(d: LayerDecoder, time: number): Promise<DecodedFrame | null> {
    try {
      if (d.prefetching && d.prefetchPromise) await d.prefetchPromise;
      if (d.iterator) {
        await d.iterator.return();
        d.iterator = null;
      }
      d.nextFrame = null;
      d.iterator = d.sink.frames(time);
      d.lastTime = time;

      const { value } = await d.iterator.next();
      if (value) {
        d.currentFrame = value;
        this.startPrefetch(d);
        return value;
      }
    } catch (error) {
      console.warn('Video seek failed:', error);
      d.iterator = null;
    }
    return null;
  }

  private startPrefetch(d: LayerDecoder): void {
    if (d.prefetching || !d.iterator || d.nextFrame) return;
    d.prefetching = true;
    d.prefetchPromise = this.prefetchNextFrame(d);
  }

  private async prefetchNextFrame(d: LayerDecoder): Promise<void> {
    try {
      const { value, done } = await d.iterator!.next();
      if (!done && value) d.nextFrame = value;
    } catch (error) {
      console.warn('Video prefetch failed:', error);
      d.iterator = null;
    } finally {
      d.prefetching = false;
      d.prefetchPromise = null;
    }
  }

  private clearLayer(layerId: string): void {
    const decoder = this.decoders.get(layerId);
    if (decoder) {
      decoder.iterator?.return().catch(() => {});
      decoder.sink.dispose();
      this.decoders.delete(layerId);
    }
    this.frameChain.delete(layerId);
    this.generations.delete(layerId); // pending requests now see themselves superseded
  }
}

/** Decode every video frame drawCompositionFrame draws at `globalFrame`. */
export function prepareVideoFrames(
  composition: Composition,
  globalFrame: number,
  frames: VideoFrameCache,
): Promise<boolean> {
  return frames.prepare(collectVideoDraws(composition, globalFrame));
}
