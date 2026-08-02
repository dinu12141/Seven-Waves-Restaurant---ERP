use tauri::{Emitter, Manager};

mod zkteco;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ── Single Instance ──────────────────────────────────────────
        // Ensures only one instance runs; deep-link URLs are forwarded
        // to the existing window via the "deep-link-received" event.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // args[0] is the binary path, args[1+] may contain deep link URLs
            if let Some(url) = args.get(1) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("deep-link-received", url.clone());
                    let _ = window.set_focus();
                }
            }
        }))
        // ── Deep Link ────────────────────────────────────────────────
        // Registers the "sevenwaves://" custom protocol with the OS
        .plugin(tauri_plugin_deep_link::init())
        // ── Shell ────────────────────────────────────────────────────
        // Allows opening URLs in system browser (for OAuth flow)
        .plugin(tauri_plugin_shell::init())
        // ── Logger (debug only) ──────────────────────────────────────
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        // ── Biometric (ZKTeco fingerprint device) ─────────────────────
        // Runs the TCP protocol directly in Rust — this app is Tauri, not
        // Electron, so the Node-based node-zklib library used elsewhere in
        // the codebase cannot run here. See src-tauri/src/zkteco.rs.
        .invoke_handler(tauri::generate_handler![
            zkteco::biometric_get_info,
            zkteco::biometric_pull_attendance,
            zkteco::biometric_clear_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Seven Waves ERP");
}
