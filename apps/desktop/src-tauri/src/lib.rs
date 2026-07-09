use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{copy, create_dir_all, read_to_string, write, File, OpenOptions};
use std::io::{Read, Write};
use std::net::TcpStream;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread::sleep;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, RunEvent};
use crate::update::{UpdateProvider, UpdateStrategy};

const API_HOST: &str = "127.0.0.1";
const API_PORT: u16 = 4318;
const ALLOWED_ORIGINS: &str =
  "http://localhost:1420,http://127.0.0.1:1420,http://tauri.localhost,https://tauri.localhost,tauri://localhost";
const BETTER_AUTH_SECRET_BYTES: usize = 48;
const APP_DB_KEY_BYTES: usize = 32;
const API_STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const API_STARTUP_POLL_INTERVAL: Duration = Duration::from_millis(250);
const DESKTOP_AUTH_SERVICE: &str = "com.tuari.desktop.auth";
const DESKTOP_AUTH_ACCOUNT: &str = "desktop-bearer-token";
const DESKTOP_REQUEST_ORIGIN: &str = "https://tauri.localhost";
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// Rust Core module declarations
pub mod error;
pub mod crypto;
pub mod clock;
pub mod license;
pub mod recovery;
pub mod update;
pub mod trust;

struct ApiProcess {
    child: Mutex<Option<Child>>,
}

struct RuntimeSecrets {
    better_auth_secret: String,
    app_db_key: String,
}

