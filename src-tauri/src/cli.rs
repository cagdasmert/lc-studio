//! Command-line mode: `local-content-studio render <project> --out <file|dir>`
//! (docs/superpowers/specs/2026-10-28-headless-cli-design.md).
//!
//! Rust parses and checks the arguments before Tauri starts, so a typo never
//! opens a window. The job then runs in the real webview, in a hidden window:
//! the frontend (`src/lib/cli/`) asks for it with `cli_job`, reports progress
//! with `cli_progress`, and hands back the result with `cli_finish`, which
//! prints it and exits. A watchdog ends a run whose frontend never loads or
//! goes quiet. A launch whose first argument isn't a command is a normal GUI
//! launch, unchanged.

use std::ffi::OsString;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_fs::FsExt;

use crate::project_scope::project_dir_for;
use crate::render::job::RenderState;

/// Bump on any breaking change to the result document; lcs.py checks it.
pub const RESULT_SCHEMA: u32 = 1;
const VERSION: &str = env!("CARGO_PKG_VERSION");
/// The frontend must ask for its job within this long of launch…
const LOAD_LIMIT: Duration = Duration::from_secs(30);
/// …and then report progress or a heartbeat at least this often.
const SILENCE_LIMIT: Duration = Duration::from_secs(120);

const FORMATS: &[&str] = &["mp4", "webm", "mov", "gif", "png-sequence"];
const QUALITIES: &[&str] = &["low", "medium", "high", "lossless"];
/// Same wording as `readProjectFile` in src/lib/project-io.ts.
const DRAFT: &str = "this is a draft (build input), not a project — run `lcs.py build` on it and open the .lcs folder it writes";

pub const USAGE: &str = "\
Usage:
  local-content-studio render <project> --out <file|dir> [--format F] [--quality Q] [--force]
  local-content-studio stills <project> --out <dir> [--frames F] [--scale S] [--sheet-scale S]
  local-content-studio check  <project> [--frames F]
  local-content-studio automatch <project> [--layer L] [--write]
  local-content-studio --help | --version

  <project>         a .lcs folder, or the project.json inside one

render:
  --out             the video file, or a folder for a PNG sequence
  --format F        mp4 | webm | mov | gif | png-sequence
                    (default: from --out's extension; none means png-sequence)
  --quality Q       low | medium | high | lossless (default: medium)
  --force           replace --out if it exists

stills (writes frame-NNNN.png for each frame and a labelled sheet.png into --out):
  --frames F        auto (default): the hook, each scene once settled, each transition's
                    middle, each morph's middle and the last frame; or all; or frame
                    numbers counted from 0, such as 0,12,90
  --scale S         size of each frame PNG, more than 0 and at most 1 (default: 0.5)
  --sheet-scale S   size of each frame on the sheet (default: 0.25)

check (lists what lc-studio itself finds wrong; writes nothing):
  --frames F        the frames to draw, as for stills (default: auto)

automatch (DINOv2 morph pairs, merged with manual pairs as Edit points… → Auto-match does):
  --layer L         the image layer, by id or name (default: every layer with a morph)
  --write           save the pairs into project.json (default: only print them)

Common options:
  --result <file>   also write the result JSON to this file
  --timeout <secs>  give up after this many seconds
  --show            run in the normal visible window (for debugging; it takes focus)

The result is one JSON document on stdout; progress goes to stderr.
Exit codes: 0 ran, 1 ran and failed, 2 never ran (usage, not a project, startup).
";

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(tag = "command", rename_all = "kebab-case")]
pub enum Job {
    Render { project: PathBuf, out: PathBuf, format: String, quality: String },
    #[serde(rename_all = "camelCase")]
    Stills { project: PathBuf, out: PathBuf, frames: Frames, scale: f64, sheet_scale: f64 },
    Check { project: PathBuf, frames: Frames },
    Automatch { project: PathBuf, layer: Option<String>, write: bool },
}

/// `--frames`: `auto`, `all`, or frame numbers. The frontend, which knows the
/// video's length, checks that the numbers fall inside it.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(untagged)]
pub enum Frames {
    Keyword(&'static str),
    List(Vec<u32>),
}

impl Job {
    fn name(&self) -> &'static str {
        match self {
            Job::Render { .. } => "render",
            Job::Stills { .. } => "stills",
            Job::Check { .. } => "check",
            Job::Automatch { .. } => "automatch",
        }
    }

