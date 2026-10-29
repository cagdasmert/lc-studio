mod cli;
mod e2e;
mod project_scope;
mod render;

use render::job::RenderState;
use std::sync::Mutex;
use tauri::Manager;

/// The main window, built here rather than from tauri.conf.json (which has
/// `create: false`) so a command-line run can start it hidden. A hidden page
/// is otherwise suspended, so throttling has to be off; macOS still renders it
/// about 3.3× slower than a visible one, which is accepted (see the CLI spec, §10).
fn build_main_window(app: &mut tauri::App, cli: Option<&cli::Cli>) -> tauri::Result<()> {
    let config = app.config().app.windows.first().cloned().expect("a window in tauri.conf.json");
    let hidden = cli.is_some_and(|c| !c.show);
    // No Dock icon. Set before the builder borrows the app.
    #[cfg(target_os = "macos")]
    if hidden {
        app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    }
    let mut builder = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?;
    if hidden {
        builder = builder
            .visible(false)
            .focused(false)
            .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled);
    }
    builder.build()?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cli = match cli::parse(std::env::args_os()) {
        cli::Launch::Gui => None,
        cli::Launch::Cli(cli) => Some(cli),
        cli::Launch::Exit { code, stdout, stderr, result } => cli::exit_early(code, &stdout, &stderr, result.as_deref()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .manage(RenderState {
            active_job: Mutex::new(None),
        })
        .manage(cli::CliState::new(cli))
        .setup(|app| {
            let cli = app.state::<cli::CliState>().cli.clone();
            build_main_window(app, cli.as_ref())?;
            if cli.is_some() {
                cli::start_watchdog(app.handle().clone());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            project_scope::allow_project_dir,
            render::commands::check_ffmpeg,
            render::commands::start_render,
            render::commands::write_frame,
            render::commands::finish_render,
            render::commands::cancel_render,
            e2e::e2e_script,
            e2e::e2e_finish,
            cli::cli_job,
            cli::cli_progress,
            cli::cli_finish,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
