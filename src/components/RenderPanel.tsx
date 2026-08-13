import { useState, useEffect, useRef, useCallback } from 'react';
import type { RenderStatus, ExportFormat, QualityPreset } from '../types';
import { useStore } from '../store';
import type { RenderJob } from '../store/render-slice';
import { checkFfmpeg, cancelRender } from '../lib/tauri-bridge';
import { pickOutputFile } from '../lib/dialog';
import { renderComposition } from '../renderer/capture';

const FORMAT_LABELS: Record<ExportFormat, string> = {
  mp4: 'MP4 (H.264)',
  webm: 'WebM (VP9)',
  gif: 'GIF',
  'png-sequence': 'PNG Sequence',
  mov: 'MOV (ProRes)',
};

const QUALITY_LABELS: Record<QualityPreset, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  lossless: 'Lossless',
};

const RENDER_BUTTON_LABELS: Record<ExportFormat, string> = {
  mp4: 'Render MP4',
  webm: 'Render WebM',
  gif: 'Render GIF',
  'png-sequence': 'Export PNGs',
  mov: 'Render MOV',
};

export function RenderPanel() {
  const composition = useStore((s) => s.composition);
  const renderQueue = useStore((s) => s.renderQueue);
  const addRenderJob = useStore((s) => s.addRenderJob);
  const updateJob = useStore((s) => s.updateJob);
  const removeJob = useStore((s) => s.removeJob);
  const retryJob = useStore((s) => s.retryJob);
  const cancelJob = useStore((s) => s.cancelJob);
  const setActiveJob = useStore((s) => s.setActiveJob);
  const clearCompleted = useStore((s) => s.clearCompleted);

  const [ffmpegVersion, setFfmpegVersion] = useState<string | null>(null);
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp4');
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>('medium');
  const renderingRef = useRef(false);

  useEffect(() => {
    checkFfmpeg()
      .then(setFfmpegVersion)
      .catch((e) => setFfmpegError(String(e)));
  }, []);

  // Process queue: start next idle job when no active render
  const processQueue = useCallback(async () => {
    if (renderingRef.current) return;

    const state = useStore.getState();
    const nextJob = state.renderQueue.find((j) => j.status === 'idle');
    if (!nextJob) return;

    renderingRef.current = true;
    setActiveJob(nextJob.id);
    updateJob(nextJob.id, {
      status: 'rendering',
      startedAt: new Date().toISOString(),
    });

    try {
      await renderComposition(
        nextJob.composition,
        nextJob.outputPath,
        (current, total) => {
          // Check if cancelled mid-render
          const currentJob = useStore.getState().renderQueue.find((j) => j.id === nextJob.id);
          if (currentJob?.status === 'cancelled') {
            throw new Error('__CANCELLED__');
          }
          updateJob(nextJob.id, {
            currentFrame: current,
            totalFrames: total,
            progress: (current / total) * 100,
          });
        },
        nextJob.format,
        nextJob.quality,
        nextJob.projectDir,
      );
      updateJob(nextJob.id, {
        status: 'completed',
        progress: 100,
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = String(err);
      if (msg.includes('__CANCELLED__')) {
        try { await cancelRender(); } catch { /* ignore */ }
        updateJob(nextJob.id, {
          status: 'cancelled',
          completedAt: new Date().toISOString(),
        });
      } else {
        updateJob(nextJob.id, {
          status: 'failed',
          error: msg,
          completedAt: new Date().toISOString(),
        });
      }
    } finally {
      renderingRef.current = false;
      setActiveJob(null);
    }

    // Process next in queue
    setTimeout(() => processQueue(), 100);
  }, [setActiveJob, updateJob]);

  // Trigger queue processing when jobs change
  useEffect(() => {
    const hasIdle = renderQueue.some((j) => j.status === 'idle');
    if (hasIdle && !renderingRef.current) {
      processQueue();
    }
  }, [renderQueue, processQueue]);

  async function handleRenderNow() {
    const outputPath = await pickOutputFile(exportFormat);
    if (!outputPath) return;
    const projectDir = useStore.getState().projectPath;
    addRenderJob(composition, outputPath, exportFormat, qualityPreset, projectDir);
  }

  function handleCancel(job: RenderJob) {
    cancelJob(job.id);
    if (job.status === 'rendering') {
      cancelRender().catch(() => {});
    }
  }

  const canRender = exportFormat === 'png-sequence' || (ffmpegVersion && !ffmpegError);

  const statusIcon = (status: RenderStatus) => {
    switch (status) {
      case 'idle': return '~';
      case 'rendering': return '...';
      case 'completed': return 'OK';
      case 'failed': return '!';
      case 'cancelled': return 'X';
      default: return '';
    }
  };

  const statusClass = (status: RenderStatus) => {
    switch (status) {
      case 'completed': return 'job-completed';
      case 'failed': return 'job-failed';
      case 'cancelled': return 'job-cancelled';
      case 'rendering': return 'job-rendering';
      default: return '';
    }
  };

  return (
    <div className="render-panel">
      <div className="render-header">
        <div className="ffmpeg-status">
          {ffmpegVersion && <span className="ffmpeg-ok">FFmpeg: {ffmpegVersion}</span>}
          {ffmpegError && <span className="ffmpeg-err">FFmpeg: {ffmpegError}</span>}
          {!ffmpegVersion && !ffmpegError && <span>Checking FFmpeg...</span>}
        </div>
        <div className="render-actions">
          <select
            className="render-format-select"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
          >
            {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map((f) => (
              <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
            ))}
          </select>
          <select
            className="render-quality-select"
            value={qualityPreset}
            onChange={(e) => setQualityPreset(e.target.value as QualityPreset)}
            disabled={exportFormat === 'png-sequence'}
            title={exportFormat === 'png-sequence' ? 'PNG is always lossless' : 'Quality preset'}
          >
            {(Object.keys(QUALITY_LABELS) as QualityPreset[]).map((q) => (
              <option key={q} value={q}>{QUALITY_LABELS[q]}</option>
            ))}
          </select>
          <button disabled={!canRender} onClick={handleRenderNow}>
            {RENDER_BUTTON_LABELS[exportFormat]}
          </button>
          {renderQueue.some((j) => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled') && (
            <button onClick={clearCompleted} className="clear-btn">Clear done</button>
          )}
        </div>
      </div>

      {renderQueue.length > 0 && (
        <div className="render-queue">
          {renderQueue.map((job) => (
            <div key={job.id} className={`queue-item ${statusClass(job.status)}`}>
              <div className="queue-item-header">
                <span className="queue-status">{statusIcon(job.status)}</span>
                <span className="queue-name">{job.name}</span>
                <span className="format-badge">{job.format.toUpperCase()}</span>
                <span className="queue-path" title={job.outputPath}>
                  {job.outputPath.split(/[/\\]/).pop()}
                </span>
                <div className="queue-item-actions">
                  {job.status === 'failed' && (
                    <button onClick={() => retryJob(job.id)} title="Retry">R</button>
                  )}
                  {(job.status === 'idle' || job.status === 'rendering') && (
                    <button onClick={() => handleCancel(job)} title="Cancel">X</button>
                  )}
                  {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && (
                    <button onClick={() => removeJob(job.id)} title="Remove">x</button>
                  )}
                </div>
              </div>

              {job.status === 'rendering' && (
                <div className="queue-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${job.progress}%` }} />
                  </div>
                  <span className="queue-progress-text">
                    {job.currentFrame} / {job.totalFrames} ({job.progress.toFixed(0)}%)
                  </span>
                </div>
              )}

              {job.status === 'failed' && job.error && (
                <div className="queue-error">{job.error}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
