//! Owns API process construction, readiness, failed-start cleanup and shutdown.
use std::fs::{create_dir_all, remove_file, OpenOptions};
use std::io::{Read, Write};
use std::net::TcpStream;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread::sleep;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use super::{
    api_runtime_dir, api_sidecar_entry_path, ensure_runtime_files,
    is_api_sidecar_command_line, license_failure_env_map, load_runtime_secrets,
    resolve_api_runtime_dir, resolve_attachments_root, resolve_private_runtime_dir,
    resolve_tuari_dir, strip_windows_extended_path_prefix, to_sqlite_url,
    API_HOST, API_PORT, ALLOWED_ORIGINS,
};
const API_STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const API_STARTUP_POLL_INTERVAL: Duration = Duration::from_millis(250);
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Default)]
pub(super) struct ApiRuntime {
    child: Mutex<Option<Child>>,
}

impl ApiRuntime {
    pub(super) fn start(&self, app: &AppHandle) -> Result<(), String> {
        let mut guard = self.child.lock().map_err(|error| error.to_string())?;
        if guard.is_none() {
            *guard = Some(spawn_api_process(app)?);
        }
        Ok(())
    }

    pub(super) fn stop(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                stop_child_process(&mut child);
            }
        }
    }
}

/// Stops stale API sidecar children left over from a previous run (e.g.
/// after a crash) before a fresh child is spawned.
///
/// Matching is by process identity — command lines that look like OUR child
/// (`node <install>/bin/api-runtime/dist/index.cjs`) — never by port. The
/// previous port-based cleanup could terminate an unrelated process that
/// happened to listen on `API_PORT`.
fn cleanup_stale_api_processes(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }

    // Never guess: if we cannot determine this installation's runtime path we
    // leave every process alone rather than risk killing a foreign sidecar.
    let install_runtime_dir = match resolve_api_runtime_dir(app) {
        Ok(dir) => dir,
        Err(_) => return,
    };

    #[cfg(target_os = "windows")]
    {
        // Enumerate candidate node.exe processes (read-only), then let the
        // unit-tested identity predicate decide which PIDs are ours before
        // killing. The kill list is never derived from the listening port.
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" -ErrorAction SilentlyContinue | ForEach-Object { \"$($_.ProcessId)|$($_.CommandLine)\" }",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let Some((pid, command_line)) = line.split_once('|') else {
                    continue;
                };
                if is_api_sidecar_command_line(command_line, &install_runtime_dir) {
                    let _ = Command::new("taskkill")
                        .args(["/PID", pid, "/T", "/F"])
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .creation_flags(CREATE_NO_WINDOW)
                        .status();
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // pgrep -a prints "<pid> <full command line>" for node processes;
        // only the ones the identity predicate recognizes as our sidecar
        // child are stopped.
        let output = Command::new("pgrep")
            .args(["-a", "node"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let Some((pid, command_line)) = line.split_once(' ') else {
                    continue;
                };
                if is_api_sidecar_command_line(command_line, &install_runtime_dir) {
                    let _ = Command::new("kill")
                        .args(["-9", pid])
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .status();
                }
            }
        }
    }
}

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
}

fn is_api_ready() -> bool {
    let mut stream = match TcpStream::connect((API_HOST, API_PORT)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };

    let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));

    let request = format!(
        "GET /health HTTP/1.1\r\nHost: {API_HOST}:{API_PORT}\r\nConnection: close\r\n\r\n"
    );

    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }

    response.starts_with("HTTP/1.1 200") || response.contains(r#"{"status":"ok"}"#)
}

fn ensure_ready(
    child: &mut Child,
    wait: impl FnOnce(&mut Child) -> Result<(), String>,
) -> Result<(), String> {
    if let Err(error) = wait(child) {
        stop_child_process(child);
        return Err(error);
    }
    Ok(())
}

fn stop_child_process(child: &mut Child) {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = child.kill();
    }
}