struct DesktopAuthRuntimeState {
    session: Mutex<Option<DesktopAuthSession>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopAuthSession {
    token: String,
    remember_me: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeConfig {
    api_base_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopPhoneSignInInput {
    phone_number: String,
    password: String,
    remember_me: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopChangePasswordInput {
    current_password: String,
    new_password: String,
    revoke_other_sessions: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopApiMultipartFile {
    field_name: String,
    file_name: String,
    mime_type: Option<String>,
    bytes: Vec<u8>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopApiRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Option<Vec<u8>>,
    authenticated: bool,
    multipart_files: Option<Vec<DesktopApiMultipartFile>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopApiResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

#[derive(Deserialize)]
struct DesktopTokenResponse {
    token: Option<String>,
}

#[derive(Deserialize)]
struct DesktopErrorResponse {
    message: Option<String>,
}

#[tauri::command]
fn get_runtime_config(_app: AppHandle) -> Result<RuntimeConfig, String> {
    Ok(RuntimeConfig {
        api_base_url: format!("http://{API_HOST}:{API_PORT}"),
    })
}

fn normalize_token(token: &str) -> Option<String> {
    let normalized = token.trim();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized.to_string())
    }
}

fn desktop_auth_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(DESKTOP_AUTH_SERVICE, DESKTOP_AUTH_ACCOUNT)
        .map_err(|error| format!("Failed to open desktop credential store: {error}"))
}

fn get_desktop_runtime_auth_session(
    state: &tauri::State<'_, DesktopAuthRuntimeState>,
) -> Result<Option<DesktopAuthSession>, String> {
    let guard = state.session.lock().map_err(|error| error.to_string())?;
    Ok(guard.clone())
}

fn set_desktop_runtime_auth_session(
    token: String,
    remember_me: bool,
    state: &tauri::State<'_, DesktopAuthRuntimeState>,
) -> Result<(), String> {
    let mut guard = state.session.lock().map_err(|error| error.to_string())?;
    *guard = normalize_token(&token).map(|token| DesktopAuthSession { token, remember_me });
    Ok(())
}

fn clear_desktop_runtime_auth_session(
    state: &tauri::State<'_, DesktopAuthRuntimeState>,
) -> Result<(), String> {
    let mut guard = state.session.lock().map_err(|error| error.to_string())?;
    *guard = None;
    Ok(())
}

fn get_desktop_auth_token() -> Result<Option<String>, String> {
    let entry = desktop_auth_entry()?;

    match entry.get_password() {
        Ok(token) => Ok(normalize_token(&token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!(
            "Failed to read the desktop auth token from secure storage: {error}"
        )),
    }
}

fn set_desktop_auth_token(token: String) -> Result<(), String> {
    let entry = desktop_auth_entry()?;

    match normalize_token(&token) {
        Some(token) => entry
            .set_password(&token)
            .map_err(|error| format!("Failed to persist the desktop auth token securely: {error}")),
        None => clear_desktop_auth_token(),
    }
}

fn clear_desktop_auth_token() -> Result<(), String> {
    let entry = desktop_auth_entry()?;

    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "Failed to clear the desktop auth token from secure storage: {error}"
        )),
    }
}

fn persist_desktop_auth_session(
    token: Option<&str>,
    remember_me: bool,
    state: &tauri::State<'_, DesktopAuthRuntimeState>,
) -> Result<(), String> {
    let normalized_token = token.and_then(normalize_token);

    match normalized_token.as_deref() {
        Some(normalized_token) => {
            set_desktop_runtime_auth_session(normalized_token.to_string(), remember_me, state)?;

            if remember_me {
                set_desktop_auth_token(normalized_token.to_string())?;
            } else {
                clear_desktop_auth_token()?;
            }
        }
        None => {
            clear_desktop_runtime_auth_session(state)?;
            clear_desktop_auth_token()?;
        }
    }

    Ok(())
}

fn resolve_active_desktop_auth_session(
    state: &tauri::State<'_, DesktopAuthRuntimeState>,
) -> Result<Option<DesktopAuthSession>, String> {
    if let Some(runtime_session) = get_desktop_runtime_auth_session(state)? {
        return Ok(Some(runtime_session));
    }

    let Some(stored_token) = get_desktop_auth_token()? else {
        return Ok(None);
    };

    let restored_session = DesktopAuthSession {
        token: stored_token,
        remember_me: true,
    };

    set_desktop_runtime_auth_session(
        restored_session.token.clone(),
        restored_session.remember_me,
        state,
    )?;

    Ok(Some(restored_session))
}

fn resolve_api_url(path: &str) -> Result<String, String> {
    let normalized_path = path.trim();

    if !normalized_path.starts_with('/') || normalized_path.starts_with("//") {
        return Err("Desktop API bridge requires an absolute local API path.".to_string());
    }

    if normalized_path.contains('\r') || normalized_path.contains('\n') {
        return Err("Desktop API bridge path contains invalid newline characters.".to_string());
    }

    Ok(format!("http://{API_HOST}:{API_PORT}{normalized_path}"))
}

fn matches_inventory_attachment_upload_path(path: &str) -> bool {
    let path_without_query = path.split('?').next().unwrap_or(path);
    let Some(remaining_path) = path_without_query.strip_prefix("/api/inventory/invoice-groups/") else {
        return false;
    };

    let mut segments = remaining_path.split('/');
    matches!(
        (segments.next(), segments.next(), segments.next()),
        (Some(invoice_group_id), Some("attachments"), None) if !invoice_group_id.is_empty()
    )
}

fn matches_inventory_attachment_download_path(path: &str) -> bool {
    let path_without_query = path.split('?').next().unwrap_or(path);
    let Some(remaining_path) = path_without_query.strip_prefix("/api/inventory/attachments/") else {
        return false;
    };

    !remaining_path.is_empty() && !remaining_path.contains('/')
}

fn is_allowed_desktop_bridge_path(path: &str) -> bool {
    matches!(path, "/rpc" | "/api/auth/profile")
        || path.starts_with("/rpc/")
        || path.starts_with("/rpc?")
        || path.starts_with("/api/auth/profile?")
        || matches_inventory_attachment_upload_path(path)
        || matches_inventory_attachment_download_path(path)
}

fn should_forward_request_header(name: &str) -> bool {
    !matches!(
        name.trim().to_ascii_lowercase().as_str(),
        "authorization" | "cookie" | "host" | "origin" | "content-length"
    )
}

fn extract_response_error_message(status: reqwest::StatusCode, body: &[u8], fallback: &str) -> String {
    serde_json::from_slice::<DesktopErrorResponse>(body)
        .ok()
        .and_then(|payload| payload.message)
        .filter(|message| !message.trim().is_empty())
        .unwrap_or_else(|| {
            status
                .canonical_reason()
                .map(str::to_string)
                .unwrap_or_else(|| fallback.to_string())
        })
}

async fn send_desktop_api_request(
    request: DesktopApiRequest,
    state: &tauri::State<'_, DesktopAuthRuntimeState>,
) -> Result<DesktopApiResponse, String> {
    if request.body.is_some() && request.multipart_files.is_some() {
        return Err("Desktop API bridge cannot send raw and multipart bodies together.".to_string());
    }

    let method = reqwest::Method::from_bytes(request.method.trim().as_bytes())
        .map_err(|error| format!("Unsupported desktop API method: {error}"))?;
    let url = resolve_api_url(&request.path)?;

    let client = reqwest::Client::builder()
        .build()
        .map_err(|error| format!("Failed to initialize desktop API client: {error}"))?;
    let mut builder = client.request(method, url).header("Origin", DESKTOP_REQUEST_ORIGIN);

    for (name, value) in request.headers {
        if should_forward_request_header(&name) {
            builder = builder.header(name, value);
        }
    }

    if request.authenticated {
        if let Some(session) = resolve_active_desktop_auth_session(state)? {
            builder = builder.bearer_auth(session.token);
        }
    }

    if let Some(files) = request.multipart_files {
        let mut form = reqwest::multipart::Form::new();

        for file in files {
            let mut part = reqwest::multipart::Part::bytes(file.bytes).file_name(file.file_name);
            if let Some(mime_type) = file.mime_type.as_deref().filter(|mime_type| !mime_type.trim().is_empty()) {
                part = part
                    .mime_str(mime_type)
                    .map_err(|error| format!("Invalid desktop upload mime type: {error}"))?;
            }

            form = form.part(file.field_name, part);
        }

        builder = builder.multipart(form);
    } else if let Some(body) = request.body {
        builder = builder.body(body);
    }

    let response = builder
        .send()
        .await
        .map_err(|error| format!("Desktop API bridge request failed: {error}"))?;
    let status = response.status();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (name.as_str().to_string(), value.to_string()))
        })
        .collect::<HashMap<_, _>>();
    let body = response
        .bytes()
        .await
        .map_err(|error| format!("Failed to read desktop API bridge response body: {error}"))?
        .to_vec();

    Ok(DesktopApiResponse {
        status: status.as_u16(),
        headers,
        body,
    })
}

