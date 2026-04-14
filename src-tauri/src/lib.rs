use audiotags::Tag;
use rustfft::{FftPlanner, num_complex::Complex};
use tauri::{Emitter, Manager, UserAttentionType};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use walkdir::WalkDir;

#[cfg(not(dev))]
use tauri::{ipc::CapabilityBuilder, Url, WebviewUrl, WebviewWindowBuilder};

#[cfg(dev)]
use tauri::{WebviewUrl, WebviewWindowBuilder};

const REQUIRED_SOUNDPACK_FILES: [&str; 7] = [
    "startup-sound.mp3",
    "shutdown-sound.mp3",
    "join-sound.mp3",
    "part-sound.mp3",
    "message-sound.mp3",
    "system-sound.mp3",
    "signal-station.mp3",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CustomAssetEntry {
    name: String,
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CustomAssetsResult {
    themes: Vec<CustomAssetEntry>,
    soundpacks: Vec<CustomAssetEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentConfFile {
    #[serde(alias = "mqtt_server")]
    mqtt_server: Option<String>,
    #[serde(alias = "default_lobby")]
    default_lobby: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentConfPayload {
    mqtt_server: String,
    default_lobby: String,
    file_path: String,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn compute_spectrum(samples: Vec<f32>) -> Result<Vec<f32>, String> {
    if samples.is_empty() {
        return Ok(Vec::new());
    }

    let fft_len = samples.len().next_power_of_two();
    let mut buffer: Vec<Complex<f32>> = samples
        .into_iter()
        .map(|sample| Complex::new(sample, 0.0))
        .collect();

    buffer.resize(fft_len, Complex::new(0.0, 0.0));

    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(fft_len);
    fft.process(&mut buffer);

    let bin_count = fft_len / 2;
    let magnitudes = buffer
        .into_iter()
        .take(bin_count)
        .map(|value| value.norm() / fft_len as f32)
        .collect();

    Ok(magnitudes)
}

#[tauri::command]
fn raise_dm_window(app: tauri::AppHandle) -> Result<bool, String> {
    let Some(window) = app.get_webview_window("dm-window") else {
        return Ok(false);
    };

    if window.is_minimized().map_err(|error| error.to_string())? {
        window.unminimize().map_err(|error| error.to_string())?;
    }

    window.show().map_err(|error| error.to_string())?;
    window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    window
        .request_user_attention(Some(UserAttentionType::Critical))
        .map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    window
        .set_always_on_top(false)
        .map_err(|error| error.to_string())?;
    window
        .request_user_attention(None)
        .map_err(|error| error.to_string())?;

    Ok(true)
}

#[tauri::command]
fn raise_agentamp_window(app: tauri::AppHandle) -> Result<bool, String> {
    let Some(window) = app.get_webview_window("agentamp-window") else {
        return Ok(false);
    };

    if window.is_minimized().map_err(|error| error.to_string())? {
        window.unminimize().map_err(|error| error.to_string())?;
    }

    window.show().map_err(|error| error.to_string())?;
    window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    window
        .request_user_attention(Some(UserAttentionType::Critical))
        .map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    window
        .set_always_on_top(false)
        .map_err(|error| error.to_string())?;
    window
        .request_user_attention(None)
        .map_err(|error| error.to_string())?;

    Ok(true)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MediaLibraryFolderEntry {
    path: String,
    added_at: u64,
    last_scan_at: Option<u64>,
    track_count: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MediaLibraryTrackEntry {
    id: String,
    path: String,
    name: String,
    folder_path: String,
    media_type: String,
    artist: Option<String>,
    title: Option<String>,
    album: Option<String>,
    year: Option<String>,
    genre: Option<String>,
    track_number: Option<String>,
    duration: Option<f32>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LibraryTrackPayload {
    path: String,
    artist: Option<String>,
    title: Option<String>,
    album: Option<String>,
    year: Option<String>,
    genre: Option<String>,
    media_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewMediaLibraryTrackPayload {
    path: String,
    artist: Option<String>,
    title: Option<String>,
    album: Option<String>,
    year: Option<String>,
    genre: Option<String>,
    track_number: Option<String>,
    media_type: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MetadataReadResult {
    artist: Option<String>,
    title: Option<String>,
    album: Option<String>,
    year: Option<String>,
    genre: Option<String>,
    track_number: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MediaLibraryState {
    folders: Vec<MediaLibraryFolderEntry>,
    tracks: Vec<MediaLibraryTrackEntry>,
}

fn media_library_state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {}", error))?;

    Ok(app_data_dir.join("media_library.json"))
}

fn load_media_library_state_internal(app: &tauri::AppHandle) -> Result<MediaLibraryState, String> {
    let path = media_library_state_path(app)?;
    if !path.is_file() {
        return Ok(MediaLibraryState {
            folders: Vec::new(),
            tracks: Vec::new(),
        });
    }

    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read media library state: {}", error))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("Failed to parse media library state: {}", error))
}

fn normalize_library_path(path: &str) -> String {
    path.replace('\\', "/")
}

fn save_media_library_state_internal(app: &tauri::AppHandle, state: &MediaLibraryState) -> Result<(), String> {
    let path = media_library_state_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create media library directory: {}", error))?;
    }

    let contents = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to serialize media library state: {}", error))?;
    fs::write(&path, contents)
        .map_err(|error| format!("Failed to save media library state: {}", error))
}

fn is_supported_media_extension(ext: &str) -> bool {
    matches!(ext.to_ascii_lowercase().as_str(), "mp3" | "m4a" | "flac" | "mp4" | "webm" | "mov")
}

fn metadata_from_audio(path: &Path) -> (Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>) {
    let tag = audiotags::Tag::new().read_from_path(path).ok();
    if let Some(tag) = tag {
        (
            tag.artist().map(|value| value.to_string()),
            tag.title().map(|value| value.to_string()),
            tag.album().map(|value| value.title.to_string()),
            tag.year().map(|value| value.to_string()),
            tag.genre().map(|value| value.to_string()),
            tag.track_number().map(|value| value.to_string()),
        )
    } else {
        (None, None, None, None, None, None)
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MediaLibraryScanProgress {
    folder_path: String,
    scanned_files: u32,
    matched_files: u32,
    current_path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MediaLibraryScanComplete {
    folder_path: String,
    scanned_files: u32,
    matched_files: u32,
}

#[tauri::command]
fn load_media_library_state(app: tauri::AppHandle) -> Result<MediaLibraryState, String> {
    load_media_library_state_internal(&app)
}

#[tauri::command]
fn scan_media_library_folder(app: tauri::AppHandle, folder_path: String) -> Result<(), String> {
    let folder_path_buf = PathBuf::from(folder_path.clone());
    if !folder_path_buf.is_dir() {
        return Err(format!("Folder does not exist: {}", folder_path));
    }

    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut scanned_files = 0u32;
        let mut matched_files = 0u32;
        let mut new_tracks: Vec<MediaLibraryTrackEntry> = Vec::new();

        for entry in WalkDir::new(&folder_path_buf).into_iter().filter_map(Result::ok) {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            scanned_files += 1;
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if !is_supported_media_extension(ext) {
                    continue;
                }

                matched_files += 1;
                let filename = path
                    .file_stem()
                    .and_then(|stem| stem.to_str())
                    .unwrap_or_default()
                    .to_string();

                let (artist, title, album, year, genre, track_number) = if matches!(ext.to_ascii_lowercase().as_str(), "mp3" | "m4a" | "flac" | "mp4" | "mov") {
                    metadata_from_audio(path)
                } else {
                    (None, None, None, None, None, None)
                };

                let media_type = if matches!(ext.to_ascii_lowercase().as_str(), "mp4" | "webm" | "mov") {
                    "video"
                } else {
                    "audio"
                };

                let track = MediaLibraryTrackEntry {
                    id: format!("{}-{}", folder_path_buf.to_string_lossy(), matched_files),
                    path: path.to_string_lossy().to_string(),
                    name: title.clone().unwrap_or_else(|| filename.clone()),
                    folder_path: folder_path.clone(),
                    media_type: media_type.to_string(),
                    artist,
                    title,
                    album,
                    year,
                    genre,
                    track_number,
                    duration: None,
                };

                new_tracks.push(track);
            }

            if matched_files % 25 == 0 {
                let progress = MediaLibraryScanProgress {
                    folder_path: folder_path.clone(),
                    scanned_files,
                    matched_files,
                    current_path: path.to_string_lossy().to_string(),
                };
                let _ = app_handle.emit("media-library-scan-progress", progress);
            }
        }

        let mut library_state = load_media_library_state_internal(&app_handle).unwrap_or(MediaLibraryState {
            folders: Vec::new(),
            tracks: Vec::new(),
        });

        let updated_folder = MediaLibraryFolderEntry {
            path: folder_path.clone(),
            added_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_millis() as u64)
                .unwrap_or(0),
            last_scan_at: Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|duration| duration.as_millis() as u64)
                    .unwrap_or(0),
            ),
            track_count: Some(matched_files),
        };

        let existing_folder_index = library_state.folders.iter().position(|folder| folder.path == folder_path);
        if let Some(index) = existing_folder_index {
            library_state.folders[index] = updated_folder;
        } else {
            library_state.folders.push(updated_folder);
        }

        let mut track_map = library_state
            .tracks
            .into_iter()
            .map(|track| (track.path.clone(), track))
            .collect::<std::collections::HashMap<_, _>>();

        for track in new_tracks {
            track_map.insert(track.path.clone(), track);
        }

        library_state.tracks = track_map.into_values().collect();

        let _ = save_media_library_state_internal(&app_handle, &library_state);

        let complete = MediaLibraryScanComplete {
            folder_path: folder_path.clone(),
            scanned_files,
            matched_files,
        };
        let _ = app_handle.emit("media-library-scan-complete", complete);
    });

    Ok(())
}

#[tauri::command]
fn library_add_tracks_to_playlist(app: tauri::AppHandle, tracks: Vec<LibraryTrackPayload>) -> Result<bool, String> {
    app.emit("media-library-add-to-playlist", tracks)
        .map_err(|error: tauri::Error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn lookup_media_library_track(app: tauri::AppHandle, path: String) -> Result<Option<MediaLibraryTrackEntry>, String> {
    let normalized_path = normalize_library_path(&path);
    let state = load_media_library_state_internal(&app)?;
    Ok(state
        .tracks
        .into_iter()
        .find(|track| normalize_library_path(&track.path) == normalized_path))
}

#[tauri::command]
fn add_media_library_track(app: tauri::AppHandle, payload: NewMediaLibraryTrackPayload) -> Result<bool, String> {
    let mut library_state = load_media_library_state_internal(&app)?;
    let normalized_path = normalize_library_path(&payload.path);
    let folder_path = PathBuf::from(&payload.path)
        .parent()
        .map(|parent| normalize_library_path(&parent.to_string_lossy()))
        .unwrap_or_default();

    let new_track = MediaLibraryTrackEntry {
        id: normalized_path.clone(),
        path: normalized_path.clone(),
        name: payload.title.clone().unwrap_or_else(|| {
            PathBuf::from(&normalized_path)
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or_default()
                .to_string()
        }),
        folder_path,
        media_type: payload.media_type.unwrap_or_else(|| "audio".to_string()),
        artist: payload.artist,
        title: payload.title,
        album: payload.album,
        year: payload.year,
        genre: payload.genre,
        track_number: payload.track_number,
        duration: None,
    };

    let mut track_map = library_state
        .tracks
        .into_iter()
        .map(|track| (track.path.clone(), track))
        .collect::<std::collections::HashMap<_, _>>();
    track_map.insert(new_track.path.clone(), new_track);
    library_state.tracks = track_map.into_values().collect();

    save_media_library_state_internal(&app, &library_state)
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn remove_media_library_folder(app: tauri::AppHandle, folder_path: String) -> Result<bool, String> {
    let mut state = load_media_library_state_internal(&app)?;
    state.folders.retain(|folder| folder.path != folder_path);
    state.tracks.retain(|track| track.folder_path != folder_path);
    save_media_library_state_internal(&app, &state)
        .map_err(|error| error.to_string())?;
    Ok(true)
}

fn ensure_custom_asset_folders(app_data_dir: &Path) -> Result<(), String> {
    let themes_dir = app_data_dir.join("themes");
    fs::create_dir_all(&themes_dir)
        .map_err(|error| format!("Failed to create themes directory: {}", error))?;

    let soundpacks_dir = app_data_dir.join("soundpacks");
    fs::create_dir_all(&soundpacks_dir)
        .map_err(|error| format!("Failed to create soundpacks directory: {}", error))?;

    let template_path = themes_dir.join("mint-cream.css");
    if !template_path.exists() {
        let template_content = include_str!("../../src/themes/templates/mint-cream.css");
        fs::write(&template_path, template_content)
            .map_err(|error| format!("Failed to write mint-cream.css template: {}", error))?;
    }

    Ok(())
}

fn init_custom_folders(app_data_dir: &PathBuf) {
    if let Err(error) = ensure_custom_asset_folders(app_data_dir) {
        eprintln!("Warning: {}", error);
    }
}

fn is_valid_custom_theme_css(theme_name: &str, css_content: &str) -> bool {
    let css = css_content.trim();
    if css.is_empty() || !css.contains('{') || !css.contains('}') {
        return false;
    }

    let expected_selector_single = format!(":root[data-theme='{}']", theme_name);
    let expected_selector_double = format!(":root[data-theme=\"{}\"]", theme_name);

    css.contains(&expected_selector_single)
        || css.contains(&expected_selector_double)
        || (css.contains(":root[data-theme=") && css.contains("--color-"))
}

fn discover_custom_themes(app_data_dir: &Path) -> Vec<CustomAssetEntry> {
    let themes_dir = app_data_dir.join("themes");
    let Ok(entries) = fs::read_dir(themes_dir) else {
        return Vec::new();
    };

    let mut themes: Vec<CustomAssetEntry> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .map(|ext| ext.eq_ignore_ascii_case("css"))
                    .unwrap_or(false)
        })
        .filter_map(|path| {
            let theme_name = path.file_stem()?.to_string_lossy().trim().to_string();
            if theme_name.is_empty() {
                return None;
            }

            let css_content = fs::read_to_string(&path).ok()?;
            if !is_valid_custom_theme_css(&theme_name, &css_content) {
                return None;
            }

            Some(CustomAssetEntry {
                name: theme_name,
                path: path.to_string_lossy().to_string(),
            })
        })
        .collect();

    themes.sort_by(|a, b| a.name.cmp(&b.name));
    themes
}

fn discover_custom_soundpacks(app_data_dir: &Path) -> Vec<CustomAssetEntry> {
    let soundpacks_dir = app_data_dir.join("soundpacks");
    let Ok(entries) = fs::read_dir(soundpacks_dir) else {
        return Vec::new();
    };

    let mut soundpacks: Vec<CustomAssetEntry> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .filter_map(|path| {
            let pack_name = path.file_name()?.to_string_lossy().trim().to_string();
            if pack_name.is_empty() {
                return None;
            }

            let has_all_required_files = REQUIRED_SOUNDPACK_FILES
                .iter()
                .all(|required_file| path.join(required_file).is_file());

            if !has_all_required_files {
                return None;
            }

            Some(CustomAssetEntry {
                name: pack_name,
                path: path.to_string_lossy().to_string(),
            })
        })
        .collect();

    soundpacks.sort_by(|a, b| a.name.cmp(&b.name));
    soundpacks
}

fn open_folder_in_os(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Failed to open folder: {}", error))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Failed to open folder: {}", error))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Failed to open folder: {}", error))?;
    }

    Ok(())
}

struct LocalVideoProxy {
    port: u16,
}

impl LocalVideoProxy {
    fn start() -> Result<Self, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|error| format!("Failed to bind local video proxy: {}", error))?;
        let port = listener
            .local_addr()
            .map_err(|error| format!("Failed to get local video proxy port: {}", error))?
            .port();

        thread::Builder::new()
            .name("local-video-proxy".to_string())
            .spawn(move || {
                for stream in listener.incoming() {
                    if let Ok(stream) = stream {
                        let _ = handle_local_video_proxy_connection(stream);
                    }
                }
            })
            .map_err(|error| format!("Failed to start local video proxy thread: {}", error))?;

        Ok(Self { port })
    }
}

fn handle_local_video_proxy_connection(mut stream: TcpStream) -> Result<(), String> {
    let mut buffer = [0_u8; 8192];
    let read_bytes = stream
        .read(&mut buffer)
        .map_err(|_| "Failed to read request".to_string())?;
    if read_bytes == 0 {
        return Ok(());
    }

    let request = String::from_utf8_lossy(&buffer[..read_bytes]);
    let mut lines = request.lines();
    let request_line = lines
        .next()
        .ok_or_else(|| "Invalid HTTP request".to_string())?;

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let raw_target = parts.nth(1).unwrap_or("");
    if method == "OPTIONS" {
        let response = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: Range, Cache-Control, Content-Type\r\nAccess-Control-Max-Age: 86400\r\nConnection: close\r\n\r\n";
        stream.write_all(response.as_bytes()).ok();
        return Ok(());
    }

    if method != "GET" {
        let response = "HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n";
        stream.write_all(response.as_bytes()).ok();
        return Ok(());
    }

    let (path, query) = if let Some((path, query)) = raw_target.split_once('?') {
        (path, query)
    } else {
        (raw_target, "")
    };

    if path != "/local-video" {
        let response = "HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n";
        stream.write_all(response.as_bytes()).ok();
        return Ok(());
    }

    let headers = parse_http_headers(lines);
    let query_params = parse_query_params(query);
    let raw_path = match query_params.get("path") {
        Some(path) => path,
        None => {
            let response = "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nMissing path";
            stream.write_all(response.as_bytes()).ok();
            return Ok(());
        }
    };

    let file_path = match normalize_local_file_path(raw_path) {
        Some(path) => path,
        None => {
            let response = "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nInvalid path";
            stream.write_all(response.as_bytes()).ok();
            return Ok(());
        }
    };

    let mut file = std::fs::File::open(&file_path)
        .map_err(|_| "Failed to open local video file".to_string())?;
    let metadata = file
        .metadata()
        .map_err(|_| "Failed to read local video metadata".to_string())?;

    if !metadata.is_file() {
        let response = "HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\nFile not found";
        stream.write_all(response.as_bytes()).ok();
        return Ok(());
    }

    let file_size = metadata.len();
    let range_header = headers.get("range").map(|value| value.as_str());
    let (status_line, start, end) = match range_header {
        Some(range_value) if range_value.starts_with("bytes=") => {
            if let Some((start_str, end_str)) = range_value[6..].split_once('-') {
                let start = start_str.parse::<u64>().unwrap_or(0);
                let end = if end_str.is_empty() {
                    file_size.saturating_sub(1)
                } else {
                    end_str.parse::<u64>().unwrap_or(file_size.saturating_sub(1))
                };
                let end = end.min(file_size.saturating_sub(1));
                if start > end || start >= file_size {
                    let response = "HTTP/1.1 416 Range Not Satisfiable\r\nConnection: close\r\n\r\n";
                    stream.write_all(response.as_bytes()).ok();
                    return Ok(());
                }
                ("HTTP/1.1 206 Partial Content", start, end)
            } else {
                ("HTTP/1.1 200 OK", 0, file_size.saturating_sub(1))
            }
        }
        _ => ("HTTP/1.1 200 OK", 0, file_size.saturating_sub(1)),
    };

    let content_length = end.saturating_sub(start).saturating_add(1);
    let content_type = guess_mime_type(&file_path);

    let mut response_headers = format!(
        "{}\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Range, Cache-Control, Content-Type\r\nAccess-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length\r\nConnection: close\r\n",
        status_line,
        content_type,
        content_length,
    );

    if status_line.starts_with("HTTP/1.1 206") {
        response_headers.push_str(&format!(
            "Content-Range: bytes {}-{}/{}\r\n",
            start, end, file_size
        ));
    }

    response_headers.push_str("\r\n");
    stream.write_all(response_headers.as_bytes()).map_err(|_| "Failed to write response headers".to_string())?;
    file.seek(SeekFrom::Start(start)).map_err(|_| "Failed to seek local video file".to_string())?;
    let mut limited_reader = file.take(content_length);
    std::io::copy(&mut limited_reader, &mut stream)
        .map_err(|_| "Failed to stream local video file".to_string())?;

    Ok(())
}

fn parse_http_headers<'a, I>(lines: I) -> std::collections::HashMap<String, String>
where
    I: Iterator<Item = &'a str>,
{
    let mut headers = std::collections::HashMap::new();
    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }
        if let Some((name, value)) = trimmed.split_once(':') {
            headers.insert(name.to_ascii_lowercase(), value.trim().to_string());
        }
    }
    headers
}