    fn project(&self) -> &Path {
        match self {
            Job::Render { project, .. }
            | Job::Stills { project, .. }
            | Job::Check { project, .. }
            | Job::Automatch { project, .. } => project,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Cli {
    pub job: Job,
    pub result: Option<PathBuf>,
    pub timeout: Option<Duration>,
    pub show: bool,
}

/// What argv asks for.
#[derive(Debug, PartialEq)]
pub enum Launch {
    /// No command: the normal app, including "open with" launches that pass a path.
    Gui,
    Cli(Cli),
    /// --help, --version or a usage error: print, then exit without starting Tauri.
    Exit { code: i32, stdout: String, stderr: String, result: Option<PathBuf> },
}

pub fn parse(args: impl IntoIterator<Item = OsString>) -> Launch {
    let mut args = args.into_iter().skip(1);
    let Some(first) = args.next() else { return Launch::Gui };
    match first.to_str() {
        Some("--help") => Launch::Exit { code: 0, stdout: USAGE.into(), stderr: String::new(), result: None },
        Some("--version") => Launch::Exit {
            code: 0,
            stdout: format!("local-content-studio {VERSION} (cli result schema {RESULT_SCHEMA})\n"),
            stderr: String::new(),
            result: None,
        },
        Some(command @ ("render" | "stills" | "check" | "automatch")) => {
            let mut result = None;
            match parse_command(command, args.collect(), &mut result) {
                Ok(cli) => Launch::Cli(cli),
                Err(message) => Launch::Exit {
                    code: 2,
                    stdout: failure(command, None, &message, 0),
                    stderr: format!("error: {message}\n\n{USAGE}"),
                    result,
                },
            }
        }
        _ => Launch::Gui,
    }
}

/// Print what `Launch::Exit` holds and exit.
pub fn exit_early(code: i32, stdout: &str, stderr: &str, result: Option<&Path>) -> ! {
    eprint!("{stderr}");
    if code == 0 {
        print!("{stdout}");
        let _ = std::io::stdout().flush();
    } else {
        emit(result, stdout);
    }
    std::process::exit(code);
}

/// Options some command takes, beyond the common ones.
const COMMAND_OPTIONS: &[&str] = &["--out", "--format", "--quality", "--force", "--frames", "--scale", "--sheet-scale", "--layer", "--write"];

fn takes(command: &str, option: &str) -> bool {
    match command {
        "render" => matches!(option, "--out" | "--format" | "--quality" | "--force"),
        "stills" => matches!(option, "--out" | "--frames" | "--scale" | "--sheet-scale"),
        "check" => option == "--frames",
        "automatch" => matches!(option, "--layer" | "--write"),
        _ => false,
    }
}

/// `--result` is filled in as soon as it's parsed, so a later usage error can still be written there.
fn parse_command(command: &str, args: Vec<OsString>, result: &mut Option<PathBuf>) -> Result<Cli, String> {
    let cwd = std::env::current_dir().map_err(|e| format!("no current folder: {e}"))?;
    let absolute = |p: OsString| {
        let p = PathBuf::from(p);
        if p.is_absolute() { p } else { cwd.join(p) }
    };
    let (mut project, mut out, mut timeout) = (None, None, None);
    let (mut force, mut show, mut write) = (false, false, false);
    // The other options' values, by option.
    let mut named = std::collections::HashMap::new();

    let mut it = args.into_iter();
    while let Some(arg) = it.next() {
        let text = arg.to_string_lossy().into_owned();
        // `--flag=value` as well as `--flag value`.
        let (flag, inline) = match text.split_once('=') {
            Some((f, v)) if f.starts_with("--") => (f.to_string(), Some(OsString::from(v))),
            _ => (text.clone(), None),
        };
        let mut value = || inline.clone().or_else(|| it.next()).ok_or_else(|| format!("{flag} needs a value"));
        match flag.as_str() {
            "--result" => *result = Some(absolute(value()?)),
            "--timeout" => {
                let v = value()?.to_string_lossy().into_owned();
                let secs = v.parse::<u64>().ok().filter(|&s| s > 0);
                timeout = Some(Duration::from_secs(secs.ok_or_else(|| format!("--timeout must be a whole number of seconds, not {v:?}"))?));
            }
            "--show" => show = true,
            f if !f.starts_with("--") => {
                if project.is_some() {
                    return Err(format!("unexpected argument {text:?}"));
                }
                project = Some(absolute(arg));
            }
            f if !takes(command, f) => {
                return Err(if COMMAND_OPTIONS.contains(&f) { format!("{f} doesn't apply to {command}") } else { format!("unknown option {f}") });
            }
            "--out" => out = Some(absolute(value()?)),
            "--force" => force = true,
            "--write" => write = true,
            f => {
                named.insert(f.to_string(), value()?.to_string_lossy().into_owned());
            }
        }
    }

    let project = check_project(&project.ok_or_else(|| format!("{command} needs a <project>"))?)?;
    let named = |option: &str| named.get(option).map(String::as_str);
    let frames = || parse_frames(named("--frames").unwrap_or("auto"));
    let out = || out.clone().ok_or_else(|| format!("{command} needs --out"));
    let job = match command {
        "render" => {
            let out = out()?;
            let format = match named("--format") {
                Some(f) => one_of(f, FORMATS, "--format")?,
                None => format_from_extension(&out)?,
            };
            let quality = one_of(named("--quality").unwrap_or("medium"), QUALITIES, "--quality")?;
            let out = check_out(&out, &format, force)?;
            Job::Render { project, out, format, quality }
        }
        "stills" => Job::Stills {
            project,
            out: check_out_folder(&out()?)?,
            frames: frames()?,
            scale: parse_scale(named("--scale"), 0.5, "--scale")?,
            sheet_scale: parse_scale(named("--sheet-scale"), 0.25, "--sheet-scale")?,
        },
        "check" => Job::Check { project, frames: frames()? },
        _ => Job::Automatch { project, layer: named("--layer").map(String::from), write },
    };
    Ok(Cli { job, result: result.clone(), timeout, show })
}

fn parse_frames(value: &str) -> Result<Frames, String> {
    match value {
        "auto" => Ok(Frames::Keyword("auto")),
        "all" => Ok(Frames::Keyword("all")),
        _ => value
            .split(',')
            .map(|f| f.trim().parse::<u32>())
            .collect::<Result<Vec<_>, _>>()
            .map(Frames::List)
            .map_err(|_| format!("--frames takes auto, all, or frame numbers such as 0,12,90, not {value:?}")),
    }
}

fn parse_scale(value: Option<&str>, default: f64, option: &str) -> Result<f64, String> {
    let Some(v) = value else { return Ok(default) };
    v.parse::<f64>()
        .ok()
        .filter(|s| *s > 0.0 && *s <= 1.0)
        .ok_or_else(|| format!("{option} must be more than 0 and at most 1, not {v:?}"))
}

/// The canonical project folder, or why `path` isn't a project lc-studio can open.
fn check_project(path: &Path) -> Result<PathBuf, String> {
    if !path.exists() {
        return Err(format!("no such file or folder: {}", path.display()));
    }
    if path.is_file() && path.file_name().is_none_or(|n| n != "project.json") && is_draft(path) {
        return Err(DRAFT.into());
    }
    let dir = project_dir_for(path)?;
    let json = dir.join("project.json");
    if !json.is_file() {
        return Err(format!("{} has no project.json", dir.display()));
    }
    if is_draft(&json) {
        return Err(DRAFT.into());
    }
    Ok(dir)
}

fn is_draft(file: &Path) -> bool {
    std::fs::read_to_string(file)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .is_some_and(|v| v.get("draft").is_some())
}

fn format_from_extension(out: &Path) -> Result<String, String> {
    let Some(ext) = out.extension() else { return Ok("png-sequence".into()) };
    let ext = ext.to_string_lossy().to_lowercase();
    match ext.as_str() {
        "mp4" | "webm" | "mov" | "gif" => Ok(ext),
        _ => Err(format!("can't tell the format from \".{ext}\" — pass --format")),
    }
}

fn one_of(value: &str, allowed: &[&str], flag: &str) -> Result<String, String> {
    if allowed.contains(&value) {
        Ok(value.into())
    } else {
        Err(format!("{flag} must be one of {}, not {value:?}", allowed.join(", ")))
    }
}

/// `out` with its parent folder canonicalized.
fn resolve_out(out: &Path) -> Result<PathBuf, String> {
    let name = out.file_name().ok_or_else(|| format!("--out has no file name: {}", out.display()))?;
    let parent = out.parent().filter(|p| p.is_dir()).ok_or_else(|| format!("--out's folder doesn't exist: {}", out.display()))?;
    Ok(parent.canonicalize().map_err(|e| format!("{}: {e}", parent.display()))?.join(name))
}

/// A render's `out`, once it's clear the render may write there.
fn check_out(out: &Path, format: &str, force: bool) -> Result<PathBuf, String> {
    let out = resolve_out(out)?;
    let folder = format == "png-sequence";
    if out.exists() {
        if folder && !out.is_dir() {
            return Err(format!("{} is a file; a PNG sequence needs a folder", out.display()));
        }
        if !folder && out.is_dir() {
            return Err(format!("{} is a folder; pass a file name for {format}", out.display()));
        }
        if !force {
            return Err(format!("{} already exists — pass --force to replace it", out.display()));
        }
    }
    Ok(out)
}

/// The stills folder. It may exist: stills replace only their own files.
fn check_out_folder(out: &Path) -> Result<PathBuf, String> {
    let out = resolve_out(out)?;
    if out.exists() && !out.is_dir() {
        return Err(format!("{} is a file; stills need a folder", out.display()));
    }
    Ok(out)
}

/// The result document for a run that ended before the frontend could report.
fn failure(command: &str, project: Option<&Path>, error: &str, ms: u128) -> String {
    serde_json::to_string_pretty(&json!({
        "schema": RESULT_SCHEMA,
        "app": VERSION,
        "command": command,
        "project": project.map(|p| p.to_string_lossy()),
        "ok": false,
        "error": error,
        "ms": ms,
        "composition": null,
        "issues": [],
        "data": null,
    }))
    .expect("a JSON literal serializes")
}

/// Print a result document on stdout and write it to `--result`.
fn emit(result: Option<&Path>, doc: &str) {
    let mut stdout = std::io::stdout().lock();
    let _ = writeln!(stdout, "{doc}");
    let _ = stdout.flush();
    if let Some(path) = result {
        if let Err(e) = std::fs::write(path, format!("{doc}\n")) {
            eprintln!("[lcs] could not write {}: {e}", path.display());
        }
    }
}

// ── At run time ──────────────────────────────────────

pub struct CliState {
    pub cli: Option<Cli>,
    started: Instant,
    loaded: AtomicBool,
    finished: AtomicBool,
    last_beat: Mutex<Instant>,
    last_print: Mutex<Option<Instant>>,
}

impl CliState {
    pub fn new(cli: Option<Cli>) -> Self {
        let now = Instant::now();
        CliState {
            cli,
            started: now,
            loaded: AtomicBool::new(false),
            finished: AtomicBool::new(false),
            last_beat: Mutex::new(now),
            last_print: Mutex::new(None),
        }
    }

    fn beat(&self) {
        *self.last_beat.lock().unwrap_or_else(|e| e.into_inner()) = Instant::now();
    }
}

/// The job for the frontend, or None on a normal launch. Grants the project
/// folder, and creates and grants the folder of a PNG sequence or of stills.
#[tauri::command]
pub fn cli_job<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, CliState>) -> Result<Option<Value>, String> {
    let Some(cli) = &state.cli else { return Ok(None) };
    state.loaded.store(true, Ordering::SeqCst);
    state.beat();
    let scope = app.fs_scope();
    let granted = match &cli.job {
        Job::Render { project, out, format, .. } => {
            grant(&scope, project, true).and_then(|()| if format == "png-sequence" { grant_out(&scope, out) } else { Ok(()) })
        }
        Job::Stills { project, out, .. } => grant(&scope, project, true).and_then(|()| grant_out(&scope, out)),
        Job::Check { project, .. } | Job::Automatch { project, .. } => grant(&scope, project, true),
    };
    if let Err(reason) = granted {
        abort(&app, &state, &reason);
        return Err(reason);
    }
    let mut job = serde_json::to_value(&cli.job).map_err(|e| e.to_string())?;
    job["schema"] = RESULT_SCHEMA.into();
    job["app"] = VERSION.into();
    Ok(Some(job))
}

fn grant(scope: &tauri::fs::Scope, dir: &Path, recursive: bool) -> Result<(), String> {
    scope.allow_directory(dir, recursive).map_err(|e| format!("could not allow {}: {e}", dir.display()))
}

/// Create an output folder and let the frontend write the files directly in it.
fn grant_out(scope: &tauri::fs::Scope, out: &Path) -> Result<(), String> {
    std::fs::create_dir_all(out).map_err(|e| format!("{}: {e}", out.display()))?;
    grant(scope, out, false)
}

/// Progress (or, with `total` 0, a heartbeat). Printed to stderr at most once a second.
#[tauri::command]
pub fn cli_progress(state: tauri::State<'_, CliState>, done: u32, total: u32, stage: String) {
    state.beat();
    if total == 0 {
        return;
    }
    let mut last = state.last_print.lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    if done < total && last.is_some_and(|t| now - t < Duration::from_secs(1)) {
        return;
    }
    *last = Some(now);
    eprintln!("[lcs] {stage} {done}/{total} ({}%)", u64::from(done) * 100 / u64::from(total));
}

/// Print the frontend's result (already pretty-printed) and exit: 0 if it ran cleanly, 1 if not.
#[tauri::command]
pub fn cli_finish<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, CliState>, result: String) -> Result<(), String> {
    let cli = state.cli.as_ref().ok_or("not a command-line run")?;
    let doc: Value = serde_json::from_str(&result).map_err(|e| format!("unreadable result: {e}"))?;
    if state.finished.swap(true, Ordering::SeqCst) {
        return Ok(()); // the watchdog got there first
    }
    let errors = doc["issues"].as_array().is_some_and(|issues| issues.iter().any(|i| i["severity"] == "error"));
    let failed = doc["ok"] != Value::Bool(true) || errors;
    // The frontend's text as it is: re-serializing would sort the keys and,
    // without serde_json's float_roundtrip, change the last digit of some numbers.
    emit(cli.result.as_deref(), result.trim_end());
    // Not app.exit(code): on macOS its code never reaches the process, which exits 0.
    app.cleanup_before_exit();
    std::process::exit(if failed { 1 } else { 0 });
}

/// End the run with exit code 2 if the frontend never asks for its job, goes
/// quiet, or `--timeout` passes. Kills a running FFmpeg first.
pub fn start_watchdog<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(500));
        let state = app.state::<CliState>();
        let Some(cli) = &state.cli else { return };
        if state.finished.load(Ordering::SeqCst) {
            return;
        }
        let elapsed = state.started.elapsed();
        let quiet = state.last_beat.lock().unwrap_or_else(|e| e.into_inner()).elapsed();
        let loaded = state.loaded.load(Ordering::SeqCst);
        let reason = if !loaded && elapsed > LOAD_LIMIT {
            format!("the frontend did not load within {} s (a debug build needs Vite on :1420)", LOAD_LIMIT.as_secs())
        } else if loaded && quiet > SILENCE_LIMIT {
            format!("the renderer stopped responding (nothing for {} s)", SILENCE_LIMIT.as_secs())
        } else if let Some(limit) = cli.timeout.filter(|&t| elapsed > t) {
            format!("timed out after {} s (--timeout)", limit.as_secs())
        } else {
            continue;
        };
        abort(&app, &state, &reason);
        return;
    });
}

