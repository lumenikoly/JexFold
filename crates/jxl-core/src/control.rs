use std::sync::{atomic::{AtomicBool, Ordering}, Condvar, Mutex};
use crate::{Error, Result};

/// Pause stops dispatching NEW files. Active codecs are allowed to finish.
/// Cancel also terminates active child processes at their next poll.
#[derive(Default)]
pub struct Control {
    cancelled: AtomicBool,
    paused: Mutex<bool>,
    wake: Condvar,
}

impl Control {
    pub fn cancel(&self) {
        // Change the wait predicate under the same mutex as Condvar::wait.
        // Otherwise cancellation can be lost between the predicate check
        // and the worker actually going to sleep.
        let mut paused = self.paused.lock().unwrap_or_else(|p| p.into_inner());
        self.cancelled.store(true, Ordering::Release);
        *paused = false;
        self.wake.notify_all();
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }

    pub fn check(&self) -> Result<()> {
        if self.is_cancelled() { Err(Error::Cancelled) } else { Ok(()) }
    }

    pub fn set_paused(&self, value: bool) {
        // A poisoned lock must not leave a batch permanently paused.
        *self.paused.lock().unwrap_or_else(|p| p.into_inner()) = value;
        self.wake.notify_all();
    }

    pub(crate) fn wait_until_ready(&self) -> Result<()> {
        let mut paused = self.paused.lock().unwrap_or_else(|p| p.into_inner());
        while *paused && !self.is_cancelled() {
            paused = self.wake.wait(paused).unwrap_or_else(|p| p.into_inner());
        }
        self.check()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cancellation_is_sticky_and_releases_pause() {
        let c = Control::default();
        c.set_paused(true);
        c.cancel();
        assert!(matches!(c.wait_until_ready(), Err(Error::Cancelled)));
        c.set_paused(false);
        assert!(c.check().is_err());
    }
}
