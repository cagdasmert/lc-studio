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
    format: &str,
    quality: &str,
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

    // Add audio input files (skip for GIF — no audio support)
    if format != "gif" {
        for track in audio_tracks {
            args.push("-ss".into());
            args.push(format!("{:.3}", track.start_time_secs));
            args.push("-t".into());
            args.push(format!("{:.3}", track.duration_secs));
            args.push("-i".into());
            args.push(track.path.clone());
        }
    }

    // Format-specific video encoding
    match format {
        "webm" => {
            args.extend(["-c:v".into(), "libvpx-vp9".into(), "-pix_fmt".into(), "yuv420p".into()]);
            if quality == "lossless" {
                args.extend(["-lossless".into(), "1".into()]);
            } else {
                let crf = match quality {
                    "low" => "40",
                    "high" => "24",
                    _ => "31", // medium
                };
                args.extend(["-b:v".into(), "0".into(), "-crf".into(), crf.into()]);
            }
            args.extend(["-row-mt".into(), "1".into()]);
        }
        "gif" => {
            // Single-pass GIF with inline palette generation
            let vf = format!(
                "fps={fps},split[s0][s1];[s0]palettegen=max_colors={colors}[p];[s1][p]paletteuse=dither={dither}",
                fps = fps,
                colors = match quality {
                    "low" => 64,
                    "medium" => 128,
                    "lossless" => 256,
                    _ => 256, // high
                },
                dither = if quality == "lossless" { "none" } else { "sierra2_4a" },
            );
            args.extend(["-vf".into(), vf, "-loop".into(), "0".into()]);
        }
        "mov" => {
            let profile = match quality {
                "low" => "0",      // proxy
                "medium" => "1",   // lt
                "high" => "2",     // hq
                "lossless" => "4", // 4444
                _ => "2",
            };
            args.extend([
                "-c:v".into(), "prores_ks".into(),
                "-profile:v".into(), profile.into(),
                "-pix_fmt".into(), "yuva444p10le".into(),
                "-vendor".into(), "apl0".into(),
            ]);
        }
        _ => {
            // MP4 (H.264) — default
            let (crf, preset) = match quality {
                "low" => ("32", "fast"),
                "high" => ("18", "medium"),
                "lossless" => ("0", "veryslow"),
                _ => ("23", "medium"), // medium
            };
            args.extend([
                "-c:v".into(), "libx264".into(),
                "-pix_fmt".into(), "yuv420p".into(),
                "-preset".into(), preset.into(),
                "-crf".into(), crf.into(),
                "-movflags".into(), "+faststart".into(),
            ]);
        }
    }

    // Audio encoding and mixing
    if format == "gif" {
        args.push("-an".into());
    } else if audio_tracks.is_empty() {
        args.push("-an".into());
    } else {
        // Audio codec depends on container format
        let (audio_codec, audio_bitrate): (&str, Option<&str>) = match format {
            "webm" => ("libopus", Some("128k")),
            "mov" => ("pcm_s16le", None),
            _ => ("aac", Some("192k")),
        };

        if audio_tracks.len() == 1 {
            let vol = audio_tracks[0].volume;
            args.extend(["-af".into(), format!("volume={vol:.2}")]);
            args.extend(["-c:a".into(), audio_codec.into()]);
            if let Some(br) = audio_bitrate {
                args.extend(["-b:a".into(), br.into()]);
            }
        } else {
            let n = audio_tracks.len();
            let mut filter = String::new();
            for (i, track) in audio_tracks.iter().enumerate() {
                filter.push_str(&format!("[{}]volume={:.2}[a{i}];", i + 1, track.volume));
            }
            for i in 0..n {
                filter.push_str(&format!("[a{i}]"));
            }
            filter.push_str(&format!("amix=inputs={n}:duration=shortest"));

            args.extend(["-filter_complex".into(), filter]);
            args.extend(["-c:a".into(), audio_codec.into()]);
            if let Some(br) = audio_bitrate {
                args.extend(["-b:a".into(), br.into()]);
            }
        }
    }

    if !audio_tracks.is_empty() && format != "gif" {
        args.push("-shortest".into());
    }
    args.push(output_path.into());

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
