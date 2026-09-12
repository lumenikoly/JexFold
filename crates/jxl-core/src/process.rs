use std::{collections::VecDeque, ffi::OsString, io::{self, Read}, path::Path,
    process::{Child, Command, Stdio}, thread, time::{Duration, Instant}};
use crate::{Control, Error, Result};

const LOG_LIMIT: usize = 32 * 1024;

struct ChildGuard(Child);
impl Drop for ChildGuard {
    fn drop(&mut self) {
        // Also executed during unwinding. Never leave a running codec after
        // a normal cancellation/error. An OS-level force-kill of this GUI is
        // outside this guarantee; original files remain untouched regardless.
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn tail(mut reader: impl Read) -> io::Result<String> {
    let mut bytes = VecDeque::with_capacity(LOG_LIMIT);
    let mut buf = [0_u8; 4096];
    loop {
        let len = match reader.read(&mut buf) {
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            other => other?,
        };
        if len == 0 { break; }
        for byte in &buf[..len] {
            if bytes.len() == LOG_LIMIT { bytes.pop_front(); }
            bytes.push_back(*byte);
        }
    }
    Ok(String::from_utf8_lossy(&bytes.into_iter().collect::<Vec<_>>()).into_owned())
}

/// Runs an executable directly (no shell), draining both pipes concurrently.
/// Logs have a bounded in-memory tail; arbitrary filenames are not shell code.
pub(crate) fn run(program: &Path, args: &[OsString], control: &Control, timeout: Duration) -> Result<String> {
    control.check()?;
    let mut command = Command::new(program);
    command.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let child = command.spawn().map_err(|e| Error::Spawn { program: program.into(), message: e.to_string() })?;
    let mut child = ChildGuard(child);
    let out = child.0.stdout.take().ok_or_else(|| Error::Invalid("Отсутствует stdout кодека".into()))?;
    let err = child.0.stderr.take().ok_or_else(|| Error::Invalid("Отсутствует stderr кодека".into()))?;
    let started = Instant::now();
    // Scoped threads are joined even if waiting/reading fails.
    thread::scope(|scope| {
        let stdout = scope.spawn(move || tail(out));
        let stderr = scope.spawn(move || tail(err));
        let status = loop {
            if control.is_cancelled() {
                let _ = child.0.kill(); let _ = child.0.wait();
                break Err(Error::Cancelled);
            }
            if started.elapsed() >= timeout {
                let _ = child.0.kill(); let _ = child.0.wait();
                break Err(Error::Timeout(program.display().to_string()));
            }
            match child.0.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Ok(None) => thread::sleep(Duration::from_millis(40)),
                Err(error) => {
                    let _ = child.0.kill(); let _ = child.0.wait();
                    break Err(Error::Io(error));
                }
            }
        };
        let output = stdout.join().map_err(|_| Error::Invalid("Сбой чтения stdout".into()))??;
        let errors = stderr.join().map_err(|_| Error::Invalid("Сбой чтения stderr".into()))??;
        let status = status?;
        let text = format!("{output}\n{errors}");
        if !status.success() {
            return Err(Error::Codec {
                program: program.file_name().unwrap_or_default().to_string_lossy().into_owned(),
                detail: format!("{status}\n{}", text.trim()),
            });
        }
        Ok(text)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn diagnostics_are_bounded_and_keep_tail() {
        let bytes = vec![b'x'; LOG_LIMIT * 10];
        let out = tail(bytes.as_slice()).unwrap();
        assert_eq!(out.len(), LOG_LIMIT);
    }
    #[cfg(unix)]
    #[test]
    fn timeout_kills_a_running_child() {
        let result = run(Path::new("/bin/sh"), &["-c".into(), "while :; do :; done".into()],
            &Control::default(), Duration::from_millis(100));
        assert!(matches!(result, Err(Error::Timeout(_))));
    }
    #[cfg(unix)]
    #[test]
    fn cancellation_interrupts_a_running_child() {
        let control = Control::default();
        thread::scope(|scope| {
            scope.spawn(|| { thread::sleep(Duration::from_millis(100)); control.cancel(); });
            let result = run(Path::new("/bin/sh"), &["-c".into(), "while :; do :; done".into()],
                &control, Duration::from_secs(10));
            assert!(matches!(result, Err(Error::Cancelled)));
        });
    }

}
