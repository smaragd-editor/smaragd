//! Real multi-device vault sync — replaces Phase 6's `sync::sync_demo_*`
//! (a `SyncRunner` against an in-memory fake vault, one device only).
//! Everything here wraps `core::sync::{pairing, runner, link}`, which was
//! already written independently of egui — this module only adds the
//! Tauri IPC/event boundary around it.
//!
//! Named `vault` rather than `sync` so it can't be confused with
//! `project_settings::set_sync_files` (an unrelated per-project "do binary
//! files participate in sync" flag).
//!
//! Two shapes of command, matching how differently each piece needs to run:
//! - One-off server operations (create/join a vault, make a ticket, list/
//!   revoke devices, leave) are plain `async fn` commands that run the
//!   blocking `core::sync::pairing::*` call via [`blocking`] and return the
//!   result straight through the `invoke()` promise — simpler than the real
//!   egui app's thread+channel+per-frame-poll dance (`app/src/app/sync.rs`),
//!   which exists only because egui can't `.await` inside a frame.
//! - The *continuous* background sync (`vault_start`/`vault_stop`/
//!   `vault_sync_now`/`vault_set_held`) still needs a persistent thread
//!   pushing events over however long a project stays open — same
//!   wake-driven drain-thread architecture `collab.rs` already proves for a
//!   real (non-demo) feature in this codebase.

use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use smaragd_core::project::store::{NativeStore, ProjectStore, native_store};
use smaragd_core::settings::Settings;
use smaragd_core::sync::engine::SyncReport;
use smaragd_core::sync::link::{self, DeviceCredentials, ProjectLink};
use smaragd_core::sync::pairing::{self, PairError, Paired};
use smaragd_core::sync::runner::{self, HaltReason, StartParams, SyncEvent, SyncRunner};
use smaragd_core::sync::state::DirStateStore;
use smaragd_sync_protocol::DeviceId;
use smaragd_sync_protocol::api::{DeviceInfo, HealthResponse};
use smaragd_sync_protocol::ticket::{ServerAddr, SyncTicket};
use tauri::{AppHandle, Emitter, State};

const EVENT: &str = "vault://event";
/// Upper bound on how stale the drained state can be if a wake is ever
/// missed — see `collab.rs`'s identical constant for why this is a fallback,
/// not the normal (near-instant, wake-driven) path.
const WAKE_FALLBACK: Duration = Duration::from_millis(250);
/// How often a pass runs on its own; saves and "Sync Now" trigger one sooner.
const SYNC_INTERVAL: Duration = Duration::from_secs(10);

struct ActiveSync {
    root: PathBuf,
    runner: SyncRunner,
}

/// A single global slot: this app only ever has one project open at a time
/// (confirmed — nothing in `app-tauri` tracks "current project" either), so
/// this matches `collab::CollabState`'s single-session shape exactly.
#[derive(Default)]
pub struct VaultState(Arc<Mutex<Option<ActiveSync>>>);

/// Runs `f` on Tauri's dedicated blocking-task pool and flattens a join
/// failure into the same `String` error shape every command here uses.
/// Nothing in `core::sync::{pairing,link}` is async — it's blocking network
/// I/O and (for key derivation) deliberately slow CPU work — so it must
/// never run on an async command's own executor thread.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|err| err.to_string())
}

fn data_root() -> Result<PathBuf, String> {
    link::data_root().ok_or_else(|| "couldn't resolve the platform data directory".to_string())
}

fn settings() -> Result<Settings, String> {
    Ok(Settings::load_from_path(
        &NativeStore,
        &crate::settings::path()?,
    ))
}

/// A project's resolved pairing: the link to actually use (server/salt/key
/// version taken from the credentials, not the possibly-tampered project
/// file — see [`DeviceCredentials::trusted_link`]), this device's
/// credentials, and the file store/state directory both already needed to
/// reach them, so [`prepare_start`] doesn't have to recompute them.
struct Pairing {
    link: ProjectLink,
    credentials: DeviceCredentials,
    files: Arc<dyn ProjectStore>,
    state_dir: PathBuf,
}

