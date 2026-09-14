use crate::{process, Control, Error, Result};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

#[derive(Clone, Debug)]
pub struct Toolchain {
    pub(crate) encoder: PathBuf,
    pub(crate) decoder: PathBuf,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub directory: PathBuf,
    pub encoder_version: String,
    pub decoder_version: String,
}

impl Toolchain {
    /// Explicit directory only: never execute a binary from the working
    /// directory or let a shell resolve it using an untrusted PATH.
    pub fn from_directory(directory: &Path) -> Result<Self> {
        let directory = fs::canonicalize(directory)?;
        let ext = if cfg!(windows) { ".exe" } else { "" };
        let encoder = directory.join(format!("cjxl{ext}"));
        let decoder = directory.join(format!("djxl{ext}"));
        if !encoder.is_file() || !decoder.is_file() {
            return Err(Error::Invalid(
                "В папке нужны оба файла: cjxl и djxl (в Windows — .exe)".into(),
            ));
        }
        Ok(Self { encoder, decoder })
    }

    pub fn probe(&self, control: &Control) -> Result<ToolInfo> {
        let timeout = Duration::from_secs(15);
        let encoder = process::run(&self.encoder, &["--version".into()], control, timeout)?;
        let decoder = process::run(&self.decoder, &["--version".into()], control, timeout)?;
        let help = process::run(
            &self.decoder,
            &["--help".into(), "-v".into()],
            control,
            timeout,
        )?;
        if !help.contains("--reconstruct_jpeg") {
            return Err(Error::Invalid("Нужен libjxl 0.12 или новее с djxl --reconstruct_jpeg. Старый декодер не используется.".into()));
        }
        let encoder_help = process::run(
            &self.encoder,
            &["--help".into(), "-v".into(), "-v".into()],
            control,
            timeout,
        )?;
        for flag in ["--lossless_jpeg", "--allow_jpeg_reconstruction"] {
            if !encoder_help.contains(flag) {
                return Err(Error::Invalid(format!("Кодировщик не поддерживает {flag}")));
            }
        }
        let first_line = |text: String| {
            text.lines()
                .find(|l| !l.trim().is_empty())
                .unwrap_or("unknown")
                .to_owned()
        };
        Ok(ToolInfo {
            directory: self.encoder.parent().unwrap_or(Path::new("")).into(),
            encoder_version: first_line(encoder),
            decoder_version: first_line(decoder),
        })
    }
}