#[tauri::command]
async fn desktop_api_request(
    request: DesktopApiRequest,
    state: tauri::State<'_, DesktopAuthRuntimeState>,
) -> Result<DesktopApiResponse, String> {
    if !is_allowed_desktop_bridge_path(&request.path) {
        return Err("Desktop API bridge path is not allowed.".to_string());
    }
    send_desktop_api_request(request, &state).await
}

#[tauri::command]
async fn desktop_sign_in_with_phone_number(
    input: DesktopPhoneSignInInput,
    state: tauri::State<'_, DesktopAuthRuntimeState>,
) -> Result<(), String> {
    let request_body = serde_json::to_vec(&serde_json::json!({
        "phoneNumber": input.phone_number,
        "password": input.password,
        "rememberMe": input.remember_me,
    }))
    .map_err(|error| format!("Failed to serialize desktop sign-in request: {error}"))?;

    let response = send_desktop_api_request(
        DesktopApiRequest {
            authenticated: false,
            body: Some(request_body),
            headers: HashMap::from([(
                "content-type".to_string(),
                "application/json".to_string(),
            )]),
            method: "POST".to_string(),
            multipart_files: None,
            path: "/api/auth/sign-in/phone-number".to_string(),
        },
        &state,
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return Err(extract_response_error_message(
            reqwest::StatusCode::from_u16(response.status)
                .unwrap_or(reqwest::StatusCode::INTERNAL_SERVER_ERROR),
            &response.body,
            "تعذر تسجيل الدخول الآن.",
        ));
    }

    let token_response = serde_json::from_slice::<DesktopTokenResponse>(&response.body)
        .map_err(|error| format!("Failed to parse desktop sign-in response: {error}"))?;
    let Some(token) = token_response.token.as_deref().and_then(normalize_token) else {
        return Err("لم يتم استلام رمز جلسة صالح من الخادم.".to_string());
    };

    persist_desktop_auth_session(Some(&token), input.remember_me, &state)
}

