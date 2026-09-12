use std::{fs, path::Path, time::{Duration, Instant}};
use crate::{files, process, ConversionMode, Control, Error, ItemResult, ItemStatus, Options, Progress, Result, SourceFile, Stage, Toolchain};

const CODEC_TIMEOUT: Duration = Duration::from_secs(30 * 60);

struct Outcome {
    status: ItemStatus,
    output_bytes: Option<u64>,
    sha256: Option<String>,
    message: Option<String>,
}

pub(crate) fn convert_one(
    source: &SourceFile, root: &Path, options: &Options, tools: &Toolchain,
    threads: usize, control: &Control, notify: &impl Fn(Progress),
) -> ItemResult {
    let start = Instant::now();
    let relative = match files::output_relative(&source.relative, options.mode) {
        Ok(relative) => relative,
        Err(error) => return failed_result(source, root, error, start),
    };
    let target = root.join(&relative);
    let work = || -> Result<Outcome> {
        control.check()?;
        let parent = files::safe_parent(root, &relative)?;
        match fs::symlink_metadata(&target) {
            Ok(_) => return Ok(Outcome { status: ItemStatus::Existing, output_bytes: None, sha256: None, message: Some("Файл уже существует; он не перезаписан и не проверялся".into()) }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {},
            Err(e) => return Err(e.into()),
        }
        files::ensure_stamp(source)?;
        let temp = tempfile::Builder::new().prefix(".jxl-archiver-").tempdir_in(&parent)?;
        let snapshot = temp.path().join(if options.mode == ConversionMode::JpegToJxl { "input.jpg" } else { "input.jxl" });
        let stage = temp.path().join(if options.mode == ConversionMode::JpegToJxl { "encoded.jxl" } else { "restored.jpg" });
        let reconstructed = temp.path().join("verified.jpg");
        let hash = files::snapshot(&source.source, &snapshot, control)?;
        files::ensure_stamp(source)?;
        if options.mode == ConversionMode::JxlToJpeg {
            notify(Progress::Stage { id: source.id, stage: Stage::Decoding });
            process::run(&tools.decoder, &[
                snapshot.as_os_str().into(), stage.as_os_str().into(),
                "--reconstruct_jpeg".into(), format!("--num_threads={threads}").into(),
            ], control, CODEC_TIMEOUT)?;
            let size = fs::metadata(&stage)?.len();
            if size < 3 { return Err(Error::Invalid("Декодер создал пустой или повреждённый JPEG".into())); }
            use std::io::Read;
            let mut signature = [0_u8; 3];
            std::fs::File::open(&stage)?.read_exact(&mut signature)?;
            if signature != [0xff, 0xd8, 0xff] { return Err(Error::Invalid("Результат не содержит сигнатуру JPEG".into())); }
            files::ensure_stamp(source)?;
            if !files::equal_files(&source.source, &snapshot, control)? { return Err(Error::SourceChanged); }
            if options.preserve_mtime { if let Some(modified) = source.modified { filetime::set_file_mtime(&stage, filetime::FileTime::from_system_time(modified))?; } }
            control.check()?;
            let warning = files::publish(&stage, &target)?;
            return Ok(Outcome { status: ItemStatus::Converted, output_bytes: Some(size), sha256: Some(hash), message: warning });
        }
        // Cheap signature check is not a substitute for the codec parser, but
        // prevents accidentally feeding a renamed PNG to a JPEG-only tool.
        {
            use std::io::Read;
            let mut signature = [0_u8; 3];
            std::fs::File::open(&snapshot)?.read_exact(&mut signature)?;
            if signature != [0xff, 0xd8, 0xff] {
                return Err(Error::Invalid("Файл не содержит сигнатуру JPEG".into()));
            }
        }
        notify(Progress::Stage { id: source.id, stage: Stage::Encoding });
        process::run(&tools.encoder, &[
            snapshot.as_os_str().into(), stage.as_os_str().into(),
            "--lossless_jpeg=1".into(), "--allow_jpeg_reconstruction=1".into(),
            format!("--effort={}", options.effort).into(), format!("--num_threads={threads}").into(),
        ], control, CODEC_TIMEOUT)?;
        notify(Progress::Stage { id: source.id, stage: Stage::Verifying });
        process::run(&tools.decoder, &[
            stage.as_os_str().into(), reconstructed.as_os_str().into(),
            "--reconstruct_jpeg".into(), format!("--num_threads={threads}").into(),
        ], control, CODEC_TIMEOUT)?;
        if !files::equal_files(&snapshot, &reconstructed, control)? { return Err(Error::Verification); }
        // Verify against the LIVE source too: a private snapshot alone must
        // not hide that the user edited a photograph while it was processing.
        files::ensure_stamp(source)?;
        if !files::equal_files(&source.source, &snapshot, control)? { return Err(Error::SourceChanged); }
        files::ensure_stamp(source)?;
        let size = fs::metadata(&stage)?.len();
        if size == 0 { return Err(Error::Invalid("Кодек создал пустой файл".into())); }
        if options.skip_larger && size >= source.size {
            return Ok(Outcome { status: ItemStatus::NotSmaller, output_bytes: Some(size), sha256: Some(hash), message: Some("Размер не уменьшился; JXL не сохранён".into()) });
        }
        if options.preserve_mtime {
            if let Some(modified) = source.modified {
                filetime::set_file_mtime(&stage, filetime::FileTime::from_system_time(modified))?;
            }
        }
        control.check()?;
        let warning = files::publish(&stage, &target)?;
        // TempDir now removes snapshot/reconstruction and its link to stage.
        // The final hard link is independent and stays valid.
        Ok(Outcome { status: ItemStatus::Converted, output_bytes: Some(size), sha256: Some(hash), message: warning })
    };
    match work() {
        Ok(Outcome { status, output_bytes, sha256, message }) => ItemResult {
            id: source.id, source: source.source.clone(), output: target, status,
            input_bytes: source.size, output_bytes, sha256,
            elapsed_ms: start.elapsed().as_millis() as u64, message,
        },
        Err(error) => failed_result(source, &target, error, start),
    }
}

fn failed_result(source: &SourceFile, target: &Path, error: Error, start: Instant) -> ItemResult {
    ItemResult {
        id: source.id, source: source.source.clone(), output: target.into(),
        status: if matches!(error, Error::Cancelled) { ItemStatus::Cancelled } else { ItemStatus::Failed },
        input_bytes: source.size, output_bytes: None, sha256: None,
        elapsed_ms: start.elapsed().as_millis() as u64, message: Some(error.to_string()),
    }
}


#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    // Test doubles deliberately lie about the encoding. Publication must
    // depend on byte verification, never just the codec's zero exit status.
    #[test]
    fn successful_process_with_wrong_reconstruction_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("original.jpg");
        let root = dir.path().join("out");
        fs::create_dir(&root).unwrap();
        let root = fs::canonicalize(root).unwrap();
        let original = [0xff, 0xd8, 0xff, 1, 2, 3];
        fs::write(&input, original).unwrap();
        let meta = fs::metadata(&input).unwrap();
        let encoder = dir.path().join("cjxl");
        let decoder = dir.path().join("djxl");
        fs::write(&encoder, "#!/bin/sh\nprintf 'not-a-jxl' > \"$2\"\n").unwrap();
        fs::write(&decoder, "#!/bin/sh\nprintf 'wrong-jpeg' > \"$2\"\n").unwrap();
        for tool in [&encoder, &decoder] {
            fs::set_permissions(tool, fs::Permissions::from_mode(0o700)).unwrap();
        }
        let source = SourceFile { id: 0, source: input.clone(), relative: "original.jpg".into(),
            size: meta.len(), modified: meta.modified().ok() };
        let options = Options { mode: ConversionMode::JpegToJxl, output_dir: root.clone(), effort: 7, performance: crate::Performance::Quiet,
            preserve_mtime: true, skip_larger: false };
        let result = convert_one(&source, &root, &options, &Toolchain { encoder, decoder }, 1,
            &Control::default(), &|_| {});
        assert_eq!(result.status, ItemStatus::Failed);
        assert!(!root.join("original.jpg.jxl").exists());
        assert_eq!(fs::read(input).unwrap(), original);
        assert_eq!(fs::read_dir(root).unwrap().count(), 0);
    }
}
