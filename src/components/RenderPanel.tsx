import { useState, useEffect } from 'react';
import type { Composition, RenderStatus } from '../types';
import { checkFfmpeg, onRenderProgress, cancelRender } from '../lib/tauri-bridge';
import { pickOutputFile } from '../lib/dialog';
import { renderComposition } from '../renderer/capture';

interface RenderPanelProps {
  composition: Composition;
}

export function RenderPanel({ composition }: RenderPanelProps) {
  const [ffmpegVersion, setFfmpegVersion] = useState<string | null>(null);
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);
  const [status, setStatus] = useState<RenderStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkFfmpeg()
      .then(setFfmpegVersion)
      .catch((e) => setFfmpegError(String(e)));
  }, []);

  useEffect(() => {
    const unlisten = onRenderProgress((p) => {
      setProgress(p.percent);
      setCurrentFrame(p.current_frame);
      setTotalFrames(p.total_frames);
      if (p.status === 'completed' || p.status === 'failed' || p.status === 'cancelled') {
        setStatus(p.status as RenderStatus);
        if (p.error) setError(p.error);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  async function handleRender() {
    setError(null);
    const outputPath = await pickOutputFile();
    if (!outputPath) return;

    setStatus('rendering');
    setProgress(0);

    try {
      await renderComposition(composition, outputPath, (current, total) => {
        setCurrentFrame(current);
        setTotalFrames(total);
        setProgress((current / total) * 100);
      });
      setStatus('completed');
    } catch (err) {
      setStatus('failed');
      setError(String(err));
    }
  }

  async function handleCancel() {
    try {
      await cancelRender();
    } catch {
      // ignore
    }
  }

  const canRender = ffmpegVersion && status !== 'rendering';

  return (
    <div className="render-panel">
      <div className="ffmpeg-status">
        {ffmpegVersion && <span className="ffmpeg-ok">FFmpeg: {ffmpegVersion}</span>}
        {ffmpegError && <span className="ffmpeg-err">FFmpeg: {ffmpegError}</span>}
        {!ffmpegVersion && !ffmpegError && <span>Checking FFmpeg...</span>}
      </div>

      <div className="render-actions">
        <button disabled={!canRender} onClick={handleRender}>
          Render MP4
        </button>
        {status === 'rendering' && (
          <button onClick={handleCancel} className="cancel-btn">
            Cancel
          </button>
        )}
      </div>

      {status === 'rendering' && (
        <div className="progress-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span>
            Frame {currentFrame} / {totalFrames} ({progress.toFixed(1)}%)
          </span>
        </div>
      )}

      {status === 'completed' && <div className="render-success">Render complete!</div>}
      {status === 'failed' && <div className="render-error">Render failed: {error}</div>}
      {status === 'cancelled' && <div className="render-cancelled">Render cancelled</div>}
    </div>
  );
}