#[tauri::command]
async fn desktop_change_password(
    input: DesktopChangePasswordInput,
    state: tauri::State<'_, DesktopAuthRuntimeState>,
) -> Result<(), String> {
    let existing_session = resolve_active_desktop_auth_session(&state)?;
    let request_body = serde_json::to_vec(&serde_json::json!({
        "currentPassword": input.current_password,
        "newPassword": input.new_password,
        "revokeOtherSessions": input.revoke_other_sessions,
    }))
    .map_err(|error| format!("Failed to serialize desktop password-change request: {error}"))?;

    let response = send_desktop_api_request(
        DesktopApiRequest {
            authenticated: true,
            body: Some(request_body),
            headers: HashMap::from([(
                "content-type".to_string(),
                "application/json".to_string(),
            )]),
            method: "POST".to_string(),
            multipart_files: None,
            path: "/api/auth/change-password".to_string(),
        },
        &state,
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return Err(extract_response_error_message(
            reqwest::StatusCode::from_u16(response.status)
                .unwrap_or(reqwest::StatusCode::INTERNAL_SERVER_ERROR),
            &response.body,
            "تعذر تنفيذ العملية الآن.",
        ));
    }

    let token_response = serde_json::from_slice::<DesktopTokenResponse>(&response.body)
        .map_err(|error| format!("Failed to parse desktop password-change response: {error}"))?;

    if let Some(token) = token_response.token.as_deref().and_then(normalize_token) {
        let remember_me = existing_session
            .map(|session| session.remember_me)
            .unwrap_or(false);
        persist_desktop_auth_session(Some(&token), remember_me, &state)?;
    }

    Ok(())
}

#[tauri::command]
async fn desktop_sign_out_session(
    state: tauri::State<'_, DesktopAuthRuntimeState>,
) -> Result<(), String> {
    let _ = send_desktop_api_request(
        DesktopApiRequest {
            authenticated: true,
            body: None,
            headers: HashMap::new(),
            method: "POST".to_string(),
            multipart_files: None,
            path: "/api/auth/sign-out".to_string(),
        },
        &state,
    )
    .await;

    persist_desktop_auth_session(None, false, &state)?;
    Ok(())
}

// ─── Update Tauri Commands ───────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCheckResult {
    update_available: bool,
    latest_version: String,
    download_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateApplyResult {
    success: bool,
    message: String,
}

#[tauri::command]
fn get_current_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
fn check_for_updates() -> Result<UpdateCheckResult, String> {
    let provider = crate::update::GithubReleasesProvider::new("AmaraNecib", "tuari_react_hono");
    let info = provider
        .check_for_updates(env!("CARGO_PKG_VERSION"))
        .map_err(|e| e.to_string())?;
    match info {
        Some(update) => Ok(UpdateCheckResult {
            update_available: true,
            latest_version: update.version,
            download_url: update.download_url,
        }),
        None => Ok(UpdateCheckResult {
            update_available: false,
            latest_version: String::new(),
            download_url: String::new(),
        }),
    }
}

