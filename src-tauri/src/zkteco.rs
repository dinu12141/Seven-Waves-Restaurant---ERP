// ═══════════════════════════════════════════════════════════════════
// ZKTeco Biometric Protocol — Tauri command implementation
// Seven Waves ERP — fingerprint attendance sync
//
// The device sits on the local network (e.g. 192.168.x.x:4370) and speaks
// a small binary TCP protocol. This is a focused Rust port of the same
// protocol node-zklib implements (used by the Electron build) — ported here
// because Tauri's backend is Rust, not Node, so the JS library can't run
// directly. Only the subset actually used by the ERP is implemented:
// CMD_CONNECT, CMD_GET_FREE_SIZES (device info), CMD_DATA_WRRQ +
// GET_ATTENDANCE_LOGS (pull punches), CMD_CLEAR_ATTLOG, CMD_EXIT.
// ═══════════════════════════════════════════════════════════════════

use serde::Serialize;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

const CMD_CONNECT: u16 = 1000;
const CMD_EXIT: u16 = 1001;
const CMD_ACK_OK: u16 = 2000;
const CMD_PREPARE_DATA: u16 = 1500;
const CMD_DATA: u16 = 1501;
const CMD_FREE_DATA: u16 = 1502;
const CMD_DATA_WRRQ: u16 = 1503;
const CMD_DATA_RDY: u16 = 1504;
const CMD_CLEAR_ATTLOG: u16 = 15;
const CMD_GET_FREE_SIZES: u16 = 50;

const MAX_CHUNK: usize = 65472;
const TCP_MAGIC: [u8; 4] = [0x50, 0x50, 0x82, 0x7d];

