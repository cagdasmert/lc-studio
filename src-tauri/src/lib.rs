mod render;

use render::job::RenderState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .manage(RenderState {
            active_job: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            render::commands::check_ffmpeg,
            render::commands::start_render,
            render::commands::write_frame,
            render::commands::finish_render,
            render::commands::cancel_render,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
