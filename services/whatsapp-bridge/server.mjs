// @ts-nocheck
import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root ERP directory
const rootEnvPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
let supabase = null;
let companyId = null;

if (SUPABASE_URL && SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SERVICE_KEY);
}

const PORT = process.env.PORT || 3005;
const app = express();

// Full CORS + Private Network Access (PNA) headers so browser can call localhost from HTTPS without errors
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Access-Control-Request-Private-Network, x-client-info, apikey');
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

let sock = null;
let qrCodeDataUrl = null;
let isConnected = false;
let connectedUser = null;
let lastDisconnectReason = null;

const logger = pino({ level: 'silent' });

// ── Sync Status to Supabase Cloud so HTTPS ERP can read with 0 Mixed-Content errors ──
async function syncStatusToCloud() {
  if (!supabase) return;
  try {
    if (!companyId) {
      const { data: comp } = await supabase.from('companies').select('id').limit(1).single();
      if (comp) companyId = comp.id;
    }
    if (!companyId) return;

    const payload = {
      connected: isConnected,
      user: connectedUser ? {
        number: connectedUser.id.split(':')[0],
        name: connectedUser.name || 'Seven Waves'
      } : null,
      qr: isConnected ? null : qrCodeDataUrl,
      serviceRunning: true,
      lastSeen: Date.now()
    };

    const { data: existing } = await supabase
      .from('system_settings')
      .select('id')
      .eq('setting_key', 'whatsapp_bridge_status')
      .maybeSingle();

    if (existing) {
      await supabase
        .from('system_settings')
        .update({ setting_value: payload, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('system_settings')
        .insert({
          company_id: companyId,
          setting_key: 'whatsapp_bridge_status',
          setting_value: payload
        });
    }
  } catch (err) {
    console.debug('[Cloud Sync Note]:', err?.message);
  }
}

// ── Outbox Concurrency Lock & Deduplication Cache ──────────────────────────────
let isProcessingOutbox = false;
const processedItemIds = new Set();
const recentSendHistory = new Map(); // dedupeKey -> timestamp (60s TTL)

// ── Cloud Outbox Dispatcher (Processes messages queued from HTTPS ERP) ────────
async function processCloudOutbox() {
  if (isProcessingOutbox) return; // STRICT MUTEX: Prevent overlapping outbox dispatch loops!
  if (!supabase || !isConnected || !sock) return;

  isProcessingOutbox = true;
  try {
    const { data: outboxRow } = await supabase
      .from('system_settings')
      .select('id, setting_value')
      .eq('setting_key', 'whatsapp_outbox')
      .maybeSingle();

    if (!outboxRow || !outboxRow.setting_value) return;
    const items = outboxRow.setting_value.items || [];
    const pendingItems = items.filter(it => it.status === 'pending' && !processedItemIds.has(it.id));

    if (pendingItems.length === 0) return;

    for (const item of pendingItems) {
      if (processedItemIds.has(item.id)) continue;
      processedItemIds.add(item.id);

      const clean = cleanPhone(item.phone);
      const dedupeKey = `${clean}_${item.filename || ''}_${(item.caption || '').slice(0, 35)}`;
      const lastSent = recentSendHistory.get(dedupeKey);

      // Deduplication: if exact payslip was sent to this phone within the last 60 seconds, skip!
      if (lastSent && Date.now() - lastSent < 60000) {
        console.log(`[Cloud Outbox] ⏭️ Skipping duplicate dispatch to +${clean} (sent ${Math.round((Date.now() - lastSent)/1000)}s ago)`);
        item.status = 'sent';
        item.sentAt = new Date(lastSent).toISOString();
        item.pdfBase64 = null;
        continue;
      }

      try {
        console.log(`[Cloud Outbox] Sending PDF to +${clean}...`);
        const jid = `${clean}@s.whatsapp.net`;
        const rawBase64 = (item.pdfBase64 || '').replace(/^data:application\/pdf;base64,/, '').replace(/\s/g, '');
        const buffer = Buffer.from(rawBase64, 'base64');

        await sock.sendMessage(jid, {
          document: buffer,
          mimetype: 'application/pdf',
          fileName: item.filename || `Payslip_${clean}.pdf`,
          caption: item.caption || '🌟 *Seven Waves Restaurant (Pvt) Ltd*\n📄 *Official Monthly Payslip*'
        });

        item.status = 'sent';
        item.sentAt = new Date().toISOString();
        item.pdfBase64 = null;
        recentSendHistory.set(dedupeKey, Date.now());
        console.log(`[Cloud Outbox] ✅ Sent successfully to +${clean}`);
      } catch (sendErr) {
        console.error(`[Cloud Outbox] ❌ Error sending to ${item.phone}:`, sendErr.message);
        item.status = 'failed';
        item.error = sendErr.message;
        item.pdfBase64 = null;
      }
    }

    // Keep last 10 items, stripping pdfBase64 from sent/failed items
    const trimmed = items.slice(-10).map(it => (it.status === 'sent' || it.status === 'failed') ? { ...it, pdfBase64: null } : it);
    await supabase
      .from('system_settings')
      .update({ setting_value: { items: trimmed }, updated_at: new Date().toISOString() })
      .eq('id', outboxRow.id);
  } catch (err) {
    console.debug('[Outbox Poll Note]:', err?.message);
  } finally {
    isProcessingOutbox = false;
  }
}

async function connectToWhatsApp() {
  const authFolder = path.join(__dirname, 'auth_info_baileys');
  if (!fs.existsSync(authFolder)) {
    fs.mkdirSync(authFolder, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`[WhatsApp Bridge] Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: true,
    browser: ['Seven Waves ERP', 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        qrCodeDataUrl = await QRCode.toDataURL(qr, { scale: 8, margin: 2 });
      } catch (e) {
        console.error('Error generating QR Data URL', e);
      }
      console.log('\n======================================================');
      console.log('📱 SCAN THE QR CODE BELOW WITH WHATSAPP TO CONNECT:');
      console.log('   (Or view directly inside ERP Payroll or http://localhost:3005)');
      console.log('======================================================\n');
      try {
        const qrTerminal = await QRCode.toString(qr, { type: 'terminal', small: true });
        console.log(qrTerminal);
      } catch (err) {
        console.debug('Terminal QR render note:', err?.message);
      }
      await syncStatusToCloud();
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      isConnected = false;
      connectedUser = null;
      lastDisconnectReason = lastDisconnect?.error?.message || `Status: ${statusCode}`;
      console.log(`[WhatsApp Bridge] Connection closed due to: ${lastDisconnectReason}. Reconnecting: ${shouldReconnect}`);
      await syncStatusToCloud();
      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000);
      } else {
        console.log('[WhatsApp Bridge] Logged out. Deleting old session...');
        try {
          fs.rmSync(authFolder, { recursive: true, force: true });
        } catch (err) {
          console.debug('Session cleanup note:', err?.message);
        }
        setTimeout(connectToWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      isConnected = true;
      qrCodeDataUrl = null;
      connectedUser = sock.user;
      console.log('\n======================================================');
      console.log(`✅ WHATSAPP CONNECTED SUCCESSFULLY!`);
      console.log(`   Connected Number: ${sock.user?.id ? sock.user.id.split(':')[0] : 'Unknown'}`);
      console.log(`   User Name: ${sock.user?.name || 'Seven Waves'}`);
      console.log('======================================================\n');
      await syncStatusToCloud();
    }
  });
}

function cleanPhone(raw) {
  let cleaned = String(raw || '').replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '94' + cleaned.slice(1);
  }
  if (!cleaned.startsWith('94') && cleaned.length === 9) {
    cleaned = '94' + cleaned;
  }
  return cleaned;
}

// ── Web Dashboard (Shows Live QR or Connected Status) ────────────────────────
app.get('/', (req, res) => {
  const userNum = connectedUser?.id ? connectedUser.id.split(':')[0] : '';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Seven Waves ERP - WhatsApp Gateway</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Poppins', sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #1e293b; border-radius: 16px; padding: 32px; max-width: 500px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); text-align: center; border: 1px solid #334155; }
    h1 { font-size: 22px; margin-bottom: 8px; color: #38bdf8; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.5; margin-top: 0; }
    .qr-box { background: white; padding: 16px; border-radius: 12px; display: inline-block; margin: 20px 0; }
    .qr-box img { width: 260px; height: 260px; display: block; }
    .badge-ok { background: #10b981; color: white; padding: 8px 16px; border-radius: 9999px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; }
    .test-box { background: #0f172a; border-radius: 12px; padding: 20px; margin-top: 24px; text-align: left; border: 1px solid #334155; }
    input, button { width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid #475569; background: #1e293b; color: white; margin-top: 8px; font-family: inherit; box-sizing: border-box; }
    button { background: #2563eb; color: white; font-weight: 600; cursor: pointer; border: none; margin-top: 14px; }
    button:hover { background: #1d4ed8; }
    .step-list { text-align: left; font-size: 13px; color: #cbd5e1; margin: 16px 0; padding-left: 20px; }
    .step-list li { margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🌊 Seven Waves ERP</h1>
    <p>WhatsApp PDF Dispatch Gateway</p>

    ${isConnected ? `
      <div style="margin: 30px 0;">
        <span class="badge-ok">✅ WhatsApp Connected (+${userNum})</span>
      </div>
      <p style="color: #4ade80;">The gateway is online and ready to deliver payslip PDFs directly to employees.</p>

      <div class="test-box">
        <h3 style="margin: 0 0 10px 0; font-size: 15px; color: #38bdf8;">Send Test Payslip PDF</h3>
        <label style="font-size: 12px; color: #94a3b8;">Recipient WhatsApp Number:</label>
        <input type="text" id="testPhone" value="0717266563" placeholder="e.g. 0717266563" />
        <button onclick="sendTestPdf()">Send Test Payslip PDF</button>
        <div id="testResult" style="margin-top: 10px; font-size: 13px;"></div>
      </div>
    ` : `
      ${qrCodeDataUrl ? `
        <div class="qr-box">
          <img src="${qrCodeDataUrl}" alt="WhatsApp QR Code" />
        </div>
        <ol class="step-list">
          <li>Open <strong>WhatsApp</strong> on your phone</li>
          <li>Tap <strong>Settings</strong> or <strong>Menu (⋮)</strong> &gt; <strong>Linked Devices</strong></li>
          <li>Tap <strong>Link a Device</strong> and point your camera at this QR code</li>
        </ol>
        <p style="font-size: 12px; color: #f59e0b;">This page refreshes automatically once connected.</p>
      ` : `
        <div style="padding: 40px 0;">
          <p>⏳ Initializing WhatsApp service and generating QR code... Please wait 5 seconds.</p>
        </div>
      `}
    `}
  </div>

  <script>
    const isConn = ${isConnected};
    if (!isConn) {
      setTimeout(() => window.location.reload(), 4000);
    }

    async function sendTestPdf() {
      const phone = document.getElementById('testPhone').value;
      const resDiv = document.getElementById('testResult');
      resDiv.innerHTML = '<span style="color:#f59e0b;">⏳ Sending test PDF...</span>';

      try {
        const resp = await fetch('/send-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phone })
        });
        const data = await resp.json();
        if (data.success) {
          resDiv.innerHTML = '<span style="color:#4ade80;">✅ Test PDF sent successfully to ' + phone + '! Check WhatsApp.</span>';
        } else {
          resDiv.innerHTML = '<span style="color:#f87171;">❌ Failed: ' + (data.error || 'Unknown error') + '</span>';
        }
      } catch (err) {
        resDiv.innerHTML = '<span style="color:#f87171;">❌ Error: ' + err.message + '</span>';
      }
    }
  </script>
</body>
</html>
  `;
  res.send(html);
});

// ── Status API ──────────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  res.json({
    connected: isConnected,
    user: connectedUser ? {
      number: connectedUser.id.split(':')[0],
      name: connectedUser.name
    } : null,
    hasQr: !!qrCodeDataUrl,
    qr: qrCodeDataUrl
  });
});

