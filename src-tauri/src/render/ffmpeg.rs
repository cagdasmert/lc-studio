use std::io::Write;
use std::process::{Child, ChildStdin, Command, Stdio};

pub struct FfmpegProcess {
    child: Child,
    stdin: Option<ChildStdin>,
}

/// One sound placed on the output timeline, built by `buildAudioTracks`
/// (src/lib/audio-tracks.ts). Fields added after the first version have
/// defaults, so older payloads still deserialize.
#[derive(Clone, Debug, serde::Deserialize)]
pub struct AudioTrackSpec {
    /// Absolute path (or URL) of the source file.
    pub path: String,
    /// Where to start reading in the source, in seconds.
    pub start_time_secs: f64,
    /// How long the sound lasts in the output, in seconds, after any speed change.
    pub duration_secs: f64,
    pub volume: f64,
    /// Where the sound starts on the output timeline, in seconds.
    #[serde(default)]
    pub timeline_offset_secs: f64,
    #[serde(default)]
    pub fade_in_secs: f64,
    #[serde(default)]
    pub fade_out_secs: f64,
    /// Speed factor: 2 plays twice as fast. Older payloads omit it, meaning 1.
    #[serde(default = "normal_rate")]
    pub playback_rate: f64,
}

fn normal_rate() -> f64 {
    1.0
}