fn parse_query_params(query: &str) -> std::collections::HashMap<String, String> {
    query
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .map(|(key, value)| (percent_decode(key), percent_decode(value)))
        .collect()
}

fn percent_decode(value: &str) -> String {
    let mut decoded = String::with_capacity(value.len());
    let bytes = value.as_bytes();
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                if let (Some(high), Some(low)) = (from_hex_digit(bytes[index + 1]), from_hex_digit(bytes[index + 2])) {
                    decoded.push((high << 4 | low) as char);
                    index += 3;
                    continue;
                }
                decoded.push('%');
                index += 1;
            }
            b'+' => {
                decoded.push(' ');
                index += 1;
            }
            byte => {
                decoded.push(byte as char);
                index += 1;
            }
        }
    }

    decoded
}

fn from_hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn normalize_local_file_path(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim();
    let normalized = if let Some(stripped) = trimmed.strip_prefix("file://localhost/") {
        stripped
    } else if let Some(stripped) = trimmed.strip_prefix("file:///") {
        stripped
    } else if let Some(stripped) = trimmed.strip_prefix("file://") {
        stripped
    } else {
        trimmed
    };

    let separator = std::path::MAIN_SEPARATOR.to_string();
    let normalized = normalized.replace('/', &separator);
    let normalized = normalized.replace('\\', &separator);
    let path = PathBuf::from(normalized);
    if path.is_absolute() {
        Some(path)
    } else {
        None
    }
}

