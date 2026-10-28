//! Scripted end-to-end runs for the acceptance checks in `scripts/e2e/`.
//!
//! Debug builds only. Started with `LCS_E2E=<script.json>`, the frontend asks
//! for the script on startup, runs its jobs in the real webview, hands back
//! the results, and the app quits. Release builds never read the variable.

use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_fs::FsExt;

use crate::cli::CliState;

fn script_path() -> Option<PathBuf> {
    if !cfg!(debug_assertions) {
        return None;
    }
    std::env::var_os("LCS_E2E").map(PathBuf::from)
}

/// The script's JSON, or None on a normal run. Grants the frontend access to
/// the script's folder, which holds the jobs' projects and outputs. A
/// command-line job wins over `LCS_E2E`.
#[tauri::command]
pub fn e2e_script<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    if app.state::<CliState>().cli.is_some() {
        return Ok(None);
    }
    let Some(path) = script_path() else { return Ok(None) };
    let dir = path.parent().ok_or("the e2e script has no folder")?;
    app.fs_scope()
        .allow_directory(dir, true)
        .map_err(|e| format!("could not allow {}: {e}", dir.display()))?;
    std::fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("{}: {e}", path.display()))
}

/// Write the results beside the script as `<name>.result.json`, then quit.
#[tauri::command]
pub fn e2e_finish<R: Runtime>(app: AppHandle<R>, result: String) -> Result<(), String> {
    let path = script_path().ok_or("not an e2e run")?;
    std::fs::write(path.with_extension("result.json"), result).map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}