impl AudioTrackSpec {
    fn rate(&self) -> f64 {
        if self.playback_rate > 0.0 { self.playback_rate } else { 1.0 }
    }
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

/// Up to three decimals with trailing zeros dropped: 2.5 → "2.5", 3.0 → "3".
fn num(x: f64) -> String {
    let s = format!("{x:.3}");
    let s = s.trim_end_matches('0').trim_end_matches('.');
    if s == "-0" { "0".to_string() } else { s.to_string() }
}

/// `-ss -t -i` for one track. Reads `duration × rate` seconds of source, so
/// that after `atempo` the sound lasts `duration` seconds.
fn audio_input_args(track: &AudioTrackSpec) -> Vec<String> {
    vec![
        "-ss".into(), num(track.start_time_secs),
        "-t".into(), num(track.duration_secs * track.rate()),
        "-i".into(), track.path.clone(),
    ]
}

/// One `atempo` accepts 0.5–100, so rates outside that are chained.
fn atempo_chain(rate: f64) -> Vec<String> {
    let mut filters = Vec::new();
    let mut r = rate;
    while r < 0.5 {
        filters.push("atempo=0.5".to_string());
        r /= 0.5;
    }
    while r > 100.0 {
        filters.push("atempo=100".to_string());
        r /= 100.0;
    }
    if (r - 1.0).abs() > 1e-9 {
        filters.push(format!("atempo={}", num(r)));
    }
    filters
}

/// The audio `-filter_complex` graph. Each track (input i + 1) is resampled,
/// sped up or slowed down, levelled, faded and delayed to its place on the
/// timeline; then all are mixed without normalisation (which would turn
/// every track down), limited, and padded with silence so the video alone
/// decides the output length under `-shortest`.
pub fn build_audio_filter(tracks: &[AudioTrackSpec]) -> Option<String> {
    if tracks.is_empty() {
        return None;
    }
    let mut graph = String::new();
    for (i, track) in tracks.iter().enumerate() {
        let mut chain = vec!["aformat=sample_rates=48000:channel_layouts=stereo".to_string()];
        chain.extend(atempo_chain(track.rate()));
        chain.push(format!("volume={}", num(track.volume)));
        if track.fade_in_secs > 0.0 {
            chain.push(format!("afade=t=in:st=0:d={}", num(track.fade_in_secs)));
        }
        if track.fade_out_secs > 0.0 {
            let start = (track.duration_secs - track.fade_out_secs).max(0.0);
            chain.push(format!("afade=t=out:st={}:d={}", num(start), num(track.fade_out_secs)));
        }
        let delay_ms = (track.timeline_offset_secs * 1000.0).round().max(0.0) as u64;
        chain.push(format!("adelay=delays={delay_ms}:all=1"));
        graph.push_str(&format!("[{}:a]{}[a{i}];", i + 1, chain.join(",")));
    }
    for i in 0..tracks.len() {
        graph.push_str(&format!("[a{i}]"));
    }
    graph.push_str(&format!(
        "amix=inputs={}:duration=longest:normalize=0,alimiter=limit=0.95,apad[aout]",
        tracks.len()
    ));
    Some(graph)
}

/// The full FFmpeg command line for a render. GIF never carries sound.
pub fn build_ffmpeg_args(
    width: u32,
    height: u32,
    fps: u32,
    output_path: &str,
    audio_tracks: &[AudioTrackSpec],
    format: &str,
    quality: &str,
) -> Vec<String> {
    let tracks: &[AudioTrackSpec] = if format == "gif" { &[] } else { audio_tracks };

    let mut args: Vec<String> = vec![
        "-y".into(),
        "-hide_banner".into(),
        "-nostats".into(),
        "-loglevel".into(), "error".into(),
        "-f".into(), "rawvideo".into(),
        "-pix_fmt".into(), "rgba".into(),
        "-s".into(), format!("{width}x{height}"),
        "-r".into(), fps.to_string(),
        "-i".into(), "pipe:0".into(),
    ];

    for track in tracks {
        args.extend(audio_input_args(track));
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

    match build_audio_filter(tracks) {
        None => args.push("-an".into()),
        Some(graph) => {
            let (codec, bitrate): (&str, Option<&str>) = match format {
                "webm" => ("libopus", Some("128k")),
                "mov" => ("pcm_s16le", None),
                _ => ("aac", Some("192k")),
            };
            args.extend([
                "-filter_complex".into(), graph,
                "-map".into(), "0:v".into(),
                "-map".into(), "[aout]".into(),
                "-c:a".into(), codec.into(),
            ]);
            if let Some(br) = bitrate {
                args.extend(["-b:a".into(), br.into()]);
            }
            // apad makes the audio endless, so the video decides the length:
            // short audio no longer cuts the video, long audio is trimmed.
            args.push("-shortest".into());
        }
    }

    args.push(output_path.into());
    args
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
    let args = build_ffmpeg_args(width, height, fps, output_path, audio_tracks, format, quality);

    let mut child = Command::new("ffmpeg")
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn FFmpeg: {e}"))?;

    let stdin = child.stdin.take();

    Ok(FfmpegProcess { child, stdin })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(path: &str) -> AudioTrackSpec {
        AudioTrackSpec {
            path: path.into(),
            start_time_secs: 0.0,
            duration_secs: 2.0,
            volume: 1.0,
            timeline_offset_secs: 0.0,
            fade_in_secs: 0.0,
            fade_out_secs: 0.0,
            playback_rate: 1.0,
        }
    }

    const MIX_TAIL: &str = "duration=longest:normalize=0,alimiter=limit=0.95,apad[aout]";

    #[test]
    fn no_tracks_no_graph() {
        assert_eq!(build_audio_filter(&[]), None);
    }

    #[test]
    fn one_track() {
        assert_eq!(
            build_audio_filter(&[track("a.wav")]).unwrap(),
            format!(
                "[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1,adelay=delays=0:all=1[a0];\
                 [a0]amix=inputs=1:{MIX_TAIL}"
            ),
        );
    }

    #[test]
    fn three_tracks_are_placed_and_mixed() {
        let mut b = track("b.wav");
        b.timeline_offset_secs = 1.5;
        b.volume = 0.8;
        let mut c = track("c.mp4");
        c.timeline_offset_secs = 2.5;
        let graph = build_audio_filter(&[track("a.wav"), b, c]).unwrap();
        assert!(graph.contains("[2:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.8,adelay=delays=1500:all=1[a1];"), "{graph}");
        assert!(graph.contains("[3:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1,adelay=delays=2500:all=1[a2];"), "{graph}");
        assert!(graph.ends_with(&format!("[a0][a1][a2]amix=inputs=3:{MIX_TAIL}")), "{graph}");
    }

    #[test]
    fn fades_in_and_out() {
        let mut t = track("a.wav");
        t.fade_in_secs = 0.5;
        t.fade_out_secs = 0.25;
        let graph = build_audio_filter(&[t]).unwrap();
        assert!(graph.contains("volume=1,afade=t=in:st=0:d=0.5,afade=t=out:st=1.75:d=0.25,adelay"), "{graph}");
    }

    #[test]
    fn slow_rates_chain_atempo() {
        let mut t = track("a.mp4");
        t.playback_rate = 0.25;
        let graph = build_audio_filter(&[t]).unwrap();
        assert!(graph.contains("stereo,atempo=0.5,atempo=0.5,volume=1"), "{graph}");
    }

    #[test]
    fn fast_rates_use_one_atempo() {
        let mut t = track("a.mp4");
        t.playback_rate = 3.0;
        let graph = build_audio_filter(&[t]).unwrap();
        assert!(graph.contains("stereo,atempo=3,volume=1"), "{graph}");
    }

    #[test]
    fn offsets_round_to_milliseconds() {
        let mut a = track("a.wav");
        a.timeline_offset_secs = 1.2346;
        let mut b = track("b.wav");
        b.timeline_offset_secs = 0.0004;
        let graph = build_audio_filter(&[a, b]).unwrap();
        assert!(graph.contains("adelay=delays=1235:all=1[a0]"), "{graph}");
        assert!(graph.contains("adelay=delays=0:all=1[a1]"), "{graph}");
    }

    #[test]
    fn inputs_read_duration_times_rate_from_the_source_start() {
        let mut t = track("x.mp4");
        t.start_time_secs = 10.0;
        t.playback_rate = 2.0;
        assert_eq!(audio_input_args(&t), ["-ss", "10", "-t", "4", "-i", "x.mp4"]);
    }

    #[test]
    fn older_payloads_still_deserialize() {
        let t: AudioTrackSpec = serde_json::from_str(
            r#"{"path":"a.wav","start_time_secs":1,"duration_secs":2,"volume":0.5}"#,
        )
        .unwrap();
        assert_eq!(t.playback_rate, 1.0);
        assert_eq!(t.timeline_offset_secs, 0.0);
        assert_eq!(t.fade_in_secs, 0.0);
        assert_eq!(t.fade_out_secs, 0.0);
    }

    fn has_pair(args: &[String], a: &str, b: &str) -> bool {
        args.windows(2).any(|w| w[0] == a && w[1] == b)
    }

    #[test]
    fn mixed_audio_is_mapped_and_the_video_sets_the_length() {
        let args = build_ffmpeg_args(64, 64, 30, "out.mp4", &[track("a.wav")], "mp4", "medium");
        assert!(has_pair(&args, "-map", "0:v"), "{args:?}");
        assert!(has_pair(&args, "-map", "[aout]"), "{args:?}");
        assert!(has_pair(&args, "-c:a", "aac"), "{args:?}");
        assert!(args.contains(&"-shortest".to_string()), "{args:?}");
        assert!(!args.contains(&"-an".to_string()), "{args:?}");
    }

    #[test]
    fn no_tracks_means_no_audio() {
        let args = build_ffmpeg_args(64, 64, 30, "out.mp4", &[], "mp4", "medium");
        assert!(args.contains(&"-an".to_string()), "{args:?}");
        assert!(!args.contains(&"-filter_complex".to_string()), "{args:?}");
        assert!(!args.contains(&"-shortest".to_string()), "{args:?}");
    }

    #[test]
    fn gif_ignores_audio_tracks() {
        let args = build_ffmpeg_args(64, 64, 30, "out.gif", &[track("a.wav")], "gif", "medium");
        assert!(!args.contains(&"a.wav".to_string()), "{args:?}");
        assert!(args.contains(&"-an".to_string()), "{args:?}");
    }
}
