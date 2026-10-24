//! Phase 1 proof-of-concept: the first real command+event round trip through
//! Tauri IPC, using the actual `smaragd_core::pomodoro` state machine (not
//! throwaway demo code) so this exercises the real pattern later panels will
//! follow. See core/src/pomodoro.rs for the state machine itself.
//!
//! Ticking happens on a 1Hz background thread regardless of whether the
//! frontend is listening — same "keeps running while the panel is closed"
//! behavior the egui app has today — and pushes a snapshot event on every
//! tick rather than making the frontend poll a command in a timer loop (see
//! the migration plan's §2.1 on why: polling across the IPC boundary adds
//! latency a push doesn't have).

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use smaragd_core::pomodoro::{PomodoroDurations, PomodoroPhase, PomodoroState};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

use crate::project::global_settings;

const TICK_EVENT: &str = "pomodoro://tick";

const DEFAULT_WORK_MINUTES: u32 = 25;
const DEFAULT_SHORT_BREAK_MINUTES: u32 = 5;
const DEFAULT_LONG_BREAK_MINUTES: u32 = 15;
const DEFAULT_CYCLES_BEFORE_LONG_BREAK: u32 = 4;

/// Ports `app::pomodoro::resolve_durations` — `0` in any of `Settings`'
/// four `pomodoro_*` duration/cycle fields means "unset" (a fresh
/// `Settings::default()`), resolved to a real default here, same
/// convention as `editor_font::resolve_size`. Read fresh on every call
/// that needs it (`pomodoro_start`/`pomodoro_skip`/the ticker), not cached
/// on `PomodoroHandle`, so a Settings change takes effect on the very next
/// tick — matching the real app's own call-by-call `resolve_durations`
/// rather than a value computed once at startup.
fn resolve_durations() -> PomodoroDurations {
    let settings = global_settings();
    let minutes = |configured: u32, default: u32| {
        Duration::from_secs(u64::from(if configured > 0 { configured } else { default }) * 60)
    };
    PomodoroDurations {
        work: minutes(settings.pomodoro_work_minutes, DEFAULT_WORK_MINUTES),
        short_break: minutes(
            settings.pomodoro_short_break_minutes,
            DEFAULT_SHORT_BREAK_MINUTES,
        ),
        long_break: minutes(
            settings.pomodoro_long_break_minutes,
            DEFAULT_LONG_BREAK_MINUTES,
        ),
        cycles_before_long_break: if settings.pomodoro_cycles_before_long_break > 0 {
            settings.pomodoro_cycles_before_long_break
        } else {
            DEFAULT_CYCLES_BEFORE_LONG_BREAK
        },
    }
}

pub struct PomodoroHandle {
    state: Mutex<PomodoroState>,
}

impl Default for PomodoroHandle {
    fn default() -> Self {
        Self {
            state: Mutex::new(PomodoroState::new(&resolve_durations())),
        }
    }
}

#[derive(Serialize, Clone)]
pub struct PomodoroSnapshot {
    phase: &'static str,
    remaining_secs: u64,
    running: bool,
    completed_work_sessions: u32,
}

fn phase_label(phase: PomodoroPhase) -> &'static str {
    phase.label()
}

fn snapshot(handle: &PomodoroHandle) -> PomodoroSnapshot {
    let state = handle.state.lock().expect("pomodoro state mutex poisoned");
    PomodoroSnapshot {
        phase: phase_label(state.phase()),
        remaining_secs: state.remaining().as_secs(),
        running: state.is_running(),
        completed_work_sessions: state.completed_work_sessions(),
    }
}

#[tauri::command]
pub fn pomodoro_snapshot(handle: State<PomodoroHandle>) -> PomodoroSnapshot {
    snapshot(&handle)
}

#[tauri::command]
pub fn pomodoro_start(handle: State<PomodoroHandle>) {
    handle
        .state
        .lock()
        .expect("pomodoro state mutex poisoned")
        .start(Instant::now());
}

#[tauri::command]
pub fn pomodoro_pause(handle: State<PomodoroHandle>) {
    handle
        .state
        .lock()
        .expect("pomodoro state mutex poisoned")
        .pause();
}

#[tauri::command]
pub fn pomodoro_skip(handle: State<PomodoroHandle>) {
    let mut state = handle.state.lock().expect("pomodoro state mutex poisoned");
    state.skip(&resolve_durations());
}

/// Spawns the 1Hz background ticker. Called once from `run()` at startup.
///
/// Phase 7: `notify-rust` -> `tauri-plugin-notification`, the one native
/// integration swap from the plan's §4 list that already had a concrete,
/// single call site to mirror exactly (see app/src/notifications.rs's doc
/// comment: Pomodoro phase changes are its *only* user). `tick()` already
/// returns `Option<PhaseTransition>` on exactly the frame a phase completes
/// on its own (never on `skip` — see its doc comment) for precisely this.
pub fn spawn_ticker(app: AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(1));
            let handle = app.state::<PomodoroHandle>();
            let transition = {
                let mut state = handle.state.lock().expect("pomodoro state mutex poisoned");
                state.tick(Instant::now(), &resolve_durations())
            };
            if let Some(transition) = transition
                && global_settings().pomodoro_notifications_enabled
            {
                let _ = app
                    .notification()
                    .builder()
                    .title(format!("{} complete", transition.completed.label()))
                    .body(format!("Starting {}", transition.next.label()))
                    .show();
            }
            let payload = snapshot(&handle);
            let _ = app.emit(TICK_EVENT, payload);
        }
    });
}