fn load_pairing_sync(root: &Path) -> Result<Pairing, String> {
    let files = native_store();
    let link = ProjectLink::load(&*files, root)
        .ok_or_else(|| "This project isn't paired with a vault.".to_string())?;
    let data_root = data_root()?;
    let state_dir = link::state_dir(&data_root, link.vault_id);
    let mut state = DirStateStore::new(files.clone(), state_dir.clone());
    let mut credentials = DeviceCredentials::load(&state)
        .ok_or_else(|| "No device credentials found for this vault — rejoin it.".to_string())?;
    let trusted = credentials.trusted_link(&link);
    if trusted.newly_bound {
        credentials
            .save(&mut state)
            .map_err(|err| format!("saving device credentials: {err}"))?;
    }
    Ok(Pairing {
        link: trusted.link,
        credentials,
        files,
        state_dir,
    })
}

async fn load_pairing(root: String) -> Result<Pairing, String> {
    blocking(move || load_pairing_sync(&PathBuf::from(root))).await?
}

fn prepare_start(root: PathBuf, passphrase: String) -> Result<StartParams, String> {
    let info = load_pairing_sync(&root)?;
    Ok(StartParams {
        link: info.link,
        credentials: info.credentials,
        passphrase,
        project_root: root,
        files: info.files,
        state_dir: info.state_dir,
    })
}

#[derive(Serialize)]
pub struct VaultStatusDto {
    paired: bool,
    server: Option<String>,
    own_device_id: Option<String>,
}

#[tauri::command]
pub async fn vault_status(root: String) -> Result<VaultStatusDto, String> {
    blocking(move || match load_pairing_sync(&PathBuf::from(root)) {
        Ok(info) => VaultStatusDto {
            paired: true,
            server: Some(pairing::describe(&info.link)),
            own_device_id: Some(info.credentials.device_id.to_string()),
        },
        Err(_) => VaultStatusDto {
            paired: false,
            server: None,
            own_device_id: None,
        },
    })
    .await
}

#[tauri::command]
pub async fn vault_test_connection(server: ServerAddr) -> Result<HealthResponse, String> {
    blocking(move || pairing::test_connection(&server))
        .await?
        .map_err(|err| err.to_string())
}

#[derive(Serialize)]
pub struct PairedDto {
    server: String,
    vault_id: String,
    own_device_id: String,
}

impl From<&Paired> for PairedDto {
    fn from(paired: &Paired) -> Self {
        PairedDto {
            server: pairing::describe(&paired.link),
            vault_id: paired.link.vault_id.to_string(),
            own_device_id: paired.credentials.device_id.to_string(),
        }
    }
}

#[derive(Serialize)]
#[serde(tag = "kind")]
pub enum CreateOutcome {
    Paired(PairedDto),
    /// The server only lets its administrator create vaults — ask the user
    /// for the admin token and call `vault_create` again with it.
    NeedsAdminToken,
}

