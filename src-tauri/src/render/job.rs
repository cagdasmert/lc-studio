use std::sync::Mutex;

use super::ffmpeg::FfmpegProcess;

pub struct RenderJob {
    pub ffmpeg: FfmpegProcess,
    pub current_frame: u32,
    pub total_frames: u32,
    pub width: u32,
    pub height: u32,
}

pub struct RenderState {
    pub active_job: Mutex<Option<RenderJob>>,
}