fn wait_for_api_ready(child: &mut Child, server_log_path: &Path) -> Result<(), String> {
    wait_for_api_ready_with(child, server_log_path, API_STARTUP_TIMEOUT, is_api_ready)
}

fn wait_for_api_ready_with(
    child: &mut Child,
    server_log_path: &Path,
    timeout: Duration,
    mut ready: impl FnMut() -> bool,
) -> Result<(), String> {
    let deadline = Instant::now() + timeout;

    loop {
        let healthy = ready();

        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(format!(
                    "The local API stopped before startup completed ({status}). Check day-folder JSONL logs in {}.",
                    server_log_path.display()
                ));
            }
            Ok(None) => {}
            Err(error) => {
                return Err(format!(
                    "Failed while waiting for the local API to start: {error}"
                ));
            }
        }

        if healthy {
            return Ok(());
        }

        if Instant::now() >= deadline {
            return Err(format!(
                "Timed out while starting the local API. Check day-folder JSONL logs in {}.",
                server_log_path.display()
            ));
        }

        sleep(API_STARTUP_POLL_INTERVAL);
    }
}

pub(super) fn prepare_api_temp_directory(runtime_dir: &Path) -> Result<PathBuf, String> {
    let temp_dir = runtime_dir.join("temp");
    let failure =
        |error: std::io::Error| format!("Failed to prepare API temporary directory: {error}");
    create_dir_all(&temp_dir).map_err(failure)?;
    let metadata = std::fs::symlink_metadata(&temp_dir).map_err(failure)?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("API temporary directory must be a real directory".to_string());
    }
    let temp_dir = std::fs::canonicalize(temp_dir).map_err(failure)?;
    static PROBE_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let id = PROBE_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "API temporary directory probe clock is before Unix epoch".to_string())?
        .as_nanos();
    let probe = temp_dir.join(format!(".write-probe-{}-{stamp}-{id}", std::process::id()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
        .map_err(failure)?;
    let result = std::io::Write::write_all(&mut file, b"tuari-temp-probe");
    drop(file);
    let cleanup = remove_file(&probe);
    result.and(cleanup).map_err(failure)?;
    Ok(temp_dir)
}

pub(super) fn configure_api_child_environment(command: &mut Command, development: bool, temp_dir: &Path) {
    command.env_clear();
    for key in ["TEMP", "TMP", "SQLITE_TMPDIR"] {
        command.env(key, temp_dir);
    }

    // Bundled Node needs SystemRoot on Windows. Keep that existing exception to
    // the cleared environment in both development and release.
    #[cfg(target_os = "windows")]
    if let Some(system_root) = std::env::var_os("SystemRoot") {
        command.env("SystemRoot", system_root);
    }

    // Development tools such as pnpm.cmd invoke `node` through PATH. Release
    // launches bundled Node by absolute path and does not inherit PATH.
    if development {
        if let Some(path) = std::env::var_os("PATH") {
            command.env("PATH", path);
        }
    }
}

fn initialize_license_for_api(root: &Path) -> Result<crate::license::LicenseManager, crate::error::RustCoreError> {
    let result = crate::license::LicenseManager::initialize(root);
    if result.is_ok() {
        crate::event_sink::emit("info", "license validation complete", None);
    } else {
        crate::event_sink::emit("error", "license validation failed", None);
    }
    result
}

fn spawn_api_process(app: &AppHandle) -> Result<Child, String> {
    let (auth_db_path, app_db_path, server_log_path) = ensure_runtime_files(app)?;
    let temp_dir = prepare_api_temp_directory(&resolve_private_runtime_dir(app)?)?;
    let attachments_root = resolve_attachments_root(&app_db_path);
    let runtime_secrets = load_runtime_secrets(app)?;
    cleanup_stale_api_processes(app);

    let logs_dir = server_log_path.parent().ok_or("Invalid log directory")?;

    let mut command = if cfg!(debug_assertions) {
        let mut cmd = Command::new(if cfg!(target_os = "windows") {
            "pnpm.cmd"
        } else {
            "pnpm"
        });
        cmd.arg("--filter")
            .arg("@tuari/api")
            .arg("dev")
            .current_dir(workspace_root());
        cmd
    } else {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|error| error.to_string())?;
        let node_binary_name = if cfg!(target_os = "windows") {
            "node.exe"
        } else {
            "node"
        };
        let node_path = resource_dir.join("bin").join(node_binary_name);
        let runtime_dir = api_runtime_dir(&resource_dir);
        let sidecar_path = api_sidecar_entry_path(&runtime_dir);

        let mut cmd = Command::new(node_path);
        cmd.arg(strip_windows_extended_path_prefix(
            &sidecar_path.to_string_lossy(),
        ));
        cmd.current_dir(runtime_dir);
        cmd
    };

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    configure_api_child_environment(&mut command, cfg!(debug_assertions), &temp_dir);

    command
        .env("API_HOST", API_HOST)
        .env("API_PORT", API_PORT.to_string())
        .env("ALLOWED_ORIGINS", ALLOWED_ORIGINS)
        .env("BETTER_AUTH_SECRET", runtime_secrets.better_auth_secret)
        .env("BETTER_AUTH_URL", format!("http://{API_HOST}:{API_PORT}"))
        .env("AUTH_DB_PATH", auth_db_path.as_os_str())
        .env("APP_DB_PATH", app_db_path.as_os_str())
        .env("APP_ATTACHMENTS_ROOT", attachments_root.as_os_str())
        .env("DATABASE_URL", to_sqlite_url(&app_db_path))
        .env("TUARI_LOGS_DIR", logs_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    // Point the API sidecar at the user-editable config.json (may not exist
    // yet — the API treats a missing file as "use env/defaults").
    if let Ok(tuari_dir) = resolve_tuari_dir(app) {
        command.env(
            "TUARI_CONFIG_FILE",
            tuari_dir.join("config.json").as_os_str(),
        );
    }

    // Set structured license env vars for the API sidecar per Licensing Architecture §15.5.
    // #399: on an initialization failure the block is still emitted, with an
    // explicit status (clock -> "suspicious", everything else -> "unknown"), so
    // the API and support can tell WHY licensing failed instead of seeing an
    // omitted variable. The API keeps its own fail-closed default regardless.
    if let Ok(tuari_dir) = resolve_tuari_dir(app) {
        match initialize_license_for_api(&tuari_dir) {
            Ok(manager) => {
                let env_map = manager.to_env_map();
                for (key, value) in &env_map {
                    command.env(key, value);
                }
                // Only expose APP_DB_KEY if the license includes the EncryptedDb feature
                if manager.has_feature("encrypted_db") {
                    command.env("APP_DB_KEY", runtime_secrets.app_db_key);
                }
            }
            Err(error) => {
                for (key, value) in license_failure_env_map(&error) {
                    command.env(key, value);
                }
            }
        }
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to launch API process: {error}"))?;

    if let Some(mut stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            let mut buffer = [0_u8; 8192];
            loop {
                match stderr.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(size) => crate::event_sink::emit("error", "API stderr", Some(String::from_utf8_lossy(&buffer[..size]).into_owned())),
                }
            }
        });
    }
    ensure_ready(&mut child, |child| wait_for_api_ready(child, logs_dir))?;
    Ok(child)
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn license_caller_records_success_and_invalid_license_failure() {
        let root = std::env::temp_dir().join(format!("tuari-license-events-{}", rand::random::<u64>()));
        create_dir_all(&root).unwrap();
        let events = crate::event_sink::capture_events(|| {
            assert!(initialize_license_for_api(&root).is_ok());
            std::fs::write(root.join("license.lic"), "invalid-license").unwrap();
            assert!(initialize_license_for_api(&root).is_err());
        });
        assert!(events.iter().any(|e| e["message"] == "license validation complete" && e["severity"] == "info" && e["lifecycle"] == true));
        assert!(events.iter().any(|e| e["message"] == "license validation failed" && e["severity"] == "error"));
        std::fs::remove_dir_all(root).unwrap();
    }
    fn child() -> Child {
        Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "api_runtime::tests::sleeping_child", "--nocapture"])
            .env("TUARI_LIFECYCLE_TEST_CHILD", "1")
            .stdout(Stdio::piped())
            .spawn()
            .unwrap()
    }

    fn assert_stopped(child: &mut Child) {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if child.try_wait().unwrap().is_some() {
                return;
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                panic!("owned child survived cleanup");
            }
            sleep(Duration::from_millis(10));
        }
    }

    #[test]
    fn sleeping_child() {
        if std::env::var_os("TUARI_LIFECYCLE_TEST_CHILD").is_some() {
            println!("TUARI_CHILD_STARTED");
            std::io::stdout().flush().unwrap();
            sleep(Duration::from_secs(30));
        }
    }

    #[test]
    fn readiness_success_keeps_child_running_until_stop() {
        let mut child = child();
        ensure_ready(&mut child, |_| Ok(())).unwrap();
        assert!(child.try_wait().unwrap().is_none());
        stop_child_process(&mut child);
        assert_stopped(&mut child);
    }

    #[test]
    fn exited_child_is_not_ready_even_when_health_succeeds() {
        let mut child = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "api_runtime::tests::sleeping_child"])
            .env_remove("TUARI_LIFECYCLE_TEST_CHILD")
            .stdout(Stdio::null())
            .spawn().unwrap();
        child.wait().unwrap();
        let error = wait_for_api_ready_with(
            &mut child, Path::new("data/logs"), Duration::ZERO, || true,
        ).unwrap_err();
        assert!(error.contains("stopped before startup completed"), "{error}");
    }

    #[test]
    fn readiness_deadline_stops_a_live_child() {
        let mut child = child();
        let error = ensure_ready(&mut child, |child| wait_for_api_ready_with(
            child, Path::new("data/logs"), Duration::ZERO, || false,
        )).unwrap_err();
        assert!(error.contains("Timed out"), "{error}");
        assert!(error.contains("day-folder JSONL logs in data/logs"), "{error}");
        assert!(!error.contains("api-server.log"), "{error}");
        assert_stopped(&mut child);
    }

    #[test]
    fn readiness_failure_preserves_error_and_stops_child() {
        let mut child = child();
        let result = ensure_ready(&mut child, |_| Err("readiness failed".into()));
        assert_eq!(result, Err("readiness failed".into()));
        assert_stopped(&mut child);
    }

    #[test]
    fn exit_cleanup_takes_owned_child_and_is_idempotent() {
        use std::io::BufRead;
        let mut child = child();
        let pid = child.id();
        let stdout = child.stdout.take().unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        let observer = std::thread::spawn(move || {
            let mut reader = std::io::BufReader::new(stdout);
            let mut line = String::new();
            while reader.read_line(&mut line).unwrap() != 0 {
                if line.contains("TUARI_CHILD_STARTED") {
                    tx.send("started").unwrap();
                    break;
                }
                line.clear();
            }
            let mut remainder = String::new();
            reader.read_to_string(&mut remainder).unwrap();
            let _ = tx.send("exited");
        });
        let runtime = ApiRuntime { child: Mutex::new(Some(child)) };
        let started = rx.recv_timeout(Duration::from_secs(5));
        runtime.stop();
        assert!(runtime.child.lock().unwrap().is_none());
        runtime.stop();
        let exited = rx.recv_timeout(Duration::from_secs(5));
        if exited != Ok("exited") {
            // Clean up the exact fixture even when a mutation removes stop().
            #[cfg(target_os = "windows")]
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"]).status();
            #[cfg(not(target_os = "windows"))]
            let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
        }
        observer.join().unwrap();
        assert_eq!(started, Ok("started"), "fixture never became live");
        assert_eq!(exited, Ok("exited"), "stop() left its child running");
    }
}