fn guess_mime_type(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.to_ascii_lowercase()) {
        Some(ext) if ext == "mp4" => "video/mp4",
        Some(ext) if ext == "mov" => "video/quicktime",
        Some(ext) if ext == "webm" => "video/webm",
        Some(ext) if ext == "mkv" => "video/x-matroska",
        Some(ext) if ext == "mp3" => "audio/mpeg",
        Some(ext) if ext == "m4a" => "audio/mp4",
        Some(ext) if ext == "wav" => "audio/wav",
        Some(ext) if ext == "ogg" => "audio/ogg",
        Some(ext) if ext == "ogv" => "video/ogg",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
fn setup_custom_folders(app: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to get app data directory: {}", error))?;

    ensure_custom_asset_folders(&app_data_dir)
}

fn parse_agentconf_path(args: &[String]) -> Option<String> {
    args.iter()
        .find(|arg| arg.to_lowercase().ends_with(".agentconf"))
        .cloned()
}

fn is_valid_mqtt_server(url: &str) -> bool {
    let raw = url.trim();
    if raw.is_empty() {
        return false;
    }

    let lower = raw.to_lowercase();
    if !(lower.starts_with("wss://") || lower.starts_with("ws://")) {
        return false;
    }

    if raw.contains(' ') {
        return false;
    }

    true
}

fn normalize_agentconf_lobby_id(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let normalized = trimmed
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
        .collect::<String>();

    if normalized.is_empty() {
        return None;
    }

    Some(normalized)
}

fn read_agentconf_file(file_path: &str) -> Result<AgentConfPayload, String> {
    let path_buf = PathBuf::from(file_path);
    if !path_buf.exists() {
        return Err(format!("Agent config file does not exist: {}", file_path));
    }

    let content = fs::read_to_string(&path_buf)
        .map_err(|error| format!("Failed to read agentconf file: {}", error))?;

    let config: AgentConfFile = serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse agentconf JSON: {}", error))?;

    let mqtt_server = config.mqtt_server.ok_or_else(|| {
        "agentconf file missing required field 'mqttServer' or 'mqtt_server'".to_string()
    })?;
    if !is_valid_mqtt_server(&mqtt_server) {
        return Err("agentconf file contains an invalid mqttServer value; expected ws:// or wss:// URL without spaces".to_string());
    }

    let default_lobby_raw = config.default_lobby.ok_or_else(|| {
        "agentconf file missing required field 'defaultLobby' or 'default_lobby'".to_string()
    })?;
    let default_lobby = normalize_agentconf_lobby_id(&default_lobby_raw).ok_or_else(|| {
        "agentconf file contains an invalid defaultLobby value; expected letters, numbers, or underscores".to_string()
    })?;

    Ok(AgentConfPayload {
        mqtt_server: mqtt_server.trim().to_string(),
        default_lobby,
        file_path: file_path.to_string(),
    })
}

fn emit_agentconf_event(window: &tauri::WebviewWindow, event_name: &str, payload: impl serde::Serialize + Clone) {
    let _ = window.emit(event_name, payload);
}

fn emit_agentconf_opened(window: &tauri::WebviewWindow, payload: AgentConfPayload) {
    emit_agentconf_event(window, "agentconf-file-opened", payload);
}

fn emit_agentconf_error(window: &tauri::WebviewWindow, message: String) {
    emit_agentconf_event(window, "agentconf-file-error", message);
}

fn handle_agentconf_arguments(args: &[String]) -> Result<AgentConfPayload, String> {
    let file_path = parse_agentconf_path(args).ok_or_else(|| {
        "No .agentconf file path found in app arguments.".to_string()
    })?;

    read_agentconf_file(&file_path)
}

#[tauri::command]
fn discover_custom_assets(app: tauri::AppHandle) -> Result<CustomAssetsResult, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to get app data directory: {}", error))?;

    ensure_custom_asset_folders(&app_data_dir)?;

    Ok(CustomAssetsResult {
        themes: discover_custom_themes(&app_data_dir),
        soundpacks: discover_custom_soundpacks(&app_data_dir),
    })
}

