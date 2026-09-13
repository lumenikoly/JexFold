use crate::{
    convert::convert_one, files, Control, ConversionMode, Error, ItemStatus, Options, Progress,
    Result, ScanResult, Summary, Toolchain,
};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc,
    },
    thread,
    time::Instant,
};

struct CancelOnPanic<'a>(&'a Control);
impl Drop for CancelOnPanic<'_> {
    fn drop(&mut self) {
        if thread::panicking() {
            self.0.cancel();
        }
    }
}

fn default_source_root(scan: &ScanResult, output_root: &Path) -> Option<PathBuf> {
    if scan.directory_roots.len() == 1 {
        let source_root = &scan.directory_roots[0];
        if output_root == source_root.join("jxl") {
            return Some(source_root.clone());
        }
    }
    if scan.directory_roots.is_empty() {
        let parent = scan.files.first()?.source.parent()?;
        if scan
            .files
            .iter()
            .all(|file| file.source.parent() == Some(parent))
            && output_root == parent.join("jxl")
        {
            return Some(parent.to_path_buf());
        }
    }
    None
}

fn default_output_candidate(scan: &ScanResult) -> Option<(PathBuf, PathBuf)> {
    if scan.directory_roots.len() == 1 {
        let source = scan.directory_roots[0].clone();
        return Some((source.join("jxl"), source));
    }
    if scan.directory_roots.is_empty() {
        let parent = scan.files.first()?.source.parent()?.to_path_buf();
        if scan
            .files
            .iter()
            .all(|file| file.source.parent() == Some(parent.as_path()))
        {
            return Some((parent.join("jxl"), parent));
        }
    }
    None
}

fn output_source(source: &crate::SourceFile, source_root: Option<&Path>) -> crate::SourceFile {
    let Some(source_root) = source_root else {
        return source.clone();
    };
    let relative = source
        .source
        .strip_prefix(source_root)
        .unwrap_or(&source.relative)
        .to_path_buf();
    crate::SourceFile {
        relative,
        ..source.clone()
    }
}

pub fn run_batch(
    scan: &ScanResult,
    options: &Options,
    tools: &Toolchain,
    control: &Control,
    mut notify: impl FnMut(Progress),
) -> Result<Summary> {
    control.check()?;
    if options.mode != scan.mode {
        return Err(Error::Invalid(
            "Режим изменился после выбора файлов. Выберите источники заново.".into(),
        ));
    }
    if options.mode == ConversionMode::JpegToJxl && !(3..=9).contains(&options.effort) {
        return Err(Error::Invalid("Усилие сжатия должно быть от 3 до 9".into()));
    }
    if scan.files.is_empty() {
        return Err(Error::Invalid("Очередь пуста".into()));
    }
    if !options.output_dir.is_absolute() {
        return Err(Error::Invalid("Выберите абсолютный путь назначения".into()));
    }
    if !options.output_dir.exists() {
        let allowed = default_output_candidate(scan)
            .is_some_and(|(candidate, _)| candidate == options.output_dir);
        if !allowed {
            return Err(Error::Invalid("Папка назначения не существует".into()));
        }
        fs::create_dir(&options.output_dir)?;
    }
    let root = fs::canonicalize(&options.output_dir)?;
    if !root.is_dir() {
        return Err(Error::Invalid("Папка назначения не существует".into()));
    }
    let default_source = default_source_root(scan, &root);
    for source_root in &scan.directory_roots {
        if (root.starts_with(source_root) || source_root.starts_with(&root))
            && default_source.as_deref() != Some(source_root)
        {
            return Err(Error::Invalid("Папки источника и назначения не должны быть вложены друг в друга. Выберите отдельную соседнюю папку.".into()));
        }
    }
    let mut destinations = HashSet::new();
    for source in &scan.files {
        let source = output_source(source, default_source.as_deref());
        let rel = files::output_relative(&source.relative, options.mode)?;
        // Conservative cross-platform collision handling, even on Linux.
        if !destinations.insert(rel.to_string_lossy().to_lowercase()) {
            return Err(Error::Invalid(format!(
                "Конфликт имён назначения: {}. Обработайте источники отдельно.",
                rel.display()
            )));
        }
    }
    tools.probe(control)?;
    let started = Instant::now();
    let cpus = thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let (workers, threads) = options.performance.budget(cpus);
    let next = AtomicUsize::new(0);
    let mut summary = Summary {
        total: scan.files.len(),
        ..Summary::default()
    };
    let mut worker_panic = false;
    thread::scope(|scope| {
        let _panic_guard = CancelOnPanic(control);
        let (sender, receiver) = mpsc::sync_channel::<Progress>(64);
        let mut handles = Vec::new();
        for _ in 0..workers.min(scan.files.len()) {
            let sender = sender.clone();
            let root = &root;
            let next = &next;
            let default_source = &default_source;
            handles.push(scope.spawn(move || {
                let _panic_guard = CancelOnPanic(control);
                while control.wait_until_ready().is_ok() {
                    let index = next.fetch_add(1, Ordering::Relaxed);
                    let Some(source) = scan.files.get(index) else {
                        break;
                    };
                    let emit = |event| {
                        let _ = sender.send(event);
                    };
                    let output_source = output_source(source, default_source.as_deref());
                    let result = convert_one(
                        &output_source,
                        root,
                        options,
                        tools,
                        threads,
                        control,
                        &emit,
                    );
                    if sender.send(Progress::Item { result }).is_err() {
                        break;
                    }
                }
            }));
        }
        drop(sender);
        for event in receiver {
            if let Progress::Item { result } = &event {
                match result.status {
                    ItemStatus::Converted => {
                        summary.converted += 1;
                        summary.input_bytes += result.input_bytes;
                        summary.output_bytes += result.output_bytes.unwrap_or(0);
                    }
                    ItemStatus::Existing => summary.existing += 1,
                    ItemStatus::NotSmaller => summary.not_smaller += 1,
                    ItemStatus::Failed => summary.failed += 1,
                    ItemStatus::Cancelled => summary.cancelled += 1,
                }
            }
            notify(event);
        }
        for handle in handles {
            if handle.join().is_err() {
                worker_panic = true;
                control.cancel();
            }
        }
    });
    summary.not_started = summary.total.saturating_sub(
        summary.converted
            + summary.existing
            + summary.not_smaller
            + summary.failed
            + summary.cancelled,
    );
    summary.elapsed_ms = started.elapsed().as_millis() as u64;
    summary.was_cancelled = control.is_cancelled();
    if worker_panic {
        return Err(Error::Invalid(
            "Сбой рабочего потока. Уже созданные файлы сохранены.".into(),
        ));
    }
    Ok(summary)
}