/// End the run now with exit code 2, killing a running FFmpeg first. Returns
/// only if the run has already finished (then that path exits).
fn abort<R: Runtime>(app: &AppHandle<R>, state: &CliState, reason: &str) {
    let Some(cli) = &state.cli else { return };
    if state.finished.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Ok(mut active) = app.state::<RenderState>().active_job.lock() {
        if let Some(mut job) = active.take() {
            let _ = job.ffmpeg.kill();
        }
    }
    eprintln!("[lcs] {reason}");
    emit(cli.result.as_deref(), &failure(cli.job.name(), Some(cli.job.project()), reason, state.started.elapsed().as_millis()));
    std::process::exit(2);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lcs-cli-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.canonicalize().unwrap()
    }

    /// A folder holding `Launch.lcs/project.json`.
    fn with_project(name: &str) -> (PathBuf, PathBuf) {
        let root = scratch(name);
        let project = root.join("Launch.lcs");
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("project.json"), r#"{"version":3,"composition":{"scenes":[]}}"#).unwrap();
        (root, project)
    }

    fn argv(args: &[&str]) -> Vec<OsString> {
        std::iter::once("local-content-studio").chain(args.iter().copied()).map(OsString::from).collect()
    }

    fn cli(args: &[&str]) -> Cli {
        match parse(argv(args)) {
            Launch::Cli(cli) => cli,
            other => panic!("expected a CLI job, got {other:?}"),
        }
    }

    /// The usage error's message (the first line of stderr).
    fn usage(args: &[&str]) -> String {
        match parse(argv(args)) {
            Launch::Exit { code: 2, stderr, .. } => stderr.lines().next().unwrap().to_string(),
            other => panic!("expected a usage error, got {other:?}"),
        }
    }

    fn render(cli: &Cli) -> (&Path, &Path, &str, &str) {
        let Job::Render { project, out, format, quality } = &cli.job else { panic!("not a render: {cli:?}") };
        (project, out, format, quality)
    }

    fn stills(cli: &Cli) -> (&Path, &Path, &Frames, f64, f64) {
        let Job::Stills { project, out, frames, scale, sheet_scale } = &cli.job else { panic!("not stills: {cli:?}") };
        (project, out, frames, *scale, *sheet_scale)
    }

    #[test]
    fn no_command_is_a_gui_launch() {
        assert_eq!(parse(argv(&[])), Launch::Gui);
        // An "open with" launch on Windows and Linux passes the file.
        assert_eq!(parse(argv(&["/Users/me/Launch.lcs"])), Launch::Gui);
        assert_eq!(parse(argv(&["renderx", "--out", "x.mp4"])), Launch::Gui);
    }

    #[test]
    fn help_and_version_exit_0_on_stdout() {
        for (arg, want) in [("--help", "Usage:"), ("--version", "local-content-studio ")] {
            match parse(argv(&[arg])) {
                Launch::Exit { code: 0, stdout, stderr, result: None } => {
                    assert!(stdout.starts_with(want), "{stdout}");
                    assert!(stderr.is_empty());
                }
                other => panic!("{arg}: {other:?}"),
            }
        }
    }

    #[test]
    fn render_defaults() {
        let (root, project) = with_project("defaults");
        let out = root.join("Launch.mp4");
        let c = cli(&["render", project.to_str().unwrap(), "--out", out.to_str().unwrap()]);
        assert_eq!(render(&c), (project.as_path(), out.as_path(), "mp4", "medium"));
        assert_eq!((c.result, c.timeout, c.show), (None, None, false));
    }

    #[test]
    fn project_json_maps_to_its_folder() {
        let (root, project) = with_project("json");
        let c = cli(&["render", project.join("project.json").to_str().unwrap(), "--out", root.join("a.mp4").to_str().unwrap()]);
        assert_eq!(render(&c).0, project.as_path());
    }

    #[test]
    fn format_comes_from_the_extension() {
        let (root, project) = with_project("ext");
        let p = project.to_str().unwrap();
        for (name, want) in [("a.webm", "webm"), ("a.mov", "mov"), ("a.gif", "gif"), ("A.MP4", "mp4"), ("frames", "png-sequence")] {
            let c = cli(&["render", p, "--out", root.join(name).to_str().unwrap()]);
            assert_eq!(render(&c).2, want, "{name}");
        }
        assert!(usage(&["render", p, "--out", root.join("a.avi").to_str().unwrap()]).contains("pass --format"));
    }

    #[test]
    fn explicit_format_and_quality_win() {
        let (root, project) = with_project("explicit");
        let p = project.to_str().unwrap();
        let out = root.join("frames.out");
        let c = cli(&["render", p, "--out", out.to_str().unwrap(), "--format", "png-sequence", "--quality=high"]);
        assert_eq!(render(&c).2, "png-sequence");
        assert_eq!(render(&c).3, "high");
        assert!(usage(&["render", p, "--out", out.to_str().unwrap(), "--format", "avi"]).contains("--format must be one of"));
        assert!(usage(&["render", p, "--out", "a.mp4", "--quality", "ultra"]).contains("--quality must be one of"));
    }

    #[test]
    fn common_options() {
        let (root, project) = with_project("common");
        let c = cli(&[
            "render", project.to_str().unwrap(), "--out", root.join("a.mp4").to_str().unwrap(),
            "--result", "result.json", "--timeout=90", "--show",
        ]);
        let result = c.result.unwrap();
        assert!(result.is_absolute() && result.ends_with("result.json"), "{}", result.display());
        assert_eq!(c.timeout, Some(Duration::from_secs(90)));
        assert!(c.show);
        for bad in ["0", "-3", "soon"] {
            assert!(usage(&["render", project.to_str().unwrap(), "--out", "a.mp4", "--timeout", bad]).contains("--timeout must be"));
        }
    }

    #[test]
    fn usage_errors() {
        let (root, project) = with_project("usage");
        let p = project.to_str().unwrap();
        let out = root.join("a.mp4");
        let o = out.to_str().unwrap();
        assert!(usage(&["render", "--out", o]).contains("needs a <project>"));
        assert!(usage(&["render", p]).contains("needs --out"));
        assert!(usage(&["render", p, "--out"]).contains("--out needs a value"));
        assert!(usage(&["render", p, "--out", o, "--fps", "30"]).contains("unknown option --fps"));
        assert!(usage(&["render", p, p, "--out", o]).contains("unexpected argument"));
        assert!(usage(&["render", root.join("nope.lcs").to_str().unwrap(), "--out", o]).contains("no such file or folder"));
        assert!(usage(&["render", root.to_str().unwrap(), "--out", o]).contains("not an lc-studio project folder"));
        assert!(usage(&["render", p, "--out", root.join("missing/a.mp4").to_str().unwrap()]).contains("folder doesn't exist"));
    }

    #[test]
    fn drafts_are_refused_with_a_pointer_to_build() {
        let (root, project) = with_project("draft");
        let draft = project.join(".draft/draft.json");
        fs::create_dir_all(draft.parent().unwrap()).unwrap();
        fs::write(&draft, r#"{"draft":{"name":"x","scenes":[]}}"#).unwrap();
        let o = root.join("a.mp4");
        assert!(usage(&["render", draft.to_str().unwrap(), "--out", o.to_str().unwrap()]).contains("this is a draft"));
        fs::write(project.join("project.json"), r#"{"draft":{"name":"x","scenes":[]}}"#).unwrap();
        assert!(usage(&["render", project.to_str().unwrap(), "--out", o.to_str().unwrap()]).contains("this is a draft"));
    }

    #[test]
    fn an_existing_out_needs_force() {
        let (root, project) = with_project("force");
        let p = project.to_str().unwrap();
        let out = root.join("a.mp4");
        fs::write(&out, b"old").unwrap();
        assert!(usage(&["render", p, "--out", out.to_str().unwrap()]).contains("--force"));
        assert_eq!(render(&cli(&["render", p, "--out", out.to_str().unwrap(), "--force"])).1, out.as_path());
        let frames = root.join("frames");
        fs::create_dir_all(&frames).unwrap();
        assert!(usage(&["render", p, "--out", frames.to_str().unwrap()]).contains("--force"));
        assert!(usage(&["render", p, "--out", frames.to_str().unwrap(), "--format", "mp4", "--force"]).contains("is a folder"));
        assert!(usage(&["render", p, "--out", out.to_str().unwrap(), "--format", "png-sequence", "--force"]).contains("is a file"));
    }

    #[test]
    fn a_usage_error_still_writes_a_result() {
        let (root, project) = with_project("result");
        let result = root.join("r.json");
        match parse(argv(&["render", project.to_str().unwrap(), "--result", result.to_str().unwrap()])) {
            Launch::Exit { code: 2, stdout, result: Some(path), .. } => {
                assert_eq!(path, result);
                let doc: Value = serde_json::from_str(&stdout).unwrap();
                assert_eq!(doc["ok"], false);
                assert_eq!(doc["command"], "render");
                assert_eq!(doc["schema"], RESULT_SCHEMA);
                assert!(doc["error"].as_str().unwrap().contains("needs --out"));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn stills_defaults() {
        let (root, project) = with_project("stills-defaults");
        let out = root.join("stills");
        let c = cli(&["stills", project.to_str().unwrap(), "--out", out.to_str().unwrap()]);
        assert_eq!(stills(&c), (project.as_path(), out.as_path(), &Frames::Keyword("auto"), 0.5, 0.25));
        // The job the frontend gets: camelCase fields, frames as the keyword.
        let json = serde_json::to_value(&c.job).unwrap();
        assert_eq!(json["command"], "stills");
        assert_eq!(json["frames"], "auto");
        assert_eq!(json["sheetScale"], 0.25);
    }

    #[test]
    fn stills_frames_and_scales() {
        let (root, project) = with_project("stills-frames");
        let (p, o) = (project.to_str().unwrap(), root.join("stills"));
        let o = o.to_str().unwrap();
        let c = cli(&["stills", p, "--out", o, "--frames", "0, 12,90", "--scale=1", "--sheet-scale", "0.1"]);
        assert_eq!(stills(&c).2, &Frames::List(vec![0, 12, 90]));
        assert_eq!(serde_json::to_value(&c.job).unwrap()["frames"], json!([0, 12, 90]));
        assert_eq!((stills(&c).3, stills(&c).4), (1.0, 0.1));
        assert_eq!(stills(&cli(&["stills", p, "--out", o, "--frames", "all"])).2, &Frames::Keyword("all"));
        for bad in ["", "first", "1,,2", "-1", "1.5"] {
            assert!(usage(&["stills", p, "--out", o, "--frames", bad]).contains("--frames takes"), "{bad:?}");
        }
        for bad in ["0", "1.5", "-0.5", "half", "NaN"] {
            assert!(usage(&["stills", p, "--out", o, "--scale", bad]).contains("--scale must be"), "{bad:?}");
        }
    }

    #[test]
    fn stills_reuse_their_folder_but_not_a_file() {
        let (root, project) = with_project("stills-out");
        let p = project.to_str().unwrap();
        let out = root.join("stills");
        fs::create_dir_all(&out).unwrap();
        assert_eq!(stills(&cli(&["stills", p, "--out", out.to_str().unwrap()])).1, out.as_path());
        let file = root.join("sheet.png");
        fs::write(&file, b"png").unwrap();
        assert!(usage(&["stills", p, "--out", file.to_str().unwrap()]).contains("stills need a folder"));
        assert!(usage(&["stills", p]).contains("stills needs --out"));
    }

    #[test]
    fn options_belong_to_their_command() {
        let (root, project) = with_project("belong");
        let p = project.to_str().unwrap();
        let o = root.join("x");
        let o = o.to_str().unwrap();
        assert!(usage(&["stills", p, "--out", o, "--format", "mp4"]).contains("--format doesn't apply to stills"));
        assert!(usage(&["stills", p, "--out", o, "--force"]).contains("--force doesn't apply to stills"));
        assert!(usage(&["render", p, "--out", o, "--frames", "auto"]).contains("--frames doesn't apply to render"));
    }

    #[test]
    fn check_takes_only_frames() {
        let (root, project) = with_project("check");
        let p = project.to_str().unwrap();
        let c = cli(&["check", p]);
        assert_eq!(c.job, Job::Check { project: project.clone(), frames: Frames::Keyword("auto") });
        let json = serde_json::to_value(&c.job).unwrap();
        assert_eq!((json["command"].as_str(), json["frames"].as_str()), (Some("check"), Some("auto")));
        assert_eq!(cli(&["check", p, "--frames", "all"]).job, Job::Check { project: project.clone(), frames: Frames::Keyword("all") });
        let out = root.join("x");
        assert!(usage(&["check", p, "--out", out.to_str().unwrap()]).contains("--out doesn't apply to check"));
        assert!(usage(&["check", p, "--frames", "soon"]).contains("--frames takes"));
        assert!(usage(&["check"]).contains("check needs a <project>"));
    }

    #[test]
    fn automatch_layer_and_write() {
        let (_root, project) = with_project("automatch");
        let p = project.to_str().unwrap();
        assert_eq!(cli(&["automatch", p]).job, Job::Automatch { project: project.clone(), layer: None, write: false });
        let c = cli(&["automatch", p, "--layer", "Before / after", "--write"]);
        assert_eq!(c.job, Job::Automatch { project: project.clone(), layer: Some("Before / after".into()), write: true });
        let json = serde_json::to_value(&c.job).unwrap();
        assert_eq!((json["command"].as_str(), json["layer"].as_str(), json["write"].as_bool()), (Some("automatch"), Some("Before / after"), Some(true)));
        assert!(usage(&["automatch", p, "--layer"]).contains("--layer needs a value"));
        assert!(usage(&["automatch", p, "--frames", "auto"]).contains("--frames doesn't apply to automatch"));
        assert!(usage(&["check", p, "--write"]).contains("--write doesn't apply to check"));
    }
}
