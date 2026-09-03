import { describe, expect, it, vi, beforeEach } from 'vitest';

const invoke = vi.fn((_command: string, _args?: Record<string, unknown>) =>
  Promise.resolve(),
);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invoke(command, args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Imported after the mocks are registered.
const { startRender } = await import('./tauri-bridge');

describe('startRender', () => {
  beforeEach(() => {
    invoke.mockClear();
  });

  it('passes command arguments as camelCase keys so Tauri can map them to the snake_case Rust params', async () => {
    await startRender({
      outputPath: '/tmp/out.mp4',
      width: 1920,
      height: 1080,
      fps: 30,
      totalFrames: 90,
      audioTracks: [
        { path: '/tmp/a.mp3', startTimeSecs: 0, durationSecs: 3, volume: 1 },
      ],
      format: 'mp4',
      quality: 'medium',
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    const [command, args] = invoke.mock.calls[0];
    expect(command).toBe('start_render');
    if (!args) throw new Error('expected args object');

    // Tauri v2 converts camelCase invoke args to snake_case command params.
    // Sending snake_case keys makes Tauri report the camelCase key as missing.
    expect(args).toHaveProperty('outputPath', '/tmp/out.mp4');
    expect(args).toHaveProperty('totalFrames', 90);
    expect(args).toHaveProperty('audioTracks');
    expect(args).not.toHaveProperty('output_path');
    expect(args).not.toHaveProperty('total_frames');

    // Nested struct fields are deserialized by serde, which keeps them snake_case.
    expect(args.audioTracks).toEqual([
      { path: '/tmp/a.mp3', start_time_secs: 0, duration_secs: 3, volume: 1 },
    ]);
  });
});