// ── Send PDF Document API ────────────────────────────────────────────────────
app.post('/send-pdf', async (req, res) => {
  if (!isConnected || !sock) {
    return res.status(503).json({
      success: false,
      error: 'WhatsApp is not connected. Please scan the QR code first.'
    });
  }

  try {
    const { phone, pdfBase64, filename, caption } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required.' });
    }
    if (!pdfBase64) {
      return res.status(400).json({ success: false, error: 'pdfBase64 data is required.' });
    }

    const clean = cleanPhone(phone);
    const jid = `${clean}@s.whatsapp.net`;

    const rawBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '').replace(/\s/g, '');
    const buffer = Buffer.from(rawBase64, 'base64');

    const fileName = filename || `Payslip_${clean}.pdf`;
    const docCaption = caption || '🌟 *Seven Waves Restaurant (Pvt) Ltd*\n📄 *Official Monthly Payslip Advice*';

    const dedupeKey = `${clean}_${fileName}_${docCaption.slice(0, 35)}`;
    const lastSent = recentSendHistory.get(dedupeKey);
    if (lastSent && Date.now() - lastSent < 60000) {
      console.log(`[WhatsApp Bridge] ⏭️ Skipping duplicate /send-pdf to +${clean} (sent ${Math.round((Date.now() - lastSent)/1000)}s ago)`);
      return res.json({
        success: true,
        recipient: clean,
        duplicate: true,
        note: 'Already dispatched recently'
      });
    }

    console.log(`[WhatsApp Bridge] Sending PDF (${buffer.length} bytes) to +${clean} as "${fileName}"...`);

    const result = await sock.sendMessage(jid, {
      document: buffer,
      mimetype: 'application/pdf',
      fileName: fileName,
      caption: docCaption
    });

    recentSendHistory.set(dedupeKey, Date.now());
    console.log(`[WhatsApp Bridge] ✅ Message delivered successfully:`, result?.key?.id);
    return res.json({
      success: true,
      recipient: clean,
      messageId: result?.key?.id
    });
  } catch (err) {
    console.error('[WhatsApp Bridge] ❌ Error sending document:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to dispatch WhatsApp document.'
    });
  }
});

