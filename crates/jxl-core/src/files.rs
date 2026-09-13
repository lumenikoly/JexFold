use sha2::{Digest, Sha256};
use std::{fs::{self, File}, io::{Read, Write}, path::{Component, Path, PathBuf}};
use crate::{Control, ConversionMode, Error, Result, SourceFile};

pub(crate) fn output_relative(relative: &Path, mode: ConversionMode) -> Result<PathBuf> {
    if relative.as_os_str().is_empty() || relative.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(Error::Invalid("Небезопасный относительный путь".into()));
    }
    match mode {
        ConversionMode::JpegToJxl => {
            let mut result = relative.to_path_buf();
            result.set_extension("jxl");
            Ok(result)
        }
        ConversionMode::JxlToJpeg => {
            let mut result = relative.to_path_buf();
            result.set_extension("");
            if !result.extension().and_then(|s| s.to_str()).is_some_and(|s| s.eq_ignore_ascii_case("jpg") || s.eq_ignore_ascii_case("jpeg")) { result.set_extension("jpg"); }
            Ok(result)
        }
    }
}

/// Create parents one at a time, refusing symlinks and non-directories.
/// The selected destination is assumed to be controlled by the local user,
/// not concurrently mutated by an adversarial process (see SECURITY.md).
pub(crate) fn safe_parent(root: &Path, relative: &Path) -> Result<PathBuf> {
    let mut current = root.to_path_buf();
    let parent = relative.parent().ok_or_else(|| Error::Invalid("Нет родительской папки".into()))?;
    for part in parent.components() {
        let Component::Normal(name) = part else { return Err(Error::Invalid("Небезопасный путь".into())); };
        current.push(name);
        match fs::create_dir(&current) {
            Ok(()) => {},
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {},
            Err(e) => return Err(e.into()),
        }
        let meta = fs::symlink_metadata(&current)?;
        if meta.file_type().is_symlink() || !meta.is_dir() {
            return Err(Error::Invalid(format!("Папка назначения является ссылкой или не каталогом: {}", current.display())));
        }
        if !fs::canonicalize(&current)?.starts_with(root) {
            return Err(Error::Invalid("Папка назначения вышла за выбранный корень".into()));
        }
    }
    Ok(current)
}

pub(crate) fn ensure_stamp(source: &SourceFile) -> Result<()> {
    let meta = fs::symlink_metadata(&source.source)?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() != source.size || meta.modified().ok() != source.modified {
        return Err(Error::SourceChanged);
    }
    Ok(())
}

/// Streaming snapshot and SHA-256. Memory is independent of input file size.
pub(crate) fn snapshot(source: &Path, destination: &Path, control: &Control) -> Result<String> {
    let mut input = File::open(source)?;
    let mut output = File::options().create_new(true).write(true).open(destination)?;
    let mut hash = Sha256::new();
    let mut buffer = vec![0_u8; 256 * 1024];
    loop {
        control.check()?;
        let len = input.read(&mut buffer)?;
        if len == 0 { break; }
        output.write_all(&buffer[..len])?;
        hash.update(&buffer[..len]);
    }
    output.flush()?;
    Ok(format!("{:x}", hash.finalize()))
}

pub(crate) fn equal_files(a: &Path, b: &Path, control: &Control) -> Result<bool> {
    let mut a = File::open(a)?;
    let mut b = File::open(b)?;
    let len = a.metadata()?.len();
    if len != b.metadata()?.len() { return Ok(false); }
    let mut left = vec![0_u8; 256 * 1024];
    let mut right = vec![0_u8; 256 * 1024];
    let mut remaining = len;
    while remaining != 0 {
        control.check()?;
        let count = remaining.min(left.len() as u64) as usize;
        a.read_exact(&mut left[..count])?;
        b.read_exact(&mut right[..count])?;
        if left[..count] != right[..count] { return Ok(false); }
        remaining -= count as u64;
    }
    // Catch a concurrent append as well as initial length mismatches.
    let mut byte = [0_u8; 1];
    Ok(a.read(&mut byte)? == 0 && b.read(&mut byte)? == 0)
}

/// Atomic, no-clobber publication. A hard link makes the complete, synced
/// file visible, and fails if the target exists. No unsafe overwrite fallback.
pub(crate) fn publish(stage: &Path, target: &Path) -> Result<Option<String>> {
    File::options().read(true).write(true).open(stage)?.sync_all()?;
    fs::hard_link(stage, target).map_err(|e| Error::Invalid(format!(
        "Не удалось безопасно создать {}: {e}. Нужна файловая система с поддержкой жёстких ссылок (например NTFS/APFS/ext4).", target.display()
    )))?;
    #[cfg(unix)]
    if let Some(parent) = target.parent() {
        if let Err(e) = File::open(parent).and_then(|f| f.sync_all()) {
            return Ok(Some(format!("Файл создан, но синхронизация каталога не подтверждена: {e}")));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replaces_jpeg_extension() {
        assert_eq!(output_relative(Path::new("folder/a.jpg"), ConversionMode::JpegToJxl).unwrap(), PathBuf::from("folder/a.jxl"));
        assert_eq!(output_relative(Path::new("folder/a.JPEG"), ConversionMode::JpegToJxl).unwrap(), PathBuf::from("folder/a.jxl"));
        assert_eq!(output_relative(Path::new("folder/a.jpg.jxl"), ConversionMode::JxlToJpeg).unwrap(), PathBuf::from("folder/a.jpg"));
        assert_eq!(output_relative(Path::new("folder/a.jxl"), ConversionMode::JxlToJpeg).unwrap(), PathBuf::from("folder/a.jpg"));
    }
    #[test]
    fn rejects_path_traversal() {
        for path in ["../a.jpg", "/tmp/a.jpg", "a/../../b.jpg", ""] {
            assert!(output_relative(Path::new(path), ConversionMode::JpegToJxl).is_err());
        }
    }
    #[test]
    fn publication_never_overwrites() {
        let temp = tempfile::tempdir().unwrap();
        let stage = temp.path().join("stage"); let dest = temp.path().join("out");
        fs::write(&stage, b"new").unwrap(); fs::write(&dest, b"old").unwrap();
        assert!(publish(&stage, &dest).is_err());
        assert_eq!(fs::read(&dest).unwrap(), b"old");
    }
    #[test]
    fn comparison_checks_every_byte_and_length() {
        let temp = tempfile::tempdir().unwrap();
        let a = temp.path().join("a"); let b = temp.path().join("b");
        fs::write(&a, vec![7; 600_000]).unwrap(); fs::copy(&a, &b).unwrap();
        assert!(equal_files(&a, &b, &Control::default()).unwrap());
        fs::write(&b, vec![8; 600_000]).unwrap();
        assert!(!equal_files(&a, &b, &Control::default()).unwrap());
        fs::write(&b, b"short").unwrap();
        assert!(!equal_files(&a, &b, &Control::default()).unwrap());
    }
    #[cfg(unix)]
    #[test]
    fn rejects_destination_symlink() {
        let temp = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), temp.path().join("linked")).unwrap();
        assert!(safe_parent(temp.path(), Path::new("linked/a.jxl")).is_err());
    }
    #[test]
    fn source_modified_after_scan_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("photo.jpg");
        fs::write(&path, b"original").unwrap();
        let m = fs::metadata(&path).unwrap();
        let source = SourceFile { id: 0, source: path.clone(), relative: "photo.jpg".into(),
            size: m.len(), modified: m.modified().ok() };
        fs::write(&path, b"changed length").unwrap();
        assert!(matches!(ensure_stamp(&source), Err(Error::SourceChanged)));
    }

}
