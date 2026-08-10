import type { AudioLayerData, Scene } from '../types';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private activeSources = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  async loadAudio(src: string): Promise<void> {
    if (this.buffers.has(src)) return;

    const response = await fetch(src);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.getContext().decodeAudioData(arrayBuffer);
    this.buffers.set(src, audioBuffer);
  }

  async preloadSceneAudio(scene: Scene): Promise<void> {
    const audioLayers = scene.layers.filter(
      (l): l is AudioLayerData => l.type === 'audio' && l.visible,
    );
    await Promise.all(audioLayers.map((l) => this.loadAudio(l.src)));
  }

  /**
   * Start/restart audio playback synced to a global frame position.
   * Call this when playback starts or when seeking.
   */
  seekTo(
    globalFrame: number,
    fps: number,
    scenes: Scene[],
  ): void {
    this.stopAll();

    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const globalTimeSecs = globalFrame / fps;

    // Walk through scenes to find which audio layers are active
    let sceneStartTime = 0;
    for (const scene of scenes) {
      const sceneDurationSecs = scene.durationFrames / fps;
      const sceneEndTime = sceneStartTime + sceneDurationSecs;

      const audioLayers = scene.layers.filter(
        (l): l is AudioLayerData => l.type === 'audio' && l.visible,
      );

      for (const layer of audioLayers) {
        const layerStartTime = sceneStartTime + layer.startFrame / fps;
        const layerEndTime = sceneStartTime + layer.endFrame / fps;

        // Is this layer active at the current time?
        if (globalTimeSecs >= layerStartTime && globalTimeSecs < layerEndTime) {
          const buffer = this.buffers.get(layer.src);
          if (!buffer) continue;

          const source = ctx.createBufferSource();
          source.buffer = buffer;

          const gain = ctx.createGain();
          gain.gain.value = layer.volume;

          // Apply fade in/out
          const layerDurationSecs = (layer.endFrame - layer.startFrame) / fps;
          const fadeInSecs = layer.fadeInFrames / fps;
          const fadeOutSecs = layer.fadeOutFrames / fps;

          if (fadeInSecs > 0) {
            const elapsed = globalTimeSecs - layerStartTime;
            if (elapsed < fadeInSecs) {
              gain.gain.setValueAtTime(0, ctx.currentTime);
              gain.gain.linearRampToValueAtTime(
                layer.volume,
                ctx.currentTime + (fadeInSecs - elapsed),
              );
            }
          }

          if (fadeOutSecs > 0) {
            const timeUntilEnd = layerEndTime - globalTimeSecs;
            if (timeUntilEnd > 0) {
              const fadeOutStart = Math.max(0, timeUntilEnd - fadeOutSecs);
              gain.gain.setValueAtTime(layer.volume, ctx.currentTime + fadeOutStart);
              gain.gain.linearRampToValueAtTime(0, ctx.currentTime + timeUntilEnd);
            }
          }

          source.connect(gain);
          gain.connect(ctx.destination);

          // Calculate offset into the audio file
          const offsetInLayer = globalTimeSecs - layerStartTime;
          const audioOffset = layer.startTime + offsetInLayer;
          const remaining = layerDurationSecs - offsetInLayer;

          source.start(0, audioOffset, remaining);

          this.activeSources.set(layer.id, { source, gain });
        }
      }

      sceneStartTime = sceneEndTime;
    }
  }

  pause(): void {
    this.ctx?.suspend();
  }

  resume(): void {
    this.ctx?.resume();
  }

  stopAll(): void {
    for (const { source } of this.activeSources.values()) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // May already be stopped
      }
    }
    this.activeSources.clear();
  }

  dispose(): void {
    this.stopAll();
    this.buffers.clear();
    this.ctx?.close();
    this.ctx = null;
  }
}
