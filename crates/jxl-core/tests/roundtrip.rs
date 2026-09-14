//! Real codec integration tests. Explicitly opt in, never silently "pass"
//! without libjxl: pnpm run codecs:build && pnpm run test:integration.
use jxl_core::{run_batch, scan_sources, Control, ConversionMode, Options, Performance, Toolchain};
use std::{fs, path::PathBuf};

fn toolchain() -> Toolchain {
    let dir = std::env::var_os("JXL_TOOLS_DIR")
        .expect("Set JXL_TOOLS_DIR to a directory containing libjxl 0.12+ cjxl/djxl");
    Toolchain::from_directory(&PathBuf::from(dir)).unwrap()
}
fn options(output: PathBuf) -> Options {
    Options {
        mode: ConversionMode::JpegToJxl,
        output_dir: output,
        effort: 7,
        performance: Performance::Quiet,
        preserve_metadata: true,
        skip_larger: false,
    }
}

#[test]
#[ignore = "requires libjxl 0.12+; use pnpm run test:integration"]
fn reconstructs_baseline_and_progressive_jpeg_with_metadata() {
    let temporary = tempfile::tempdir().unwrap();
    let input = temporary.path().join("photos");
    let output = temporary.path().join("converted");
    fs::create_dir_all(&input).unwrap();
    fs::create_dir_all(&output).unwrap();
    let baseline = include_bytes!("fixtures/baseline.jpg");
    let progressive = include_bytes!("fixtures/progressive.jpeg");
    fs::write(input.join("Фото с пробелами.JPG"), baseline).unwrap();
    fs::write(input.join("progressive.jpeg"), progressive).unwrap();
    let control = Control::default();
    let scan = scan_sources(
        std::slice::from_ref(&input),
        ConversionMode::JpegToJxl,
        &control,
    )
    .unwrap();
    let summary = run_batch(
        &scan,
        &options(output.clone()),
        &toolchain(),
        &control,
        |_| {},
    )
    .unwrap();
    assert_eq!(summary.converted, 2, "{summary:?}");
    assert_eq!(summary.failed, 0);
    assert_eq!(
        fs::read(input.join("Фото с пробелами.JPG")).unwrap(),
        baseline
    );
    assert_eq!(
        fs::read(input.join("progressive.jpeg")).unwrap(),
        progressive
    );
    assert!(output.join("photos/Фото с пробелами.jxl").is_file());
    assert!(!fs::read_dir(&output).unwrap().any(|f| f
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with("jxl-report-")));
    // A second run must skip, not overwrite or invent successful validation.
    let again = run_batch(
        &scan,
        &options(output.clone()),
        &toolchain(),
        &control,
        |_| {},
    )
    .unwrap();
    assert_eq!(again.existing, 2);
    assert_eq!(again.converted, 0);
    assert!(!fs::read_dir(output.join("photos")).unwrap().any(|f| f
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with(".jxl-archiver-")));
}

#[test]
#[ignore = "requires libjxl 0.12+; use pnpm run test:integration"]
fn corrupt_jpeg_does_not_publish_or_change_original() {
    let temporary = tempfile::tempdir().unwrap();
    let input = temporary.path().join("photos");
    let output = temporary.path().join("converted");
    fs::create_dir_all(&input).unwrap();
    fs::create_dir_all(&output).unwrap();
    let bytes = [0xff, 0xd8, 0xff, 0x00, 0x01];
    fs::write(input.join("broken.jpg"), bytes).unwrap();
    let c = Control::default();
    let scan = scan_sources(std::slice::from_ref(&input), ConversionMode::JpegToJxl, &c).unwrap();
    let result = run_batch(&scan, &options(output.clone()), &toolchain(), &c, |_| {}).unwrap();
    assert_eq!(result.failed, 1);
    assert_eq!(fs::read(input.join("broken.jpg")).unwrap(), bytes);
    assert!(!output.join("photos/broken.jxl").exists());
}

#[test]
fn rejects_nested_output_before_executing_codec() {
    let t = tempfile::tempdir().unwrap();
    let input = t.path().join("photos");
    let output = input.join("converted");
    fs::create_dir_all(&output).unwrap();
    fs::write(input.join("x.jpg"), include_bytes!("fixtures/baseline.jpg")).unwrap();
    // fake paths are enough: validation must fail before the executables run
    let bin = t.path().join("tools");
    fs::create_dir(&bin).unwrap();
    let ext = if cfg!(windows) { ".exe" } else { "" };
    fs::write(bin.join(format!("cjxl{ext}")), b"not executable").unwrap();
    fs::write(bin.join(format!("djxl{ext}")), b"not executable").unwrap();
    let c = Control::default();
    let scan = scan_sources(&[input], ConversionMode::JpegToJxl, &c).unwrap();
    let tools = Toolchain::from_directory(&bin).unwrap();
    let error = run_batch(&scan, &options(output), &tools, &c, |_| {}).unwrap_err();
    assert!(error.to_string().contains("вложены"));
}