#[tauri::command]
fn apply_update(path: String) -> Result<UpdateApplyResult, String> {
    let file_path = std::path::PathBuf::from(&path);

    // Validate file exists
    if !file_path.exists() {
        return Ok(UpdateApplyResult {
            success: false,
            message: "الملف غير موجود.".to_string(),
        });
    }

    // Validate file extension
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if ext != "update" {
        return Ok(UpdateApplyResult {
            success: false,
            message: "يرجى اختيار ملف .update صالح.".to_string(),
        });
    }

    let strategy = crate::update::FullReplaceStrategy::new(&std::path::PathBuf::from("."));
    let result = strategy
        .apply_update(&file_path)
        .map_err(|e| e.to_string())?;
    Ok(UpdateApplyResult {
        success: result.success,
        message: result.message,
    })
}

fn has_portable_runtime_layout(root: &Path) -> bool {
    let node_binary_name = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };

    root.join("bin").join(node_binary_name).exists()
        && root
            .join("bin")
            .join("api-runtime")
            .join("dist")
            .join("index.cjs")
            .exists()
}

fn resolve_portable_data_dir() -> Result<Option<PathBuf>, String> {
    let exe_path = std::env::current_exe().map_err(|error| error.to_string())?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| "Failed to determine executable directory.".to_string())?;

    if has_portable_runtime_layout(exe_dir) {
        return Ok(Some(exe_dir.join("data")));
    }

    Ok(None)
}

fn resolve_tuari_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(portable_data_dir) = resolve_portable_data_dir()? {
        return Ok(portable_data_dir);
    }

    let base_dir = app
        .path()
        .app_data_dir()
        .or_else(|_| app.path().app_local_data_dir())
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
            return Ok(PathBuf::from(public_dir)
                .join("Documents")
                .join("Tuari")
                .join("projects")
                .join("default"));
        }
    }

    let base_dir = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|error| error.to_string())?;

    Ok(base_dir.join("Tuari").join("projects").join("default"))
}

fn resolve_legacy_tuari_dir(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(public_dir) = std::env::var("PUBLIC") {
            return Ok(Some(
                PathBuf::from(public_dir).join("Documents").join("Tuari"),
            ));
        }

        let document_dir = app
            .path()
            .document_dir()
            .map_err(|error| error.to_string())?;
        Ok(Some(document_dir.join("Tuari")))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Ok(None)
    }
}

fn resolve_private_runtime_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .or_else(|_| app.path().app_local_data_dir())
        .map_err(|error| error.to_string())
        .map(|path| path.join("runtime"))
}

fn resolve_secrets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resolve_private_runtime_dir(app)?.join("secrets"))
}