#[tauri::command]
fn open_themes_folder(app: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to get app data directory: {}", error))?;

    ensure_custom_asset_folders(&app_data_dir)?;
    open_folder_in_os(&app_data_dir.join("themes"))
}

#[tauri::command]
fn open_soundpacks_folder(app: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to get app data directory: {}", error))?;

    ensure_custom_asset_folders(&app_data_dir)?;
    open_folder_in_os(&app_data_dir.join("soundpacks"))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MetadataEditFields {
    artist: Option<String>,
    title: Option<String>,
    album: Option<String>,
    year: Option<String>,
    genre: Option<String>,
    track_number: Option<String>,
}

fn to_syncsafe_integer(value: u32) -> [u8; 4] {
    [
        ((value >> 21) & 0x7f) as u8,
        ((value >> 14) & 0x7f) as u8,
        ((value >> 7) & 0x7f) as u8,
        (value & 0x7f) as u8,
    ]
}

fn strip_existing_id3(data: &[u8]) -> &[u8] {
    let mut start = 0usize;
    let mut end = data.len();

    if data.len() >= 10 && &data[0..3] == b"ID3" {
        let tag_size = ((data[6] as u32 & 0x7f) << 21)
            | ((data[7] as u32 & 0x7f) << 14)
            | ((data[8] as u32 & 0x7f) << 7)
            | (data[9] as u32 & 0x7f);
        let frame_end = 10 + tag_size as usize;
        if frame_end <= data.len() {
            start = frame_end;
        }
    }

    if end >= start + 128 && &data[end - 128..end - 125] == b"TAG" {
        end -= 128;
    }

    &data[start..end]
}

fn build_id3v2_tag(metadata: &MetadataEditFields) -> Vec<u8> {
    let mut frames = Vec::new();

    fn add_text_frame(frames: &mut Vec<u8>, frame_id: &str, text: &Option<String>) {
        let value = text.as_deref().unwrap_or("").trim();
        if value.is_empty() {
            return;
        }

        let payload = value.as_bytes();
        let mut frame_data = Vec::with_capacity(1 + payload.len());
        frame_data.push(3);
        frame_data.extend_from_slice(payload);

        let mut header = Vec::with_capacity(10);
        header.extend_from_slice(frame_id.as_bytes());
        let frame_size = frame_data.len() as u32;
        header.extend_from_slice(&[
            (frame_size >> 24) as u8,
            (frame_size >> 16) as u8,
            (frame_size >> 8) as u8,
            frame_size as u8,
        ]);
        header.extend_from_slice(&[0, 0]);

        frames.extend_from_slice(&header);
        frames.extend_from_slice(&frame_data);
    }

    add_text_frame(&mut frames, "TPE1", &metadata.artist);
    add_text_frame(&mut frames, "TIT2", &metadata.title);
    add_text_frame(&mut frames, "TALB", &metadata.album);
    add_text_frame(&mut frames, "TYER", &metadata.year);
    add_text_frame(&mut frames, "TCON", &metadata.genre);
    add_text_frame(&mut frames, "TRCK", &metadata.track_number);

    if frames.is_empty() {
        return Vec::new();
    }

    let mut header = Vec::with_capacity(10);
    header.extend_from_slice(b"ID3");
    header.push(3);
    header.push(0);
    header.push(0);
    header.extend_from_slice(&to_syncsafe_integer(frames.len() as u32));

    [header, frames].concat()
}

fn normalize_metadata_path(path: &str) -> String {
    if let Some(stripped) = path.strip_prefix("file:///") {
        stripped.to_string()
    } else if let Some(stripped) = path.strip_prefix("file://localhost/") {
        stripped.to_string()
    } else if let Some(stripped) = path.strip_prefix("file://") {
        stripped.to_string()
    } else {
        path.to_string()
    }
}

#[tauri::command]
fn save_agentamp_metadata(path: String, metadata: MetadataEditFields) -> Result<(), String> {
    let normalized = normalize_metadata_path(&path);
    let path_buf = PathBuf::from(&normalized);

    if !path_buf.exists() {
        return Err(format!("Failed to save audio metadata: file does not exist: {}", normalized));
    }

    let extension = path_buf
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();

    if extension == "m4a" || extension == "mp4" || extension == "mov" || extension == "m4v" {
        let mut tag = Tag::new()
            .read_from_path(&normalized)
            .map_err(|error| format!("Failed to read M4A metadata: {}", error))?;

        if let Some(artist) = metadata.artist.as_ref() {
            tag.set_artist(artist);
        }
        if let Some(title) = metadata.title.as_ref() {
            tag.set_title(title);
        }
        if let Some(album) = metadata.album.as_ref() {
            tag.set_album_title(album);
        }
        if let Some(year) = metadata.year.as_ref() {
            if let Ok(year) = year.parse::<i32>() {
                tag.set_year(year);
            }
        }
        if let Some(genre) = metadata.genre.as_ref() {
            tag.set_genre(genre);
        }
        if let Some(track_number) = metadata.track_number.as_ref() {
            if let Ok(track_number) = track_number.parse::<u16>() {
                tag.set_track_number(track_number);
            }
        }

        tag.write_to_path(&normalized)
            .map_err(|error| format!("Failed to write M4A metadata: {}", error))
    } else {
        let raw_bytes = fs::read(&path_buf)
            .map_err(|error| format!("Failed to read MP3 for metadata save: {}", error))?;

        let cleaned_audio = strip_existing_id3(&raw_bytes);
        let new_tag = build_id3v2_tag(&metadata);
        let mut output = Vec::with_capacity(new_tag.len() + cleaned_audio.len());
        output.extend_from_slice(&new_tag);
        output.extend_from_slice(cleaned_audio);

        fs::write(&path_buf, &output)
            .map_err(|error| format!("Failed to write MP3 metadata: {}", error))
    }
}

#[tauri::command]
fn read_agentamp_metadata(path: String) -> Result<MetadataReadResult, String> {
    let normalized = normalize_metadata_path(&path);
    let path_buf = PathBuf::from(&normalized);

    if !path_buf.exists() {
        return Err(format!("File does not exist: {}", normalized));
    }

    let extension = path_buf
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();

    let (artist, title, album, year, genre, track_number) = if matches!(extension.as_str(), "mp3" | "m4a" | "flac" | "mp4" | "mov" | "m4v") {
        metadata_from_audio(&path_buf)
    } else {
        (None, None, None, None, None, None)
    };

    Ok(MetadataReadResult {
        artist,
        title,
        album,
        year,
        genre,
        track_number,
    })
}

#[tauri::command]
fn get_local_video_proxy_base_url(state: tauri::State<'_, LocalVideoProxy>) -> String {
    format!("http://localhost:{}", state.port)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = portpicker::pick_unused_port().expect("failed to find unused port");
    let local_video_proxy = LocalVideoProxy::start().expect("failed to start local video proxy");

    tauri::Builder::default()
        .manage(local_video_proxy)
        .plugin(tauri_plugin_localhost::Builder::new(port).build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                match handle_agentconf_arguments(&args) {
                    Ok(payload) => emit_agentconf_opened(&window, payload),
                    Err(error) => emit_agentconf_error(&window, error),
                }
            }
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            if let Ok(app_data_dir) = app.path().app_data_dir() {
                init_custom_folders(&app_data_dir);
            }

            #[cfg(dev)]
            let url = WebviewUrl::App(std::path::PathBuf::from("/"));

            #[cfg(not(dev))]
            let url = {
                let url: Url = format!("http://localhost:{}", port).parse().unwrap();

                app.add_capability(
                    CapabilityBuilder::new("localhost")
                        .remote(url.to_string())
                        .windows(["main", "dm-window-*", "agentamp-window", "media-library"])
                        .permission("core:default")
                        .permission("core:event:allow-emit-to")
                        .permission("core:window:allow-set-size")
                        .permission("fs:default")
                        .permission("fs:allow-download-write")
                        .permission("dialog:default")
                        .permission("opener:default")
                        .permission("core:window:allow-create")
                        .permission("core:webview:allow-create-webview-window")
                        .permission("core:window:allow-close")
                        .permission("core:window:allow-hide")
                        .permission("core:window:allow-start-dragging")
                        .permission("core:window:allow-maximize")
                        .permission("core:window:allow-unmaximize")
                        .permission("core:window:allow-minimize")
                        .permission("core:window:allow-unminimize")
                        .permission("core:window:allow-is-maximized")
                        .permission("core:window:allow-show")
                        .permission("core:window:allow-set-focus")
                        .permission("core:window:allow-destroy")
                        .permission("core:window:allow-set-always-on-top")
                        .permission("core:window:allow-request-user-attention")
                        .permission("updater:allow-check")
                        .permission("updater:allow-download")
                        .permission("updater:allow-install")
                        .permission("updater:allow-download-and-install")
                        .permission("store:default")
                        .permission("process:allow-exit")
                        .permission("process:allow-restart"),
                )?;

                WebviewUrl::External(url)
            };

            let main_window = WebviewWindowBuilder::new(app, "main", url)
                // Required on Windows for HTML5 drag/drop events (dragover/drop) inside the webview.
                .disable_drag_drop_handler()
                .title("AGENT // LOBBY")
                .decorations(false)
                .inner_size(800.0, 600.0)
                .build()?;

            match handle_agentconf_arguments(&std::env::args().collect::<Vec<_>>()) {
                Ok(payload) => emit_agentconf_opened(&main_window, payload),
                Err(error) => emit_agentconf_error(&main_window, error),
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            compute_spectrum,
            raise_dm_window,
            raise_agentamp_window,
            setup_custom_folders,
            discover_custom_assets,
            open_themes_folder,
            open_soundpacks_folder,
            save_agentamp_metadata,
            load_media_library_state,
            scan_media_library_folder,
            library_add_tracks_to_playlist,
            lookup_media_library_track,
            add_media_library_track,
            remove_media_library_folder,
            read_agentamp_metadata,
            get_local_video_proxy_base_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
