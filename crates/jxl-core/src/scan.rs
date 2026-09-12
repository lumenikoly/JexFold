use std::{collections::{HashMap, HashSet}, fs, path::{Path, PathBuf}};
use walkdir::WalkDir;
use crate::{Control, ConversionMode, Error, Result, ScanResult, SourceFile};

const MAX_FILES: usize = 250_000;
const MAX_WARNINGS: usize = 100;

fn is_jpeg(path: &Path) -> bool {
    path.extension().and_then(|s| s.to_str())
        .is_some_and(|s| s.eq_ignore_ascii_case("jpg") || s.eq_ignore_ascii_case("jpeg"))
}

fn is_source(path: &Path, mode: ConversionMode) -> bool {
    match mode {
        ConversionMode::JpegToJxl => is_jpeg(path),
        ConversionMode::JxlToJpeg => path.extension().and_then(|s| s.to_str()).is_some_and(|s| s.eq_ignore_ascii_case("jxl")),
    }
}

fn warning(result: &mut ScanResult, message: String) {
    result.warning_count += 1;
    if result.warnings.len() < MAX_WARNINGS { result.warnings.push(message); }
}

/// Scans regular files matching the selected conversion mode; never follows symlinks. Input roots are
/// canonicalized/deduplicated. A failed entry is reported, not silently ignored.
pub fn scan_sources(inputs: &[PathBuf], mode: ConversionMode, control: &Control) -> Result<ScanResult> {
    if inputs.is_empty() { return Err(Error::Invalid("Выберите файлы или папку".into())); }
    let mut roots = Vec::new();
    let mut seen_roots = HashSet::new();
    for input in inputs {
        control.check()?;
        if !input.is_absolute() {
            return Err(Error::Invalid("Ожидается абсолютный путь".into()));
        }
        if fs::symlink_metadata(input)?.file_type().is_symlink() {
            return Err(Error::Invalid(format!("Символическая ссылка не поддерживается: {}", input.display())));
        }
        let path = fs::canonicalize(input)?;
        if path.to_str().is_none() {
            return Err(Error::Invalid("Имена файлов должны быть представимы в UTF-8".into()));
        }
        if seen_roots.insert(path.clone()) { roots.push(path); }
    }
    roots.sort();
    // Keep only outermost directory roots, so overlapping selections don't
    // produce duplicate work or unpredictable output paths.
    let directory_roots: Vec<_> = roots.iter().filter(|p| p.is_dir()).cloned().collect();
    roots.retain(|path| !directory_roots.iter().any(|d| d != path && path.starts_with(d)));
    let mut result = ScanResult {
        directory_roots: roots.iter().filter(|p| p.is_dir()).cloned().collect(),
        roots: roots.clone(), files: Vec::new(), warnings: Vec::new(), warning_count: 0, total_bytes: 0, mode,
    };
    let mut seen = HashSet::new();
    let mut labels: HashMap<PathBuf, String> = HashMap::new();
    let mut used_labels = HashSet::new();
    for root in roots {
        control.check()?;
        let parent = root.parent().ok_or_else(|| Error::Invalid("Выберите папку, а не корень диска".into()))?;
        let base = if root.is_dir() { &root } else { parent };
        let name = base.file_name().and_then(|s| s.to_str()).unwrap_or("files");
        let label = labels.entry(base.to_path_buf()).or_insert_with(|| {
            let mut label = name.to_owned();
            let mut suffix = 2;
            while !used_labels.insert(label.to_lowercase()) {
                label = format!("{name} ({suffix})");
                suffix += 1;
            }
            label
        }).clone();
        if root.is_file() {
            let relative = PathBuf::from(&label).join(root.file_name().ok_or_else(|| Error::Invalid("Некорректное имя".into()))?);
            add_file(&root, relative, mode, &mut result, &mut seen)?;
            continue;
        }
        if !root.is_dir() {
            warning(&mut result, format!("Необычный тип файла: {}", root.display()));
            continue;
        }
        for entry in WalkDir::new(&root).follow_links(false).sort_by_file_name() {
            control.check()?;
            match entry {
                Ok(entry) if entry.file_type().is_symlink() => {
                    warning(&mut result, format!("Ссылка пропущена: {}", entry.path().display()));
                }
                Ok(entry) if entry.file_type().is_file() && is_source(entry.path(), mode) => {
                    let relative = PathBuf::from(&label).join(entry.path().strip_prefix(&root)
                        .map_err(|_| Error::Invalid("Файл вне выбранного каталога".into()))?);
                    if let Err(error) = add_file(entry.path(), relative, mode, &mut result, &mut seen) {
                        if matches!(error, Error::Invalid(_)) { return Err(error); }
                        warning(&mut result, format!("{}: {error}", entry.path().display()));
                    }
                }
                Ok(_) => {},
                Err(error) => warning(&mut result, error.to_string()),
            }
        }
    }
    if result.files.is_empty() { return Err(Error::Invalid(format!("В выбранных источниках нет доступных {}", if mode == ConversionMode::JpegToJxl { "JPEG" } else { "JXL" }))); }
    Ok(result)
}

