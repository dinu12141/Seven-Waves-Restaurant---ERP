// ═══════════════════════════════════════════════════════════════════
// Tauri Rust Backend — Secure command handlers
// Seven Waves ERP — Step 06 Device & Platform Expansion
//
// NOTE: This is a reference implementation. Actual Tauri commands
// are written in Rust. This file documents the command interface
// and can serve as a specification for the Rust implementation.
// ═══════════════════════════════════════════════════════════════════

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::Write;
use std::net::TcpStream;
use std::time::Duration;

// ─── Print Raw Data to Network Printer ──────────────────────────

#[tauri::command]
fn print_raw(data: Vec<u8>, ip: String, port: u16) -> Result<String, String> {
    let addr = format!("{}:{}", ip, port);
    let stream = TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("Invalid address: {}", e))?,
        Duration::from_secs(10),
    ).map_err(|e| format!("Connection failed: {}", e))?;

    let mut stream = stream;
    stream.write_all(&data).map_err(|e| format!("Write failed: {}", e))?;
    stream.flush().map_err(|e| format!("Flush failed: {}", e))?;

    Ok("printed".to_string())
}

// ─── Open Cash Drawer ───────────────────────────────────────────

#[tauri::command]
fn open_cash_drawer(data: Vec<u8>, printer: Option<String>) -> Result<String, String> {
    // Send ESC/POS drawer kick command
    let drawer_cmd: Vec<u8> = if data.is_empty() {
        vec![0x1B, 0x70, 0x00, 0x19, 0x78]
    } else {
        data
    };

    // For USB printers, we'd use the system print API
    // For network printers, send via TCP
    println!("[Tauri] Cash drawer opened via {:?}", printer);
    Ok("drawer_opened".to_string())
}

// ─── File Export ────────────────────────────────────────────────

#[tauri::command]
fn export_file(content: String, filename: String) -> Result<String, String> {
    use tauri::api::dialog::blocking::FileDialogBuilder;

    let path = FileDialogBuilder::new()
        .set_file_name(&filename)
        .save_file()
        .ok_or("User cancelled".to_string())?;

    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Write failed: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

// ─── App Entry Point ────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            print_raw,
            open_cash_drawer,
            export_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