#[tauri::command]
pub async fn vault_create(
    root: String,
    host: String,
    port: u16,
    use_tls: bool,
    path: String,
    admin_token: Option<String>,
    device_name: String,
) -> Result<CreateOutcome, String> {
    let server = ServerAddr {
        host,
        port,
        use_tls,
        path,
    };
    let data_root = data_root()?;
    let result = blocking(move || {
        let root = PathBuf::from(root);
        let files = native_store();
        pairing::create_vault(
            &files,
            &root,
            &data_root,
            &server,
            admin_token.as_deref(),
            &device_name,
        )
    })
    .await?;
    match result {
        Ok(paired) => Ok(CreateOutcome::Paired((&paired).into())),
        Err(PairError::NeedsAdminToken) => Ok(CreateOutcome::NeedsAdminToken),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub async fn vault_join(
    root: String,
    ticket: String,
    device_name: String,
) -> Result<PairedDto, String> {
    let ticket = SyncTicket::decode(&ticket).map_err(|err| err.to_string())?;
    let data_root = data_root()?;
    let result = blocking(move || {
        let root = PathBuf::from(root);
        let files = native_store();
        pairing::join_vault(&files, &root, &data_root, &ticket, &device_name)
    })
    .await?;
    result
        .map(|paired| (&paired).into())
        .map_err(|err| err.to_string())
}

/// `host:port[/path]` of a server, as the join-confirmation screen shows it
/// — the one display spot that needs the path too, unlike
/// `pairing::describe`'s plain `host:port`.
fn server_label(server: &ServerAddr) -> String {
    let path = server.path.trim_matches('/');
    if path.is_empty() {
        format!("{}:{}", server.host, server.port)
    } else {
        format!("{}:{}/{path}", server.host, server.port)
    }
}

#[derive(Serialize)]
pub struct TicketPreviewDto {
    server: String,
    plain_http: bool,
}

/// Decodes a pasted ticket just far enough to show "join the vault on
/// `&lt;server&gt;`?" before anything is sent anywhere — the same safety gate
/// the real app's `PendingJoin` confirmation screen has. Pure/local, no
/// network — a plain sync command, not `async`.
#[tauri::command]
pub fn vault_decode_ticket(ticket: String) -> Result<TicketPreviewDto, String> {
    let ticket = SyncTicket::decode(&ticket).map_err(|err| err.to_string())?;
    Ok(TicketPreviewDto {
        server: server_label(&ticket.server),
        plain_http: !ticket.server.use_tls,
    })
}

#[tauri::command]
pub async fn vault_make_ticket(root: String) -> Result<String, String> {
    let info = load_pairing(root).await?;
    blocking(move || pairing::make_ticket(&info.link, &info.credentials))
        .await?
        .map(|ticket| ticket.encode())
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn vault_list_devices(root: String) -> Result<Vec<DeviceInfo>, String> {
    let info = load_pairing(root).await?;
    blocking(move || pairing::list_devices(&info.link, &info.credentials))
        .await?
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn vault_revoke_device(root: String, device_id: String) -> Result<(), String> {
    let device: DeviceId = device_id
        .parse()
        .map_err(|_| "that isn't a valid device id".to_string())?;
    let info = load_pairing(root).await?;
    blocking(move || pairing::revoke_device(&info.link, &info.credentials, device))
        .await?
        .map_err(|err| err.to_string())
}

/// Stops syncing this project and removes this device from the vault — the
/// project's files are untouched. Stops this project's runner first, if
/// it's the one currently active, so leaving doesn't race a pass still in
/// flight against now-deleted credentials.
#[tauri::command]
pub async fn vault_leave(state: State<'_, VaultState>, root: String) -> Result<bool, String> {
    stop_if_active_for(&state, &root);
    let info = load_pairing(root.clone()).await?;
    let data_root = data_root()?;
    blocking(move || {
        pairing::leave_vault(
            &info.files,
            &PathBuf::from(root),
            &data_root,
            &info.link,
            &info.credentials,
        )
    })
    .await?
    .map_err(|err| err.to_string())
}

/// Reusable over `core::sync::crypto::passphrase_weakness` — a pure,
/// deterministic check with no I/O, kept as one Rust implementation rather
/// than mirrored in TS so the two never drift on what counts as weak.
#[tauri::command]
pub fn vault_passphrase_weakness(passphrase: String) -> Option<&'static str> {
    smaragd_core::sync::crypto::passphrase_weakness(&passphrase)
}

fn stop_if_active_for(state: &State<VaultState>, root: &str) {
    let mut guard = state.0.lock().expect("vault state mutex poisoned");
    if guard
        .as_ref()
        .is_some_and(|active| active.root == Path::new(root))
    {
        guard.take();
    }
}

#[tauri::command]
pub async fn vault_start(
    app: AppHandle,
    state: State<'_, VaultState>,
    root: String,
) -> Result<(), String> {
    {
        let guard = state.0.lock().expect("vault state mutex poisoned");
        if guard
            .as_ref()
            .is_some_and(|active| active.root == Path::new(&root))
        {
            return Ok(()); // already running for this project
        }
    }
    let settings = settings()?;
    if !settings.sync_enabled {
        return Err("Sync is turned off in Settings > Sync.".into());
    }
    if let Some(problem) = settings.sync_config_problem() {
        return Err(problem.to_string());
    }
    let passphrase = settings.sync_passphrase.0.clone();
    let root_path = PathBuf::from(&root);
    let params = blocking(move || prepare_start(root_path, passphrase)).await??;

    // Stop whichever other project's runner (if any) was active before this
    // one — the frontend is expected to have already called `vault_stop`/
    // started this one on project switch, so this is a safety net, not the
    // primary mechanism (see this module's own doc comment).
    state.0.lock().expect("vault state mutex poisoned").take();

    let (wake_tx, wake_rx) = mpsc::channel::<()>();
    let wake: Box<dyn Fn() + Send> = Box::new(move || {
        let _ = wake_tx.send(());
    });
    // `runner::start` only spawns the background thread that does the real
    // (~1s) key derivation and engine setup — it returns immediately, so
    // this itself doesn't need `blocking()`.
    let runner = runner::start(params, SYNC_INTERVAL, wake);
    *state.0.lock().expect("vault state mutex poisoned") = Some(ActiveSync {
        root: PathBuf::from(root),
        runner,
    });
    spawn_drain_thread(app, state.0.clone(), wake_rx);
    Ok(())
}

#[tauri::command]
pub fn vault_stop(state: State<VaultState>) {
    // Dropping the `SyncRunner` sends it `Command::Stop` itself (see its
    // `Drop` impl) — no explicit teardown call needed here.
    state.0.lock().expect("vault state mutex poisoned").take();
}

#[tauri::command]
pub fn vault_sync_now(state: State<VaultState>) {
    if let Some(active) = state.0.lock().expect("vault state mutex poisoned").as_ref() {
        active.runner.sync_now();
    }
}

/// Tells the engine which (if any) file currently has unsaved edits, so a
/// pass holds it rather than overwriting the open buffer — see
/// `SyncEngine::set_held_paths`. A no-op if `root` isn't the project this
/// runner is for (a stale call racing a just-finished project switch), never
/// an error.
#[tauri::command]
pub fn vault_set_held(state: State<VaultState>, root: String, paths: Vec<String>) {
    let guard = state.0.lock().expect("vault state mutex poisoned");
    if let Some(active) = guard.as_ref()
        && active.root == Path::new(&root)
    {
        active.runner.set_held_paths(paths.into_iter().collect());
    }
}

fn plural(n: usize, one: &str, many: &str) -> String {
    format!("{n} {}", if n == 1 { one } else { many })
}

/// A short account of what a pass did, or `None` if it did nothing worth
/// mentioning — ported verbatim from the real app's own
/// `app/src/app/sync.rs::summarize`.
fn summarize(report: &SyncReport) -> Option<String> {
    let mut parts = Vec::new();
    if report.files_written > 0 {
        parts.push(format!(
            "updated {}",
            plural(report.files_written, "file", "files")
        ));
    }
    if report.files_renamed > 0 {
        parts.push(format!(
            "renamed {}",
            plural(report.files_renamed, "file", "files")
        ));
    }
    if report.files_removed > 0 {
        parts.push(format!(
            "removed {}",
            plural(report.files_removed, "file", "files")
        ));
    }
    if report.meta_written {
        parts.push("updated project settings".to_string());
    }
    let mut text = parts.join(", ");
    if report.pushed_updates > 0 {
        let sent = format!(
            "sent {}",
            plural(report.pushed_updates, "change", "changes")
        );
        text = if text.is_empty() {
            sent
        } else {
            format!("{text}; {sent}")
        };
    }
    if report.files_held > 0 {
        let waiting = format!(
            "{} waiting for you to save",
            plural(report.files_held, "file", "files")
        );
        text = if text.is_empty() {
            waiting
        } else {
            format!("{text}; {waiting}")
        };
    }
    (!text.is_empty()).then(|| {
        let mut chars = text.chars();
        chars
            .next()
            .map(|c| c.to_uppercase().collect::<String>() + chars.as_str())
            .unwrap_or_default()
    })
}

/// Ported verbatim from `app/src/app/sync.rs::halt_message`.
fn halt_message(reason: &HaltReason) -> String {
    match reason {
        HaltReason::WrongPassphrase => {
            "The sync passphrase doesn't match this vault. Correct it in Settings > Sync; \
             sync restarts by itself."
                .into()
        }
        HaltReason::Revoked => {
            "This device was removed from the vault, or the vault was deleted. Stop syncing \
             this project, then join again with a new ticket if you still want it synced."
                .into()
        }
        HaltReason::ProjectMissing => "The project folder is missing.".into(),
        HaltReason::Fatal(message) => format!("Sync stopped: {message}"),
    }
}

/// Ported verbatim from `app/src/app/sync.rs::too_large_message`.
fn too_large_message(docs: &[String]) -> String {
    let which = match docs {
        [one] => format!("\u{201c}{one}\u{201d} has"),
        many => format!("{} documents have", many.len()),
    };
    format!(
        "{which} a change too large to upload (over 8 MB at once), so it isn't syncing. \
         Everything else still syncs. Remove the oversized content and save, and it \
         syncs again."
    )
}

/// Ported verbatim from `app/src/app/sync.rs::over_limit_message`.
fn over_limit_message(files: &[String]) -> String {
    let which = match files {
        [one] => format!("\u{201c}{one}\u{201d} is"),
        many => format!("{} files are", many.len()),
    };
    format!(
        "{which} larger than this sync server accepts for one file, so it stays on this \
         device only. Everything else still syncs. Whoever runs the server can raise the \
         limit (SMARAGD_SYNC_MAX_FILE_MB)."
    )
}

/// Ported verbatim from `app/src/app/sync.rs::too_large_to_download_message`.
fn too_large_to_download_message(files: &[String]) -> String {
    let which = match files {
        [one] => format!("A newer version of \u{201c}{one}\u{201d} is"),
        many => format!("Newer versions of {} files are", many.len()),
    };
    format!(
        "{which} larger than this device downloads through this sync server, so the copy \
         here stays as it is. Whoever runs the server can raise the limit \
         (SMARAGD_SYNC_MAX_FILE_MB)."
    )
}

#[derive(Serialize, Clone)]
#[serde(tag = "kind")]
enum VaultEventDto {
    Syncing,
    Synced {
        summary: Option<String>,
        too_large_message: Option<String>,
        over_limit_message: Option<String>,
        too_large_to_download_message: Option<String>,
        meta_written: bool,
    },
    Offline {
        message: String,
    },
    Failed {
        message: String,
    },
    Halted {
        /// A stable, machine-matchable tag ("wrong_passphrase", "revoked",
        /// "project_missing", "fatal") alongside `message`'s human text, so
        /// the frontend can special-case (e.g.) `revoked` without string-
        /// matching the message.
        reason: &'static str,
        message: String,
    },
}

impl From<SyncEvent> for VaultEventDto {
    fn from(event: SyncEvent) -> Self {
        match event {
            SyncEvent::Syncing => VaultEventDto::Syncing,
            SyncEvent::Synced(report) => VaultEventDto::Synced {
                summary: summarize(&report),
                too_large_message: (!report.too_large.is_empty())
                    .then(|| too_large_message(&report.too_large)),
                over_limit_message: (!report.files_over_limit.is_empty())
                    .then(|| over_limit_message(&report.files_over_limit)),
                too_large_to_download_message: (!report.files_too_large_to_download.is_empty())
                    .then(|| too_large_to_download_message(&report.files_too_large_to_download)),
                meta_written: report.meta_written,
            },
            SyncEvent::Offline(message) => VaultEventDto::Offline { message },
            SyncEvent::Failed(message) => VaultEventDto::Failed { message },
            SyncEvent::Halted(reason) => {
                let tag = match &reason {
                    HaltReason::WrongPassphrase => "wrong_passphrase",
                    HaltReason::Revoked => "revoked",
                    HaltReason::ProjectMissing => "project_missing",
                    HaltReason::Fatal(_) => "fatal",
                };
                let message = halt_message(&reason);
                VaultEventDto::Halted {
                    reason: tag,
                    message,
                }
            }
        }
    }
}

fn spawn_drain_thread(
    app: AppHandle,
    state: Arc<Mutex<Option<ActiveSync>>>,
    wake_rx: mpsc::Receiver<()>,
) {
    std::thread::spawn(move || {
        loop {
            let _ = wake_rx.recv_timeout(WAKE_FALLBACK);
            let guard = state.lock().expect("vault state mutex poisoned");
            let Some(active) = guard.as_ref() else {
                return;
            };
            let events = active.runner.poll();
            drop(guard);
            for event in events {
                let _ = app.emit(EVENT, VaultEventDto::from(event));
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use smaragd_sync_protocol::VaultId;
    use smaragd_sync_protocol::api::VaultInfo;
    use uuid::Uuid;

    fn test_link() -> ProjectLink {
        ProjectLink::new(
            ServerAddr {
                host: "sync.example.com".into(),
                port: 8443,
                use_tls: true,
                path: "smaragd".into(),
            },
            &VaultInfo {
                vault_id: VaultId(Uuid::from_u128(1)),
                kdf_salt: vec![0; 16],
                key_version: 1,
            },
        )
    }

    fn test_paired() -> Paired {
        let link = test_link();
        Paired {
            credentials: DeviceCredentials::new(DeviceId(Uuid::from_u128(2)), "t".into(), &link),
            link,
        }
    }

    #[test]
    fn paired_dto_never_carries_the_token() {
        let paired = test_paired();
        let dto = PairedDto::from(&paired);
        assert_eq!(dto.server, "sync.example.com:8443");
        assert_eq!(dto.vault_id, VaultId(Uuid::from_u128(1)).to_string());
        assert_eq!(dto.own_device_id, DeviceId(Uuid::from_u128(2)).to_string());
    }

    #[test]
    fn server_label_includes_the_path_unlike_pairing_describe() {
        let link = test_link();
        assert_eq!(pairing::describe(&link), "sync.example.com:8443");
        assert_eq!(server_label(&link.server), "sync.example.com:8443/smaragd");

        let mut no_path = link.server;
        no_path.path = String::new();
        assert_eq!(server_label(&no_path), "sync.example.com:8443");
    }

    #[test]
    fn summarize_describes_what_a_pass_did() {
        assert_eq!(summarize(&SyncReport::default()), None);

        let report = SyncReport {
            files_written: 2,
            pushed_updates: 1,
            ..Default::default()
        };
        assert_eq!(
            summarize(&report).as_deref(),
            Some("Updated 2 files; sent 1 change")
        );
    }

    #[test]
    fn synced_event_surfaces_too_large_and_over_limit_messages_only_when_present() {
        let quiet = VaultEventDto::from(SyncEvent::Synced(Box::new(SyncReport::default())));
        let VaultEventDto::Synced {
            summary,
            too_large_message,
            over_limit_message,
            too_large_to_download_message,
            ..
        } = quiet
        else {
            panic!("expected Synced");
        };
        assert_eq!(summary, None);
        assert_eq!(too_large_message, None);
        assert_eq!(over_limit_message, None);
        assert_eq!(too_large_to_download_message, None);

        let noisy = VaultEventDto::from(SyncEvent::Synced(Box::new(SyncReport {
            too_large: vec!["Draft.md".into()],
            ..Default::default()
        })));
        let VaultEventDto::Synced {
            too_large_message, ..
        } = noisy
        else {
            panic!("expected Synced");
        };
        assert!(too_large_message.unwrap().contains("Draft.md"));
    }

    #[test]
    fn halted_events_carry_a_stable_tag_and_a_human_message() {
        let VaultEventDto::Halted { reason, message } =
            VaultEventDto::from(SyncEvent::Halted(HaltReason::Revoked))
        else {
            panic!("expected Halted");
        };
        assert_eq!(reason, "revoked");
        assert!(message.contains("removed from the vault"));
    }
}
