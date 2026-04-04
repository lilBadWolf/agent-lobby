use rustfft::{FftPlanner, num_complex::Complex};
use tauri::{Manager, UserAttentionType};

#[cfg(not(dev))]
use tauri::{ipc::CapabilityBuilder, Url, WebviewUrl, WebviewWindowBuilder};

#[cfg(dev)]
use tauri::{WebviewUrl, WebviewWindowBuilder};

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
            #[cfg(dev)]
            let url = WebviewUrl::App(std::path::PathBuf::from("/"));

            #[cfg(not(dev))]
            let url = {
                let url: Url = format!("http://localhost:{}", port).parse().unwrap();

                app.add_capability(
                    CapabilityBuilder::new("localhost")
                        .remote(url.to_string())
                        .windows(["main", "dm-window", "agentamp-window"])
                        .permission("core:default")
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
        .invoke_handler(tauri::generate_handler![greet, compute_spectrum, raise_dm_window, raise_agentamp_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
