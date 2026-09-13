use serde::{Deserialize, Serialize};
use std::{path::PathBuf, time::SystemTime};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceFile {
    pub id: usize,
    pub source: PathBuf,
    pub relative: PathBuf,
    pub size: u64,
    #[serde(skip)]
    pub modified: Option<SystemTime>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub files: Vec<SourceFile>,
    pub roots: Vec<PathBuf>,
    pub directory_roots: Vec<PathBuf>,
    pub warnings: Vec<String>,
    pub warning_count: usize,
    pub total_bytes: u64,
    pub mode: ConversionMode,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ConversionMode { #[default] JpegToJxl, JxlToJpeg }

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Performance {
    Quiet,
    #[default]
    Balanced,
    Fast,
    Maximum,
}

impl Performance {
    /// Bound the total codec thread budget; never run N all-core encoders.
    pub fn budget(self, cpus: usize) -> (usize, usize) {
        let usable = cpus.saturating_sub(1).max(1);
        match self {
            Self::Quiet => (1, (usable / 2).clamp(1, 4)),
            Self::Balanced => {
                let workers = (usable / 4).clamp(1, 2);
                (workers, (usable / workers).clamp(1, 4))
            }
            Self::Fast => {
                let workers = (usable / 2).clamp(1, 4);
                (workers, (usable / workers).clamp(1, 8))
            }
            Self::Maximum => {
                let workers = usable.clamp(1, 8);
                (workers, (usable / workers).max(1))
            }
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Options {
    pub mode: ConversionMode,
    pub output_dir: PathBuf,
    pub effort: u8,
    pub performance: Performance,
    pub preserve_mtime: bool,
    pub skip_larger: bool,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Stage { Encoding, Decoding, Verifying }

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ItemStatus { Converted, Existing, NotSmaller, Failed, Cancelled }

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemResult {
    pub id: usize,
    pub source: PathBuf,
    pub output: PathBuf,
    pub status: ItemStatus,
    pub input_bytes: u64,
    pub output_bytes: Option<u64>,
    pub sha256: Option<String>,
    pub elapsed_ms: u64,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Progress {
    Stage { id: usize, stage: Stage },
    Item { result: ItemResult },
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub total: usize,
    pub converted: usize,
    pub existing: usize,
    pub not_smaller: usize,
    pub failed: usize,
    pub cancelled: usize,
    pub not_started: usize,
    pub input_bytes: u64,
    pub output_bytes: u64,
    pub elapsed_ms: u64,
    pub was_cancelled: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn budget_never_oversubscribes() {
        for cpus in 1..256 {
            for mode in [Performance::Quiet, Performance::Balanced, Performance::Fast, Performance::Maximum] {
                let (workers, threads) = mode.budget(cpus);
                assert!(workers >= 1 && threads >= 1);
                assert!(workers * threads <= cpus);
            }
        }
    }
    #[test]
    fn maximum_mode_runs_up_to_eight_files_at_once() {
        assert_eq!(Performance::Maximum.budget(4), (3, 1));
        assert_eq!(Performance::Maximum.budget(9), (8, 1));
        assert_eq!(Performance::Maximum.budget(17), (8, 2));
    }
}