// GET_ATTENDANCE_LOGS request payload (matches node-zklib's REQUEST_DATA.GET_ATTENDANCE_LOGS)
const GET_ATTENDANCE_LOGS: [u8; 11] = [
    0x01, 0x0d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

#[derive(Serialize)]
pub struct DeviceInfo {
    pub user_counts: u32,
    pub log_counts: u32,
    pub log_capacity: u32,
}

#[derive(Serialize)]
pub struct AttendanceRecord {
    pub user_id: String,
    // ISO-ish string; frontend parses with `new Date(...)`
    pub record_time: String,
}

struct ZkClient {
    stream: TcpStream,
    session_id: u16,
    reply_id: u16,
}

fn checksum(buf: &[u8]) -> u16 {
    let mut chksum: u32 = 0;
    let mut i = 0;
    while i < buf.len() {
        if i == buf.len() - 1 {
            chksum += buf[i] as u32;
        } else {
            chksum += u16::from_le_bytes([buf[i], buf[i + 1]]) as u32;
        }
        chksum %= 65535;
        i += 2;
    }
    (65535u32.wrapping_sub(chksum).wrapping_sub(1) & 0xFFFF) as u16
}

fn build_tcp_packet(command: u16, session_id: u16, reply_id: u16, data: &[u8]) -> Vec<u8> {
    let mut buf = vec![0u8; 8 + data.len()];
    buf[0..2].copy_from_slice(&command.to_le_bytes());
    buf[2..4].copy_from_slice(&0u16.to_le_bytes());
    buf[4..6].copy_from_slice(&session_id.to_le_bytes());
    buf[6..8].copy_from_slice(&reply_id.to_le_bytes());
    buf[8..].copy_from_slice(data);

    let chk = checksum(&buf);
    buf[2..4].copy_from_slice(&chk.to_le_bytes());

    let mut prefix = vec![0x50u8, 0x50, 0x82, 0x7d, 0, 0, 0, 0];
    let total_len = buf.len() as u16;
    prefix[4..6].copy_from_slice(&total_len.to_le_bytes());

    let mut out = prefix;
    out.extend_from_slice(&buf);
    out
}

fn strip_tcp_header(buf: &[u8]) -> &[u8] {
    if buf.len() < 8 || buf[0..4] != TCP_MAGIC {
        return buf;
    }
    &buf[8..]
}

fn read_response(stream: &mut TcpStream) -> std::io::Result<Vec<u8>> {
    let mut buf = vec![0u8; 4096];
    let n = stream.read(&mut buf)?;
    buf.truncate(n);
    Ok(buf)
}

impl ZkClient {
    fn connect(ip: &str, port: u16, timeout_ms: u64) -> Result<Self, String> {
        let addr = format!("{}:{}", ip, port);
        let stream = TcpStream::connect(&addr).map_err(|e| format!("Cannot reach device at {}: {}", addr, e))?;
        stream
            .set_read_timeout(Some(Duration::from_millis(timeout_ms)))
            .map_err(|e| e.to_string())?;
        stream
            .set_write_timeout(Some(Duration::from_millis(timeout_ms)))
            .map_err(|e| e.to_string())?;

        let mut client = ZkClient { stream, session_id: 0, reply_id: 0 };
        client.handshake()?;
        Ok(client)
    }

    fn handshake(&mut self) -> Result<(), String> {
        let packet = build_tcp_packet(CMD_CONNECT, 0, 0, &[]);
        self.stream.write_all(&packet).map_err(|e| e.to_string())?;
        let reply = read_response(&mut self.stream).map_err(|e| e.to_string())?;
        let body = strip_tcp_header(&reply);
        if body.len() < 8 {
            return Err("Device did not reply to connect handshake".into());
        }
        let command_id = u16::from_le_bytes([body[0], body[1]]);
        if command_id != CMD_ACK_OK {
            return Err(format!("Device rejected connection (command {})", command_id));
        }
        self.session_id = u16::from_le_bytes([body[4], body[5]]);
        self.reply_id = 1;
        Ok(())
    }

    fn exec(&mut self, command: u16, data: &[u8]) -> Result<Vec<u8>, String> {
        self.reply_id = self.reply_id.wrapping_add(1);
        let packet = build_tcp_packet(command, self.session_id, self.reply_id, data);
        self.stream.write_all(&packet).map_err(|e| e.to_string())?;
        let reply = read_response(&mut self.stream).map_err(|e| e.to_string())?;
        Ok(strip_tcp_header(&reply).to_vec())
    }

    fn get_info(&mut self) -> Result<DeviceInfo, String> {
        let body = self.exec(CMD_GET_FREE_SIZES, &[])?;
        // body layout mirrors node-zklib's getInfo(): offsets are into the
        // raw reply (after the 8-byte TCP command header is already stripped
        // by strip_tcp_header, matching removeTcpHeader in utils.js).
        let read_u32 = |b: &[u8], off: usize| -> u32 {
            if b.len() < off + 4 {
                return 0;
            }
            u32::from_le_bytes([b[off], b[off + 1], b[off + 2], b[off + 3]])
        };
        Ok(DeviceInfo {
            user_counts: read_u32(&body, 24),
            log_counts: read_u32(&body, 40),
            log_capacity: read_u32(&body, 72),
        })
    }

    /// CMD_DATA_WRRQ + chunked CMD_DATA_RDY read loop, mirroring
    /// ZKLibTCP.readWithBuffer in node-zklib's zklibtcp.js.
    fn read_with_buffer(&mut self, req_data: &[u8]) -> Result<Vec<u8>, String> {
        self.reply_id = self.reply_id.wrapping_add(1);
        let packet = build_tcp_packet(CMD_DATA_WRRQ, self.session_id, self.reply_id, req_data);
        self.stream.write_all(&packet).map_err(|e| e.to_string())?;

        let reply = read_response(&mut self.stream).map_err(|e| e.to_string())?;
        if reply.len() < 16 {
            return Err("Device sent an incomplete response".into());
        }
        let command_id = u16::from_le_bytes([reply[8], reply[9]]);

        if command_id == CMD_DATA {
            // Small enough to fit in a single packet, no chunking needed.
            return Ok(reply[16..].to_vec());
        }

        if command_id != CMD_ACK_OK && command_id != CMD_PREPARE_DATA {
            return Err(format!("Unexpected response command {}", command_id));
        }

        // Data is prepared — the payload right after the header tells us
        // the total size, then we request it in chunks via CMD_DATA_RDY.
        let recv_data = &reply[16..];
        if recv_data.len() < 5 {
            return Err("Malformed PREPARE_DATA response".into());
        }
        let size = u32::from_le_bytes([recv_data[1], recv_data[2], recv_data[3], recv_data[4]]) as usize;

        let mut result = Vec::with_capacity(size);
        let mut offset = 0usize;

        while offset < size {
            let chunk_size = std::cmp::min(MAX_CHUNK, size - offset);
            self.reply_id = self.reply_id.wrapping_add(1);
            let mut req = vec![0u8; 8];
            req[0..4].copy_from_slice(&(offset as u32).to_le_bytes());
            req[4..8].copy_from_slice(&(chunk_size as u32).to_le_bytes());
            let chunk_req = build_tcp_packet(CMD_DATA_RDY, self.session_id, self.reply_id, &req);
            self.stream.write_all(&chunk_req).map_err(|e| e.to_string())?;

            // A chunk may arrive across multiple TCP reads; keep reading
            // until we have the full expected packet length.
            let mut chunk_buf: Vec<u8> = Vec::new();
            loop {
                let piece = read_response(&mut self.stream).map_err(|e| e.to_string())?;
                if piece.is_empty() {
                    break;
                }
                chunk_buf.extend_from_slice(&piece);
                if chunk_buf.len() < 8 {
                    continue;
                }
                let packet_length = u16::from_le_bytes([chunk_buf[4], chunk_buf[5]]) as usize;
                if chunk_buf.len() >= 8 + packet_length {
                    break;
                }
            }

            if chunk_buf.len() > 16 {
                result.extend_from_slice(&chunk_buf[16..]);
            }
            offset += chunk_size;
        }

        Ok(result)
    }

    fn free_data(&mut self) -> Result<(), String> {
        self.exec(CMD_FREE_DATA, &[])?;
        Ok(())
    }

    fn get_attendances(&mut self) -> Result<Vec<AttendanceRecord>, String> {
        let _ = self.free_data();
        let data = self.read_with_buffer(&GET_ATTENDANCE_LOGS)?;
        let _ = self.free_data();

        const RECORD_SIZE: usize = 40;
        let mut records = Vec::new();
        // First 4 bytes of the payload are a record-count header, matching
        // node-zklib's `data.data.subarray(4)`.
        if data.len() < 4 {
            return Ok(records);
        }
        let mut rest = &data[4..];
        while rest.len() >= RECORD_SIZE {
            let chunk = &rest[..RECORD_SIZE];
            // deviceUserId: ASCII string at bytes [2..11), NUL-terminated.
            let id_bytes = &chunk[2..11];
            let user_id = id_bytes
                .iter()
                .take_while(|&&b| b != 0)
                .map(|&b| b as char)
                .collect::<String>();

            // recordTime: u32 LE at byte offset 27, ZKTeco's packed time format.
            let packed = u32::from_le_bytes([chunk[27], chunk[28], chunk[29], chunk[30]]);
            let record_time = decode_zk_time(packed);

            records.push(AttendanceRecord { user_id, record_time });
            rest = &rest[RECORD_SIZE..];
        }
        Ok(records)
    }

    fn clear_attendance_log(&mut self) -> Result<(), String> {
        self.exec(CMD_CLEAR_ATTLOG, &[])?;
        Ok(())
    }

    fn disconnect(&mut self) {
        let _ = self.exec(CMD_EXIT, &[]);
    }
}

/// ZKTeco packs timestamps into a single u32 — decode matching
/// node-zklib's parseTimeToDate (utils.js).
fn decode_zk_time(mut time: u32) -> String {
    let second = time % 60;
    time = (time - second) / 60;
    let minute = time % 60;
    time = (time - minute) / 60;
    let hour = time % 24;
    time = (time - hour) / 24;
    let day = time % 31 + 1;
    time = (time - (day - 1)) / 31;
    let month = time % 12;
    time = (time - month) / 12;
    let year = time + 2000;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}",
        year,
        month + 1,
        day,
        hour,
        minute,
        second
    )
}