fn to_sqlite_url(path: &Path) -> String {
    let normalized = path
        .display()
        .to_string()
        .trim_start_matches(r"\\?\")
        .replace('\\', "/");
    format!("file:{normalized}")
}

fn is_valid_secret(secret: &str, byte_len: usize) -> bool {
    secret.len() == byte_len * 2 && secret.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn encode_secret(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn generate_secret(byte_len: usize) -> String {
    let mut bytes = vec![0_u8; byte_len];
    OsRng.fill_bytes(&mut bytes);
    encode_secret(&bytes)
}

fn load_or_create_secret(file_path: &PathBuf, byte_len: usize) -> Result<String, String> {
    if let Ok(existing_secret) = read_to_string(file_path) {
        let secret = existing_secret.trim();
        if is_valid_secret(secret, byte_len) {
            return Ok(secret.to_string());
        }
    }

    let secret = generate_secret(byte_len);
    write(file_path, format!("{secret}\n")).map_err(|error| error.to_string())?;
    Ok(secret)
}

fn load_runtime_secrets(app: &AppHandle) -> Result<RuntimeSecrets, String> {
    let secrets_dir = resolve_secrets_dir(app)?;
    create_dir_all(&secrets_dir).map_err(|error| error.to_string())?;

    let better_auth_secret = load_or_create_secret(
        &secrets_dir.join("better-auth.secret"),
        BETTER_AUTH_SECRET_BYTES,
    )?;

    let app_db_key = load_or_create_secret(
        &secrets_dir.join("app-db.key"),
        APP_DB_KEY_BYTES,
    )?;

    Ok(RuntimeSecrets {
        better_auth_secret,
        app_db_key,
    })
}

fn ensure_file_exists(file_path: &PathBuf) -> Result<(), String> {
    if file_path.exists() {
        return Ok(());
    }

    File::create(file_path).map_err(|error| error.to_string())?;
    Ok(())
}

fn migrate_legacy_db_if_needed(
    current_path: &PathBuf,
    legacy_path: &PathBuf,
) -> Result<(), String> {
    if current_path.exists() || !legacy_path.exists() {
        return Ok(());
    }

    copy(legacy_path, current_path).map_err(|error| error.to_string())?;
    Ok(())
}

fn copy_file_if_missing(source_path: &Path, destination_path: &Path) -> Result<(), String> {
    if destination_path.exists() {
        return Ok(());
    }

    if let Some(parent_dir) = destination_path.parent() {
        create_dir_all(parent_dir).map_err(|error| error.to_string())?;
    }

    copy(source_path, destination_path).map_err(|error| error.to_string())?;
    Ok(())
}

fn copy_allowlisted_legacy_runtime_files_if_missing(
    legacy_root: &Path,
    current_root: &Path,
) -> Result<(), String> {
    const ALLOWLIST: &[&[&str]] = &[
        &["projects", "default", "tuari.sqlite"],
        &["projects", "default", "auth.sqlite"],
        &["projects", "default", "app.sqlite"],
    ];

    for relative_segments in ALLOWLIST {
        let source_path = relative_segments
            .iter()
            .fold(legacy_root.to_path_buf(), |path, segment| {
                path.join(segment)
            });

        if !source_path.exists() {
            continue;
        }

        let destination_path = relative_segments
            .iter()
            .fold(current_root.to_path_buf(), |path, segment| {
                path.join(segment)
            });

        copy_file_if_missing(&source_path, &destination_path)?;
    }

    Ok(())
}

fn migrate_legacy_runtime_tree_if_needed(app: &AppHandle) -> Result<(), String> {
    let current_root = resolve_tuari_dir(app)?;
    let Some(legacy_root) = resolve_legacy_tuari_dir(app)? else {
        return Ok(());
    };

    if current_root == legacy_root || !legacy_root.exists() {
        return Ok(());
    }

    copy_allowlisted_legacy_runtime_files_if_missing(&legacy_root, &current_root)
}

fn ensure_runtime_files(app: &AppHandle) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    migrate_legacy_runtime_tree_if_needed(app)?;

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

fn resolve_attachments_root(app_db_path: &Path) -> PathBuf {
    app_db_path
        .parent()
        .map(|parent| parent.join("attachments").join("invoices"))
        .unwrap_or_else(|| PathBuf::from("attachments").join("invoices"))
}

fn cleanup_stale_api_processes() {
    if cfg!(debug_assertions) {
        return;
    }

    #[cfg(target_os = "windows")]
    {
        let powershell_command = format!(
      "Get-NetTCPConnection -LocalPort {API_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object {{ Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }}"
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
    let deadline = Instant::now() + API_STARTUP_TIMEOUT;

    loop {
        if is_api_ready() {
            return Ok(());
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(format!(
                    "The local API stopped before startup completed ({status}). Check {}.",
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

        if Instant::now() >= deadline {
            return Err(format!(
                "Timed out while starting the local API. Check {}.",
                server_log_path.display()
            ));
        }

        sleep(API_STARTUP_POLL_INTERVAL);
    }
}

fn spawn_api_process(app: &AppHandle) -> Result<Child, String> {
    let (auth_db_path, app_db_path, server_log_path) = ensure_runtime_files(app)?;
    let attachments_root = resolve_attachments_root(&app_db_path);
    let runtime_secrets = load_runtime_secrets(app)?;
    cleanup_stale_api_processes();

    let log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&server_log_path)
        .map_err(|error| error.to_string())?;
    let error_log_file = log_file.try_clone().map_err(|error| error.to_string())?;

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
        .env_clear()
        .env("API_HOST", API_HOST)
        .env("API_PORT", API_PORT.to_string())
        .env("ALLOWED_ORIGINS", ALLOWED_ORIGINS)
        .env("BETTER_AUTH_SECRET", runtime_secrets.better_auth_secret)
        .env(
            "BETTER_AUTH_URL",
            format!("http://{API_HOST}:{API_PORT}"),
        )
        .env("AUTH_DB_PATH", auth_db_path.as_os_str())
        .env("APP_DB_PATH", app_db_path.as_os_str())
        .env("APP_ATTACHMENTS_ROOT", attachments_root.as_os_str())
        .env("DATABASE_URL", to_sqlite_url(&app_db_path))
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(error_log_file));

    // Only expose APP_DB_KEY if the license includes the EncryptedDb feature
    if let Ok(tuari_dir) = resolve_tuari_dir(app) {
        if let Ok(manager) = crate::license::LicenseManager::initialize(&tuari_dir) {
            if manager.has_feature("encrypted_db") {
                command.env("APP_DB_KEY", runtime_secrets.app_db_key);
            }
        }
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to launch API process: {error}"))?;

    if let Err(error) = wait_for_api_ready(&mut child, &server_log_path) {
        stop_child_process(&mut child);
        return Err(error);
    }

    Ok(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ApiProcess {
            child: Mutex::new(None),
        })
        .manage(DesktopAuthRuntimeState {
            session: Mutex::new(None),
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_runtime_config,
            desktop_api_request,
            desktop_sign_in_with_phone_number,
            desktop_change_password,
            desktop_sign_out_session,
            check_for_updates,
            apply_update,
            get_current_version
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
            stop_child_process(child);
        }
        *guard = None;
    }
}

#[cfg(test)]
mod tests {
    use super::{
        copy_allowlisted_legacy_runtime_files_if_missing, encode_secret,
        has_portable_runtime_layout, is_allowed_desktop_bridge_path, is_valid_secret,
        load_or_create_secret, matches_inventory_attachment_download_path,
        matches_inventory_attachment_upload_path, normalize_token, BETTER_AUTH_SECRET_BYTES,
    };
    use std::fs::{create_dir_all, remove_dir_all};
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir() -> PathBuf {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("tuari-runtime-secrets-{unique_suffix}"))
    }

    #[test]
    fn encodes_secrets_as_lowercase_hex() {
        assert_eq!(encode_secret(&[0, 10, 171, 255]), "000aabff");
    }

    #[test]
    fn validates_expected_secret_shape() {
        assert!(is_valid_secret(
            &"ab".repeat(BETTER_AUTH_SECRET_BYTES),
            BETTER_AUTH_SECRET_BYTES
        ));
        assert!(!is_valid_secret("invalid-secret", BETTER_AUTH_SECRET_BYTES));
    }

    #[test]
    fn normalizes_persisted_auth_tokens() {
        assert_eq!(
            normalize_token("  desktop-token  "),
            Some("desktop-token".to_string())
        );
        assert_eq!(normalize_token("   \n\t  "), None);
    }

    #[test]
    fn persists_secret_once_per_install_location() {
        let temp_dir = unique_temp_dir();
        create_dir_all(&temp_dir).expect("create temp dir");
        let secret_path = temp_dir.join("better-auth.secret");

        let first_secret =
            load_or_create_secret(&secret_path, BETTER_AUTH_SECRET_BYTES).expect("create secret");
        let second_secret = load_or_create_secret(&secret_path, BETTER_AUTH_SECRET_BYTES)
            .expect("reuse existing secret");

        assert_eq!(first_secret, second_secret);
        assert!(is_valid_secret(&first_secret, BETTER_AUTH_SECRET_BYTES));

        remove_dir_all(&temp_dir).expect("remove temp dir");
    }

    #[test]
    fn detects_portable_runtime_layout_from_sibling_bin_directory() {
        let temp_dir = unique_temp_dir();
        let runtime_dist_dir = temp_dir.join("bin").join("api-runtime").join("dist");
        create_dir_all(&runtime_dist_dir).expect("create runtime dist dir");
        std::fs::write(runtime_dist_dir.join("index.cjs"), "module.exports = {};")
            .expect("write sidecar entry");

        let node_binary_name = if cfg!(target_os = "windows") {
            "node.exe"
        } else {
            "node"
        };

        std::fs::write(temp_dir.join("bin").join(node_binary_name), "").expect("write node marker");

        assert!(has_portable_runtime_layout(&temp_dir));

        remove_dir_all(&temp_dir).expect("remove temp dir");
    }

    #[test]
    fn migrates_only_allowlisted_legacy_runtime_files_without_overwriting_existing_files() {
        let temp_dir = unique_temp_dir();
        let legacy_dir = temp_dir.join("legacy");
        let current_dir = temp_dir.join("current");
        let legacy_nested_dir = legacy_dir.join("projects").join("default");
        let current_nested_dir = current_dir.join("projects").join("default");

        create_dir_all(&legacy_nested_dir).expect("create legacy nested dir");
        create_dir_all(&current_nested_dir).expect("create current nested dir");

        std::fs::write(legacy_nested_dir.join("tuari.sqlite"), "legacy-db")
            .expect("write legacy db");
        std::fs::write(legacy_dir.join("logs.txt"), "legacy log").expect("write legacy log");
        std::fs::write(current_nested_dir.join("tuari.sqlite"), "current-db")
            .expect("write current db");

        copy_allowlisted_legacy_runtime_files_if_missing(&legacy_dir, &current_dir)
            .expect("copy allowlisted legacy files into current dir");

        assert_eq!(
            std::fs::read_to_string(current_nested_dir.join("tuari.sqlite"))
                .expect("read current db"),
            "current-db"
        );
        assert!(!current_dir.join("logs.txt").exists());

        copy_allowlisted_legacy_runtime_files_if_missing(&legacy_dir, &current_dir)
            .expect("re-run allowlisted legacy copy safely");

        assert_eq!(
            std::fs::read_to_string(current_nested_dir.join("tuari.sqlite"))
                .expect("read current db after second migration"),
            "current-db"
        );

        remove_dir_all(&temp_dir).expect("remove temp dir");
    }

    #[test]
    fn allows_only_expected_desktop_bridge_paths() {
        assert!(is_allowed_desktop_bridge_path("/rpc"));
        assert!(is_allowed_desktop_bridge_path("/rpc?batch=1"));
        assert!(is_allowed_desktop_bridge_path("/rpc/authSetupStatus"));
        assert!(is_allowed_desktop_bridge_path("/rpc/session"));
        assert!(is_allowed_desktop_bridge_path("/api/auth/profile"));
        assert!(is_allowed_desktop_bridge_path(
            "/api/inventory/invoice-groups/invoice-1/attachments"
        ));
        assert!(is_allowed_desktop_bridge_path(
            "/api/inventory/attachments/attachment-1"
        ));
        assert!(!is_allowed_desktop_bridge_path("/api/auth/change-password"));
        assert!(!is_allowed_desktop_bridge_path("/health"));
    }

    #[test]
    fn validates_inventory_attachment_bridge_paths() {
        assert!(matches_inventory_attachment_upload_path(
            "/api/inventory/invoice-groups/invoice-1/attachments"
        ));
        assert!(!matches_inventory_attachment_upload_path(
            "/api/inventory/invoice-groups/invoice-1/attachments/extra"
        ));
        assert!(matches_inventory_attachment_download_path(
            "/api/inventory/attachments/attachment-1"
        ));
        assert!(!matches_inventory_attachment_download_path(
            "/api/inventory/attachments/attachment-1/extra"
        ));
    }
}
