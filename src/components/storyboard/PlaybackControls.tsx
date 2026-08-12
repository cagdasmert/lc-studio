import { useStore } from '../../store';
import { getTotalFrames } from '../../renderer/compositor';
import type { PlaybackSpeed } from '../../store/playback-slice';

const SPEEDS: PlaybackSpeed[] = [0.25, 0.5, 1, 2];

export function PlaybackControls() {
  const composition = useStore((s) => s.composition);
  const currentFrame = useStore((s) => s.currentFrame);
  const playing = useStore((s) => s.playing);
  const loop = useStore((s) => s.loop);
  const speed = useStore((s) => s.speed);
  const setCurrentFrame = useStore((s) => s.setCurrentFrame);
  const togglePlay = useStore((s) => s.togglePlay);
  const setLoop = useStore((s) => s.setLoop);
  const setSpeed = useStore((s) => s.setSpeed);
  const stepForward = useStore((s) => s.stepForward);
  const stepBackward = useStore((s) => s.stepBackward);

  const totalFrames = Math.max(1, getTotalFrames(composition));
  const fps = composition.output.fps || 30;
  const timeSecs = (currentFrame / fps).toFixed(1);
  const totalSecs = (totalFrames / fps).toFixed(1);

  return (
    <div className="playback-controls">
      <button onClick={() => setCurrentFrame(0)} title="Jump to start">|&lt;</button>
      <button onClick={stepBackward} title="Step back">&lt;</button>
      <button onClick={togglePlay} className="play-btn">
        {playing ? '||' : '\u25B6'}
      </button>
      <button onClick={stepForward} title="Step forward">&gt;</button>
      <button onClick={() => setCurrentFrame(totalFrames - 1)} title="Jump to end">&gt;|</button>

      <input
        type="range"
        className="scrubber"
        min={0}
        max={Math.max(0, totalFrames - 1)}
        value={currentFrame}
        onChange={(e) => setCurrentFrame(Number(e.target.value))}
      />

      <span className="frame-display">
        {currentFrame} / {totalFrames}
      </span>
      <span className="time-display">
        {timeSecs}s / {totalSecs}s
      </span>

      <select
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value) as PlaybackSpeed)}
        className="speed-select"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>{s}x</option>
        ))}
      </select>

      <button
        onClick={() => setLoop(!loop)}
        className={`loop-btn ${loop ? 'active' : ''}`}
        title="Toggle loop"
      >
        Loop
      </button>
    </div>
  );
}