fn add_file(path: &Path, relative: PathBuf, mode: ConversionMode, result: &mut ScanResult, seen: &mut HashSet<PathBuf>) -> Result<()> {
    if !is_source(path, mode) { return Ok(()); }
    if !seen.insert(path.to_path_buf()) { return Ok(()); }
    if path.to_str().is_none() || relative.to_str().is_none() {
        return Err(Error::Invalid(format!("Путь не представлен в UTF-8: {}", path.display())));
    }
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() { return Ok(()); }
    if result.files.len() >= MAX_FILES {
        return Err(Error::Invalid(format!("В одной очереди допускается до {MAX_FILES} файлов. Выберите меньшую папку.")));
    }
    result.total_bytes = result.total_bytes.checked_add(metadata.len())
        .ok_or_else(|| Error::Invalid("Переполнение общего размера".into()))?;
    result.files.push(SourceFile {
        id: result.files.len(), source: path.to_path_buf(), relative,
        size: metadata.len(), modified: metadata.modified().ok(),
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recursive_dedup_and_extensions() {
        let t = tempfile::tempdir().unwrap();
        let src = t.path().join("photos");
        fs::create_dir_all(src.join("2025")).unwrap();
        fs::write(src.join("a.JPG"), b"abc").unwrap();
        fs::write(src.join("2025/b.jpeg"), b"1234").unwrap();
        fs::write(src.join("ignored.png"), b"png").unwrap();
        let scan = scan_sources(&[src.clone(), src.join("2025")], ConversionMode::JpegToJxl, &Control::default()).unwrap();
        assert_eq!(scan.files.len(), 2);
        assert_eq!(scan.total_bytes, 7);
        assert_eq!(scan.files[0].relative, PathBuf::from("photos/2025/b.jpeg"));
    }
    #[test]
    fn cancellation_stops_scanning() {
        let c = Control::default(); c.cancel();
        assert!(matches!(scan_sources(&[PathBuf::from("/tmp")], ConversionMode::JpegToJxl, &c), Err(Error::Cancelled)));
    }
    #[cfg(unix)]
    #[test]
    fn does_not_follow_symlinks() {
        let t = tempfile::tempdir().unwrap();
        fs::write(t.path().join("a.jpg"), b"a").unwrap();
        std::os::unix::fs::symlink(t.path().join("a.jpg"), t.path().join("link.jpg")).unwrap();
        let s = scan_sources(&[t.path().to_path_buf()], ConversionMode::JpegToJxl, &Control::default()).unwrap();
        assert_eq!(s.files.len(), 1);
        assert_eq!(s.warning_count, 1);
    }
    #[test]
    fn separately_selected_files_keep_one_parent_label() {
        let dir = tempfile::tempdir().unwrap();
        let photos = dir.path().join("photos");
        fs::create_dir(&photos).unwrap();
        let a = photos.join("a.jpg"); let b = photos.join("b.jpeg");
        fs::write(&a, b"a").unwrap(); fs::write(&b, b"b").unwrap();
        let scan = scan_sources(&[a, b], ConversionMode::JpegToJxl, &Control::default()).unwrap();
        assert_eq!(scan.files[0].relative, PathBuf::from("photos/a.jpg"));
        assert_eq!(scan.files[1].relative, PathBuf::from("photos/b.jpeg"));
    }

    #[test]
    fn jxl_mode_only_scans_jxl() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("photo.JXL"), b"jxl").unwrap();
        fs::write(dir.path().join("photo.jpg"), b"jpeg").unwrap();
        let scan = scan_sources(&[dir.path().to_path_buf()], ConversionMode::JxlToJpeg, &Control::default()).unwrap();
        assert_eq!(scan.files.len(), 1);
        assert_eq!(scan.files[0].relative, PathBuf::from(format!("{}/photo.JXL", dir.path().file_name().unwrap().to_string_lossy())));
        assert_eq!(scan.mode, ConversionMode::JxlToJpeg);
    }

}
