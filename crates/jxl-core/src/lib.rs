//! Verified, non-destructive JPEG recompression. No dependency on Tauri or a GUI.
#![deny(unsafe_op_in_unsafe_fn)]

mod batch;
mod control;
mod convert;
mod error;
mod files;
mod model;
mod process;
mod scan;
mod tools;

pub use batch::run_batch;
pub use control::Control;
pub use error::{Error, Result};
pub use model::*;
pub use scan::scan_sources;
pub use tools::{ToolInfo, Toolchain};
