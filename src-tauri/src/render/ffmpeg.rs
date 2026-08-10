use std::io::Write;
use std::process::{Child, ChildStdin, Command, Stdio};

pub struct FfmpegProcess {
    child: Child,
    stdin: Option<ChildStdin>,
}

#[derive(Clone, serde::Deserialize)]
pub struct AudioTrackSpec {
    pub path: String,
    pub start_time_secs: f64,
    pub duration_secs: f64,
    pub volume: f64,
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
    Ok(stdout.lines().next().unwrap_or("ffmpeg (unknown version)").to_string())
}

pub fn spawn_ffmpeg(
    width: u32,
    height: u32,
    fps: u32,
    output_path: &str,
    audio_tracks: &[AudioTrackSpec],
) -> Result<FfmpegProcess, String> {
    let size = format!("{width}x{height}");
    let rate = fps.to_string();

    let mut args: Vec<String> = vec![
        "-y".into(),
        "-f".into(), "rawvideo".into(),
        "-pix_fmt".into(), "rgba".into(),
        "-s".into(), size,
        "-r".into(), rate,
        "-i".into(), "pipe:0".into(),
    ];

    // Add audio input files
    for track in audio_tracks {
        args.push("-ss".into());
        args.push(format!("{:.3}", track.start_time_secs));
        args.push("-t".into());
        args.push(format!("{:.3}", track.duration_secs));
        args.push("-i".into());
        args.push(track.path.clone());
    }

    // Video encoding
    args.extend([
        "-c:v".into(), "libx264".into(),
        "-pix_fmt".into(), "yuv420p".into(),
        "-preset".into(), "medium".into(),
        "-crf".into(), "23".into(),
        "-movflags".into(), "+faststart".into(),
    ]);

    // Audio encoding and mixing
    if audio_tracks.is_empty() {
        args.push("-an".into()); // no audio
    } else if audio_tracks.len() == 1 {
        // Single audio track — apply volume filter
        let vol = audio_tracks[0].volume;
        args.extend([
            "-af".into(), format!("volume={vol:.2}"),
            "-c:a".into(), "aac".into(),
            "-b:a".into(), "192k".into(),
        ]);
    } else {
        // Multiple audio tracks — mix with amix filter
        let n = audio_tracks.len();
        let mut filter = String::new();
        for (i, track) in audio_tracks.iter().enumerate() {
            // Input index for audio is i+1 (0 is video pipe)
            filter.push_str(&format!("[{}]volume={:.2}[a{i}];", i + 1, track.volume));
        }
        // Mix all audio streams
        for i in 0..n {
            filter.push_str(&format!("[a{i}]"));
        }
        filter.push_str(&format!("amix=inputs={n}:duration=shortest"));

        args.extend([
            "-filter_complex".into(), filter,
            "-c:a".into(), "aac".into(),
            "-b:a".into(), "192k".into(),
        ]);
    }

    args.extend(["-shortest".into(), output_path.into()]);

    let args_str: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let mut child = Command::new("ffmpeg")
        .args(&args_str)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn FFmpeg: {e}"))?;

    let stdin = child.stdin.take();

    Ok(FfmpegProcess { child, stdin })
}
