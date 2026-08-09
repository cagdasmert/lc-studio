use std::io::Write;
use std::process::{Child, ChildStdin, Command, Stdio};

pub struct FfmpegProcess {
    child: Child,
    stdin: Option<ChildStdin>,
}

impl FfmpegProcess {
    pub fn write_frame(&mut self, data: &[u8]) -> Result<(), String> {
        let stdin = self
            .stdin
            .as_mut()
            .ok_or("FFmpeg stdin already closed")?;
        stdin
            .write_all(data)
            .map_err(|e| format!("Failed to write frame to FFmpeg: {e}"))
    }

    pub fn finish(mut self) -> Result<(), String> {
        // Drop stdin to signal EOF to FFmpeg
        drop(self.stdin.take());

        let status = self
            .child
            .wait()
            .map_err(|e| format!("Failed to wait for FFmpeg: {e}"))?;

        if status.success() {
            Ok(())
        } else {
            Err(format!("FFmpeg exited with status: {status}"))
        }
    }

    pub fn kill(&mut self) -> Result<(), String> {
        drop(self.stdin.take());
        self.child
            .kill()
            .map_err(|e| format!("Failed to kill FFmpeg: {e}"))
    }
}

pub fn check_ffmpeg() -> Result<String, String> {
    let output = Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|_| "FFmpeg not found. Please install FFmpeg and ensure it is on your PATH.".to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    // Return the first line (e.g. "ffmpeg version 6.1 ...")
    Ok(stdout.lines().next().unwrap_or("ffmpeg (unknown version)").to_string())
}

pub fn spawn_ffmpeg(
    width: u32,
    height: u32,
    fps: u32,
    output_path: &str,
) -> Result<FfmpegProcess, String> {
    let size = format!("{width}x{height}");
    let rate = fps.to_string();

    let mut child = Command::new("ffmpeg")
        .args([
            "-y",                    // overwrite output
            "-f", "rawvideo",        // input format: raw pixels
            "-pix_fmt", "rgba",      // input pixel format
            "-s", &size,             // input resolution
            "-r", &rate,             // input framerate
            "-i", "pipe:0",          // read from stdin
            "-c:v", "libx264",       // encode with H.264
            "-pix_fmt", "yuv420p",   // output pixel format (broad compat)
            "-preset", "medium",     // encoding speed/quality balance
            "-crf", "23",            // constant rate factor
            "-movflags", "+faststart", // web-friendly MP4
            output_path,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn FFmpeg: {e}"))?;

    let stdin = child.stdin.take();

    Ok(FfmpegProcess { child, stdin })
}
