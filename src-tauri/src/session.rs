use jxl_core::{Control, ScanResult, Toolchain};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

#[derive(Default, Clone)]
pub struct AppState {
    pub session: Arc<Session>,
}

#[derive(Default)]
pub struct Session {
    busy: AtomicBool,
    pub control: Mutex<Arc<Control>>,
    pub scan: Mutex<Option<ScanResult>>,
    pub tools: Mutex<Option<Toolchain>>,
}

impl Session {
    pub fn is_busy(&self) -> bool {
        self.busy.load(Ordering::Acquire)
    }

    /// One scanner/converter/tool probe at a time. The guard is moved into
    /// spawn_blocking so an IPC disconnect cannot prematurely unlock the app.
    pub fn begin(self: &Arc<Self>) -> Result<Operation, String> {
        let mut current = self
            .control
            .lock()
            .map_err(|_| "Сбой состояния приложения")?;
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "Другая операция ещё выполняется".to_owned())?;
        let control = Arc::new(Control::default());
        *current = control.clone();
        Ok(Operation {
            session: self.clone(),
            control,
        })
    }
}

pub struct Operation {
    pub control: Arc<Control>,
    session: Arc<Session>,
}
impl Drop for Operation {
    fn drop(&mut self) {
        self.session.busy.store(false, Ordering::Release);
    }
}
