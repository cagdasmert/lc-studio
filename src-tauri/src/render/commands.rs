use tauri::{AppHandle, Emitter};

use super::ffmpeg;
use super::job::{RenderJob, RenderState};

#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    current_frame: u32,
    total_frames: u32,
    percent: f64,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
pub fn check_ffmpeg() -> Result<String, String> {
    ffmpeg::check_ffmpeg()
}

#[tauri::command]
pub fn start_render(
    state: tauri::State<'_, RenderState>,
    output_path: String,
    width: u32,
    height: u32,
    fps: u32,
    total_frames: u32,
    audio_tracks: Option<Vec<ffmpeg::AudioTrackSpec>>,
) -> Result<(), String> {
    let mut guard = state
        .active_job
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;

    if guard.is_some() {
        return Err("A render is already in progress".into());
    }

    let tracks = audio_tracks.unwrap_or_default();
    let process = ffmpeg::spawn_ffmpeg(width, height, fps, &output_path, &tracks)?;

    *guard = Some(RenderJob {
        ffmpeg: process,
        current_frame: 0,
        total_frames,
        width,
        height,
    });

    Ok(())
}

#[tauri::command]
pub fn write_frame(
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, RenderState>,
    app: AppHandle,
) -> Result<(), String> {
    let frame_data = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes,
        _ => return Err("Expected raw frame data".into()),
    };

    let mut guard = state
        .active_job
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;

    let job = guard
        .as_mut()
        .ok_or("No active render job")?;

    let expected_size = (job.width * job.height * 4) as usize;
    if frame_data.len() != expected_size {
        return Err(format!(
            "Frame size mismatch: got {} bytes, expected {}",
            frame_data.len(),
            expected_size
        ));
    }

    job.ffmpeg.write_frame(frame_data)?;
    job.current_frame += 1;

    let percent = (job.current_frame as f64 / job.total_frames as f64) * 100.0;

    let _ = app.emit(
        "render:progress",
        ProgressPayload {
            current_frame: job.current_frame,
            total_frames: job.total_frames,
            percent,
            status: "rendering".into(),
            error: None,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn finish_render(
    state: tauri::State<'_, RenderState>,
    app: AppHandle,
) -> Result<(), String> {
    let mut guard = state
        .active_job
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;

    let job = guard.take().ok_or("No active render job")?;

    let result = job.ffmpeg.finish();

    let (status, error) = match &result {
        Ok(()) => ("completed".to_string(), None),
        Err(e) => ("failed".to_string(), Some(e.clone())),
    };

    let _ = app.emit(
        "render:progress",
        ProgressPayload {
            current_frame: job.total_frames,
            total_frames: job.total_frames,
            percent: 100.0,
            status,
            error,
        },
    );

    result
}

#[tauri::command]
pub fn cancel_render(
    state: tauri::State<'_, RenderState>,
    app: AppHandle,
) -> Result<(), String> {
    let mut guard = state
        .active_job
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;

    if let Some(mut job) = guard.take() {
        let _ = job.ffmpeg.kill();

        let _ = app.emit(
            "render:progress",
            ProgressPayload {
                current_frame: job.current_frame,
                total_frames: job.total_frames,
                percent: (job.current_frame as f64 / job.total_frames as f64) * 100.0,
                status: "cancelled".into(),
                error: None,
            },
        );
    }

    Ok(())
}
