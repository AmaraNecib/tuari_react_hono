use serde::Serialize;
use std::fs::{copy, create_dir_all, read_to_string, File, OpenOptions};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, RunEvent};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const API_HOST: &str = "127.0.0.1";
const API_PORT: u16 = 4318;
const APP_CLIENT_KEY: &str = "tuari-desktop-client-key-v1";
const ALLOWED_ORIGINS: &str =
  "http://localhost:1420,http://127.0.0.1:1420,http://tauri.localhost,https://tauri.localhost,tauri://localhost";
const BETTER_AUTH_SECRET: &str = "desktop-secret-desktop-secret-desktop-secret";
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct ApiProcess {
  child: Mutex<Option<Child>>,
}

struct AuthTokenState {
  token: Mutex<Option<String>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeConfig {
  api_base_url: String,
  app_client_key: String,
  project_dir: String,
  auth_db_path: String,
  app_db_path: String,
  server_log_path: String,
}

#[tauri::command]
fn get_runtime_config(app: AppHandle) -> Result<RuntimeConfig, String> {
  let project_dir = resolve_project_dir(&app)?;
  let auth_db_path = project_dir.join("tuari.sqlite");
  let app_db_path = project_dir.join("tuari.sqlite");
  let server_log_path = resolve_logs_dir(&app)?.join("api-server.log");

  Ok(RuntimeConfig {
    api_base_url: format!("http://{}:{}", API_HOST, API_PORT),
    app_client_key: APP_CLIENT_KEY.to_string(),
    project_dir: display_path(&project_dir),
    auth_db_path: display_path(&auth_db_path),
    app_db_path: display_path(&app_db_path),
    server_log_path: display_path(&server_log_path),
  })
}

#[tauri::command]
fn open_project_dir(app: AppHandle) -> Result<(), String> {
  let project_dir = resolve_project_dir(&app)?;
  let status = open_path(project_dir)?;

  if status.success() {
    Ok(())
  } else {
    Err("Failed to open project directory.".to_string())
  }
}

#[tauri::command]
fn open_logs_dir(app: AppHandle) -> Result<(), String> {
  let logs_dir = resolve_logs_dir(&app)?;
  let status = open_path(logs_dir)?;

  if status.success() {
    Ok(())
  } else {
    Err("Failed to open log directory.".to_string())
  }
}

#[tauri::command]
fn get_server_log(app: AppHandle) -> Result<String, String> {
  let log_path = resolve_logs_dir(&app)?.join("api-server.log");
  let contents = read_to_string(log_path).unwrap_or_default();
  let recent_lines = contents
    .lines()
    .rev()
    .take(60)
    .collect::<Vec<_>>()
    .into_iter()
    .rev()
    .collect::<Vec<_>>()
    .join("\n");

  Ok(recent_lines)
}

#[tauri::command]
fn set_auth_token(token: String, app: AppHandle) -> Result<(), String> {
  let state = app.state::<AuthTokenState>();
  let mut guard = state.token.lock().map_err(|error| error.to_string())?;
  *guard = Some(token);
  Ok(())
}

#[tauri::command]
fn get_auth_token(app: AppHandle) -> Result<Option<String>, String> {
  let state = app.state::<AuthTokenState>();
  let guard = state.token.lock().map_err(|error| error.to_string())?;
  Ok(guard.clone())
}

#[tauri::command]
fn clear_auth_token(app: AppHandle) -> Result<(), String> {
  let state = app.state::<AuthTokenState>();
  let mut guard = state.token.lock().map_err(|error| error.to_string())?;
  *guard = None;
  Ok(())
}

fn resolve_tuari_dir(app: &AppHandle) -> Result<PathBuf, String> {
  if !cfg!(debug_assertions) {
    if let Ok(resource_dir) = app.path().resource_dir() {
      return Ok(resource_dir);
    }
  }

  #[cfg(target_os = "windows")]
  {
    if let Ok(public_dir) = std::env::var("PUBLIC") {
      return Ok(PathBuf::from(public_dir).join("Documents").join("Tuari"));
    }
  }

  let base_dir = app
    .path()
    .document_dir()
    .or_else(|_| app.path().app_data_dir())
    .map_err(|error| error.to_string())?;

  Ok(base_dir.join("Tuari"))
}

fn resolve_project_dir(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(resolve_tuari_dir(app)?.join("projects").join("default"))
}

fn resolve_logs_dir(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(resolve_tuari_dir(app)?.join("logs"))
}

fn resolve_legacy_project_dir(app: &AppHandle) -> Result<PathBuf, String> {
  #[cfg(target_os = "windows")]
  {
    if let Ok(public_dir) = std::env::var("PUBLIC") {
      return Ok(
        PathBuf::from(public_dir)
          .join("Documents")
          .join("Tuari")
          .join("projects")
          .join("default"),
      );
    }
  }

  let base_dir = app
    .path()
    .document_dir()
    .or_else(|_| app.path().app_data_dir())
    .map_err(|error| error.to_string())?;

  Ok(base_dir.join("Tuari").join("projects").join("default"))
}

fn open_path(path: PathBuf) -> Result<std::process::ExitStatus, String> {
  if cfg!(target_os = "windows") {
    Command::new("explorer")
      .arg(path.as_os_str())
      .status()
      .map_err(|error| error.to_string())
  } else if cfg!(target_os = "macos") {
    Command::new("open")
      .arg(path.as_os_str())
      .status()
      .map_err(|error| error.to_string())
  } else {
    Command::new("xdg-open")
      .arg(path.as_os_str())
      .status()
      .map_err(|error| error.to_string())
  }
}

fn display_path(path: &PathBuf) -> String {
  path.display().to_string().trim_start_matches(r"\\?\").to_string()
}

fn to_sqlite_url(path: &PathBuf) -> String {
  let normalized = display_path(path).replace('\\', "/");
  format!("file:{}", normalized)
}

fn ensure_file_exists(file_path: &PathBuf) -> Result<(), String> {
  if file_path.exists() {
    return Ok(());
  }

  File::create(file_path).map_err(|error| error.to_string())?;
  Ok(())
}

fn migrate_legacy_db_if_needed(current_path: &PathBuf, legacy_path: &PathBuf) -> Result<(), String> {
  if current_path.exists() || !legacy_path.exists() {
    return Ok(());
  }

  copy(legacy_path, current_path).map_err(|error| error.to_string())?;
  Ok(())
}

fn ensure_runtime_files(app: &AppHandle) -> Result<(PathBuf, PathBuf, PathBuf), String> {
  let project_dir = resolve_project_dir(app)?;
  let logs_dir = resolve_logs_dir(app)?;
  create_dir_all(&project_dir).map_err(|error| error.to_string())?;
  create_dir_all(&logs_dir).map_err(|error| error.to_string())?;

  let auth_db_path = project_dir.join("tuari.sqlite");
  let app_db_path = project_dir.join("tuari.sqlite");
  let server_log_path = logs_dir.join("api-server.log");
  let legacy_project_dir = resolve_legacy_project_dir(app)?;
  let legacy_auth_db_path = legacy_project_dir.join("auth.sqlite");
  let legacy_app_db_path = legacy_project_dir.join("app.sqlite");
  let local_legacy_auth_db_path = project_dir.join("auth.sqlite");
  let local_legacy_app_db_path = project_dir.join("app.sqlite");

  migrate_legacy_db_if_needed(&auth_db_path, &local_legacy_auth_db_path)?;
  migrate_legacy_db_if_needed(&auth_db_path, &legacy_auth_db_path)?;
  migrate_legacy_db_if_needed(&app_db_path, &local_legacy_app_db_path)?;
  migrate_legacy_db_if_needed(&app_db_path, &legacy_app_db_path)?;

  ensure_file_exists(&auth_db_path)?;
  ensure_file_exists(&server_log_path)?;

  Ok((auth_db_path, app_db_path, server_log_path))
}

fn cleanup_stale_api_processes() {
  if cfg!(debug_assertions) {
    return;
  }

  #[cfg(target_os = "windows")]
  {
    let powershell_command = format!(
      "Get-NetTCPConnection -LocalPort {} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object {{ Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }}",
      API_PORT
    );

    let _ = Command::new("powershell")
      .args(["-NoProfile", "-Command", powershell_command.as_str()])
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .creation_flags(CREATE_NO_WINDOW)
      .status();
  }

  #[cfg(not(target_os = "windows"))]
  {
    let _ = Command::new("pkill")
      .args(["-f", "api-server"])
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .status();
  }
}

fn workspace_root() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("..")
    .join("..")
    .join("..")
}

fn spawn_api_process(app: &AppHandle) -> Result<Child, String> {
  let (auth_db_path, app_db_path, server_log_path) = ensure_runtime_files(app)?;
  cleanup_stale_api_processes();

  let log_file = OpenOptions::new()
    .create(true)
    .append(true)
    .open(&server_log_path)
    .map_err(|error| error.to_string())?;
  let error_log_file = log_file
    .try_clone()
    .map_err(|error| error.to_string())?;

  let mut command = if cfg!(debug_assertions) {
    let mut cmd = Command::new(if cfg!(target_os = "windows") {
      "pnpm.cmd"
    } else {
      "pnpm"
    });
    cmd
      .arg("--filter")
      .arg("@tuari/api")
      .arg("dev")
      .current_dir(workspace_root());
    cmd
  } else {
    let resource_dir = app.path().resource_dir().map_err(|error| error.to_string())?;
    let node_binary_name = if cfg!(target_os = "windows") {
      "node.exe"
    } else {
      "node"
    };
    let node_path = resource_dir.join("bin").join(node_binary_name);
    let runtime_dir = resource_dir.join("bin").join("api-runtime");
    let sidecar_path = runtime_dir.join("dist").join("index.cjs");

    let mut cmd = Command::new(node_path);
    cmd.arg(sidecar_path);
    cmd.current_dir(runtime_dir);
    cmd
  };

  #[cfg(target_os = "windows")]
  command.creation_flags(CREATE_NO_WINDOW);

  command
    .env("API_HOST", API_HOST)
    .env("API_PORT", API_PORT.to_string())
    .env("APP_CLIENT_KEY", APP_CLIENT_KEY)
    .env("ALLOWED_ORIGINS", ALLOWED_ORIGINS)
    .env("BETTER_AUTH_SECRET", BETTER_AUTH_SECRET)
    .env("BETTER_AUTH_URL", format!("http://{}:{}", API_HOST, API_PORT))
    .env("AUTH_DB_PATH", auth_db_path.as_os_str())
    .env("APP_DB_PATH", app_db_path.as_os_str())
    .env("DATABASE_URL", to_sqlite_url(&app_db_path))
    .stdout(Stdio::from(log_file))
    .stderr(Stdio::from(error_log_file));

  command
    .spawn()
    .map_err(|error| format!("Failed to launch API process: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(ApiProcess {
      child: Mutex::new(None),
    })
    .manage(AuthTokenState {
      token: Mutex::new(None),
    })
    .invoke_handler(tauri::generate_handler![
      get_runtime_config,
      open_project_dir,
      open_logs_dir,
      get_server_log,
      set_auth_token,
      get_auth_token,
      clear_auth_token
    ])
    .setup(|app| {
      let child = spawn_api_process(app.handle())?;
      let state = app.state::<ApiProcess>();
      let mut guard = state.child.lock().map_err(|error| error.to_string())?;
      *guard = Some(child);
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
        kill_api(app);
      }
    });
}

fn kill_api(app: &AppHandle) {
  let state = app.state::<ApiProcess>();
  let lock_result = state.child.lock();
  if let Ok(mut guard) = lock_result {
    if let Some(child) = guard.as_mut() {
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
    *guard = None;
  }
}
