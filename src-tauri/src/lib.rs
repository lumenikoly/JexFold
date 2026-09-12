#![forbid(unsafe_code)]
mod commands;
mod session;

use tauri::{Emitter, Manager};
use session::AppState;

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::scan_sources, commands::probe_tools, commands::convert,
            commands::cancel, commands::set_paused,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<AppState>().session.is_busy() {
                    api.prevent_close();
                    let _ = window.emit("operation-active", ());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Не удалось запустить JexFold");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if app.state::<AppState>().session.is_busy() {
                api.prevent_exit();
                let _ = app.emit("operation-active", ());
            }
        }
    });
}
