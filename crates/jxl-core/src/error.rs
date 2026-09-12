use std::{io, path::PathBuf};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Операция отменена")]
    Cancelled,
    #[error("{0}")]
    Invalid(String),
    #[error("Ошибка файловой системы: {0}")]
    Io(#[from] io::Error),
    #[error("Не удалось запустить {program:?}: {message}")]
    Spawn { program: PathBuf, message: String },
    #[error("{program} завершился с ошибкой: {detail}")]
    Codec { program: String, detail: String },
    #[error("{0}: превышено время ожидания")]
    Timeout(String),
    #[error("Исходный файл изменился во время обработки")]
    SourceChanged,
    #[error("Восстановленный JPEG не совпадает с оригиналом")]
    Verification,
}