// ─── Tauri Commands ─────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct SyncResult {
    pub success: bool,
    pub error: Option<String>,
    pub info: Option<DeviceInfo>,
    pub records: Option<Vec<AttendanceRecord>>,
}

#[tauri::command]
pub fn biometric_get_info(ip: String, port: u16) -> SyncResult {
    match ZkClient::connect(&ip, port, 10_000) {
        Ok(mut client) => {
            let result = client.get_info();
            client.disconnect();
            match result {
                Ok(info) => SyncResult { success: true, error: None, info: Some(info), records: None },
                Err(e) => SyncResult { success: false, error: Some(e), info: None, records: None },
            }
        }
        Err(e) => SyncResult { success: false, error: Some(e), info: None, records: None },
    }
}

#[tauri::command]
pub fn biometric_pull_attendance(ip: String, port: u16) -> SyncResult {
    match ZkClient::connect(&ip, port, 10_000) {
        Ok(mut client) => {
            let result = client.get_attendances();
            client.disconnect();
            match result {
                Ok(records) => SyncResult { success: true, error: None, info: None, records: Some(records) },
                Err(e) => SyncResult { success: false, error: Some(e), info: None, records: None },
            }
        }
        Err(e) => SyncResult { success: false, error: Some(e), info: None, records: None },
    }
}

#[tauri::command]
pub fn biometric_clear_log(ip: String, port: u16) -> SyncResult {
    match ZkClient::connect(&ip, port, 10_000) {
        Ok(mut client) => {
            let result = client.clear_attendance_log();
            client.disconnect();
            match result {
                Ok(()) => SyncResult { success: true, error: None, info: None, records: None },
                Err(e) => SyncResult { success: false, error: Some(e), info: None, records: None },
            }
        }
        Err(e) => SyncResult { success: false, error: Some(e), info: None, records: None },
    }
}
