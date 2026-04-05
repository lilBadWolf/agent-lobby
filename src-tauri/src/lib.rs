use rustfft::{FftPlanner, num_complex::Complex};
use tauri::{Manager, UserAttentionType};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

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

#[tauri::command]
fn setup_custom_folders(app: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to get app data directory: {}", error))?;

    ensure_custom_asset_folders(&app_data_dir)
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
        return Err(format!("Failed to read MP3 for metadata save: file does not exist: {}", normalized));
    }

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = portpicker::pick_unused_port().expect("failed to find unused port");

    tauri::Builder::default()
        .plugin(tauri_plugin_localhost::Builder::new(port).build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
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
                        .windows(["main", "dm-window-*", "agentamp-window"])
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

            WebviewWindowBuilder::new(app, "main", url)
                // Required on Windows for HTML5 drag/drop events (dragover/drop) inside the webview.
                .disable_drag_drop_handler()
                .title("AGENT // LOBBY")
                .decorations(false)
                .inner_size(800.0, 600.0)
                .build()?;

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
            save_agentamp_metadata
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
