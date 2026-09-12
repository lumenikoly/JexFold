use std::path::PathBuf;
use tauri::{ipc::Channel, path::BaseDirectory, AppHandle, Manager, State};
use jxl_core::{ConversionMode, Options, Progress, ScanResult, Summary, ToolInfo, Toolchain};
use crate::session::AppState;

#[tauri::command]
pub async fn scan_sources(paths: Vec<PathBuf>, mode: ConversionMode, state: State<'_, AppState>) -> Result<ScanResult, String> {
    let session = state.session.clone();
    let operation = session.begin()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        // A failed rescan must never leave an older hidden plan available.
        *session.scan.lock().map_err(|_| "Сбой состояния очереди")? = None;
        let result = jxl_core::scan_sources(&paths, mode, &_operation.control).map_err(|e| e.to_string())?;
        *session.scan.lock().map_err(|_| "Сбой состояния очереди")? = Some(result.clone());
        Ok(result)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn probe_tools(directory: Option<PathBuf>, app: AppHandle, state: State<'_, AppState>) -> Result<ToolInfo, String> {
    let session = state.session.clone();
    let operation = session.begin()?;
    let mut candidates = Vec::new();
    if let Some(directory) = directory { candidates.push(directory); }
    else {
        if let Ok(path) = app.path().resolve("codecs", BaseDirectory::Resource) { candidates.push(path); }
        #[cfg(debug_assertions)]
        candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/codecs"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        *session.tools.lock().map_err(|_| "Сбой состояния кодека")? = None;
        let mut messages = Vec::new();
        for directory in candidates {
            let result = Toolchain::from_directory(&directory).and_then(|tools| {
                let info = tools.probe(&_operation.control)?;
                Ok((tools, info))
            });
            match result {
                Ok((tools, info)) => {
                    *session.tools.lock().map_err(|_| "Сбой состояния кодека")? = Some(tools);
                    return Ok(info);
                }
                Err(error) => messages.push(format!("{}: {error}", directory.display())),
            }
        }
        Err(format!("Кодек не готов. Соберите его командой npm run codecs:build или выберите папку с libjxl 0.12+.\n{}", messages.join("\n")))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn convert(options: Options, on_event: Channel<Progress>, state: State<'_, AppState>) -> Result<Summary, String> {
    let session = state.session.clone();
    let operation = session.begin()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        // The plan is server-owned. The UI never supplies individual output
        // paths or arbitrary executable arguments.
        let scan = session.scan.lock().map_err(|_| "Сбой очереди")?.clone().ok_or("Сначала выберите JPEG")?;
        let tools = session.tools.lock().map_err(|_| "Сбой кодека")?.clone().ok_or("Кодек не настроен")?;
        jxl_core::run_batch(&scan, &options, &tools, &_operation.control, |event| {
            if on_event.send(event).is_err() { _operation.control.cancel(); }
        }).map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel(state: State<'_, AppState>) -> Result<(), String> {
    let control = state.session.control.lock().map_err(|_| "Сбой состояния операции")?;
    if !state.session.is_busy() { return Err("Операция ещё не запущена или уже завершена".into()); }
    control.cancel();
    Ok(())
}

#[tauri::command]
pub fn set_paused(paused: bool, state: State<'_, AppState>) -> Result<(), String> {
    let control = state.session.control.lock().map_err(|_| "Сбой состояния операции")?;
    if !state.session.is_busy() { return Err("Нет выполняющейся операции".into()); }
    control.set_paused(paused);
    Ok(())
}
