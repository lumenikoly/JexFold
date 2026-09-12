use std::{collections::HashSet, fs::{self, File}, io::Write,
    sync::{atomic::{AtomicUsize, Ordering}, mpsc}, thread, time::Instant};
use crate::{convert::convert_one, files, Control, Error, ItemStatus, Options, Progress, Result, ScanResult, Summary, Toolchain};

struct CancelOnPanic<'a>(&'a Control);
impl Drop for CancelOnPanic<'_> {
    fn drop(&mut self) { if thread::panicking() { self.0.cancel(); } }
}

/// A single append-only JSONL report is owned by the coordinator (not workers).
/// The report records completed files before sending completion to the GUI.
pub fn run_batch(
    scan: &ScanResult, options: &Options, tools: &Toolchain,
    control: &Control, mut notify: impl FnMut(Progress),
) -> Result<Summary> {
    control.check()?;
    if !(3..=9).contains(&options.effort) { return Err(Error::Invalid("Усилие сжатия должно быть от 3 до 9".into())); }
    if scan.files.is_empty() { return Err(Error::Invalid("Очередь пуста".into())); }
    if !options.output_dir.is_absolute() { return Err(Error::Invalid("Выберите абсолютный путь назначения".into())); }
    let root = fs::canonicalize(&options.output_dir)?;
    if !root.is_dir() { return Err(Error::Invalid("Папка назначения не существует".into())); }
    for source_root in &scan.directory_roots {
        if root.starts_with(source_root) || source_root.starts_with(&root) {
            return Err(Error::Invalid("Папки источника и назначения не должны быть вложены друг в друга. Выберите отдельную соседнюю папку.".into()));
        }
    }
    let mut destinations = HashSet::new();
    for source in &scan.files {
        let rel = files::output_relative(&source.relative)?;
        // Conservative cross-platform collision handling, even on Linux.
        if !destinations.insert(rel.to_string_lossy().to_lowercase()) {
            return Err(Error::Invalid(format!("Конфликт имён назначения: {}. Обработайте источники отдельно.", rel.display())));
        }
    }
    tools.probe(control)?;
    let mut report = tempfile::Builder::new().prefix("jxl-report-").suffix(".jsonl").tempfile_in(&root)?;
    let header = serde_json::json!({"type": "header", "schemaVersion": 1, "appVersion": env!("CARGO_PKG_VERSION"),
        "options": options, "roots": scan.roots, "fileCount": scan.files.len(),
        "createdUnixSeconds": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs()});
    writeln!(report, "{header}")?;
    report.as_file().sync_data()?;
    // Keep the report from the beginning: a crash should retain completed records.
    let (mut report, report_path) = report.keep().map_err(|e| Error::Report(e.error.to_string()))?;
    let started = Instant::now();
    let cpus = thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
    let (workers, threads) = options.performance.budget(cpus);
    let next = AtomicUsize::new(0);
    let mut summary = Summary { total: scan.files.len(), report_path, ..Summary::default() };
    let mut report_error = None;
    let mut worker_panic = false;
    thread::scope(|scope| {
        let _panic_guard = CancelOnPanic(control);
        let (sender, receiver) = mpsc::sync_channel::<Progress>(64);
        let mut handles = Vec::new();
        for _ in 0..workers.min(scan.files.len()) {
            let sender = sender.clone();
            let root = &root;
            let next = &next;
            handles.push(scope.spawn(move || {
                let _panic_guard = CancelOnPanic(control);
                while control.wait_until_ready().is_ok() {
                    let index = next.fetch_add(1, Ordering::Relaxed);
                    let Some(source) = scan.files.get(index) else { break; };
                    let emit = |event| { let _ = sender.send(event); };
                    let result = convert_one(source, root, options, tools, threads, control, &emit);
                    if sender.send(Progress::Item { result }).is_err() { break; }
                }
            }));
        }
        drop(sender);
        // Always drain, including after a report write fails, to avoid deadlock.
        for event in receiver {
            if let Progress::Item { result } = &event {
                match result.status {
                    ItemStatus::Converted => {
                        summary.converted += 1;
                        summary.input_bytes += result.input_bytes;
                        summary.output_bytes += result.output_bytes.unwrap_or(0);
                    },
                    ItemStatus::Existing => summary.existing += 1,
                    ItemStatus::NotSmaller => summary.not_smaller += 1,
                    ItemStatus::Failed => summary.failed += 1,
                    ItemStatus::Cancelled => summary.cancelled += 1,
                }
                if report_error.is_none() {
                    if let Err(error) = write_record(&mut report, &event) {
                        report_error = Some(error.to_string()); control.cancel();
                    }
                }
            }
            notify(event);
        }
        for handle in handles {
            if handle.join().is_err() { worker_panic = true; control.cancel(); }
        }
    });
    summary.not_started = summary.total.saturating_sub(summary.converted + summary.existing + summary.not_smaller + summary.failed + summary.cancelled);
    summary.elapsed_ms = started.elapsed().as_millis() as u64;
    summary.was_cancelled = control.is_cancelled();
    if let Some(message) = report_error { return Err(Error::Report(message)); }
    write_record(&mut report, &serde_json::json!({ "type": "summary", "summary": summary }))?;
    if worker_panic { return Err(Error::Invalid(format!("Сбой рабочего потока. Уже созданные файлы сохранены. Отчёт: {}", summary.report_path.display()))); }
    Ok(summary)
}

fn write_record(writer: &mut File, value: &impl serde::Serialize) -> Result<()> {
    serde_json::to_writer(&mut *writer, value).map_err(|e| Error::Report(e.to_string()))?;
    writer.write_all(b"\n").map_err(|e| Error::Report(e.to_string()))?;
    writer.sync_data().map_err(|e| Error::Report(e.to_string()))?;
    Ok(())
}