// ── Send Plain Text WhatsApp Message API ──────────────────────────────────────
app.post('/send-message', async (req, res) => {
  if (!isConnected || !sock) {
    return res.status(503).json({
      success: false,
      error: 'WhatsApp is not connected. Please scan the QR code first.'
    });
  }

  try {
    const { phone, message } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required.' });
    }
    if (!message) {
      return res.status(400).json({ success: false, error: 'Message text is required.' });
    }

    const clean = cleanPhone(phone);
    const jid = `${clean}@s.whatsapp.net`;

    console.log(`[WhatsApp Bridge] Sending text message to +${clean}...`);
    const result = await sock.sendMessage(jid, { text: message });
    console.log(`[WhatsApp Bridge] ✅ Text message delivered:`, result?.key?.id);

    return res.json({
      success: true,
      recipient: clean,
      messageId: result?.key?.id
    });
  } catch (err) {
    console.error('[WhatsApp Bridge] ❌ Error sending text message:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to dispatch WhatsApp text message.'
    });
  }
});

// ── Send Test PDF API ────────────────────────────────────────────────────────
app.post('/send-test', async (req, res) => {
  if (!isConnected || !sock) {
    return res.status(503).json({
      success: false,
      error: 'WhatsApp is not connected. Please scan the QR code first.'
    });
  }

  try {
    const phone = cleanPhone(req.body.phone || '0717266563');
    const jid = `${phone}@s.whatsapp.net`;

    const samplePdfBase64 =
      'JVBERi0xLjQKJeLjz9MKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNTk1IDg0Ml0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjUgMCBvYmo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2E+PmVuZG9iago0IDAgb2JqPDwvTGVuZ3RoIDE0MD4+c3RyZWFtCkJUCi9GMSAxNiBUZgoxMDAgNzUwIFRkCihTRVZFTiBXQVZFUyBSRVNUAURBTlQgLSBPZkZJQ0lBTCBQQVlTTElQKSBUagovRjEgMTIgVGYKMTAwIDcwMCBUZApJRW1wbG95ZWU6IE1yLiBLYXJhbiB8IE5ldCBTYWxhcnk6IExLUiA2NSwwMTYuODcpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAwNjggMDAwMDAgbiAKMDAwMDAwMDEyNSAwMDAwMCBuIAowMDAwMDAwMzI1IDAwMDAwIG4gCjAwMDAwMDAyNTcgMDAwMDAgbiAKdHJhaWxlcjw8L1NpemUgNi9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjUxOQolJUVPRg==';

    const buffer = Buffer.from(samplePdfBase64, 'base64');
    const caption =
`🌟 *SEVEN WAVES RESTAURANT (PVT) LTD*
📄 *OFFICIAL PAYSLIP ADVICE (TEST)*
━━━━━━━━━━━━━━━━━━━━━
👤 *Employee:* Mr. Karan (Test Mode)
📅 *Period:* 2026-10-01 to 2026-10-31
💰 *Net Salary:* LKR 65,016.87
━━━━━━━━━━━━━━━━━━━━━
✅ *WhatsApp PDF Integration Test Successful!*
_This official PDF file was dispatched automatically by Seven Waves ERP._`;

    console.log(`[WhatsApp Bridge] Sending test PDF to +${phone}...`);
    const result = await sock.sendMessage(jid, {
      document: buffer,
      mimetype: 'application/pdf',
      fileName: 'Seven_Waves_Official_Payslip_Test.pdf',
      caption
    });

    console.log(`[WhatsApp Bridge] Test PDF sent:`, result?.key?.id);
    res.json({ success: true, messageId: result?.key?.id, phone });
  } catch (err) {
    console.error('[WhatsApp Bridge] Test send failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`======================================================`);
  console.log(`🌊 Seven Waves WhatsApp Bridge running on http://localhost:${PORT}`);
  console.log(`======================================================`);
  connectToWhatsApp().catch(err => {
    console.error('Failed to initialize WhatsApp connection:', err);
  });

  // Cloud Outbox worker loop (runs with strict concurrency lock)
  setInterval(() => {
    processCloudOutbox();
  }, 2000);

  // Status heartbeat (every 5 seconds is plenty and reduces DB load)
  setInterval(() => {
    syncStatusToCloud();
  }, 5000);
});
