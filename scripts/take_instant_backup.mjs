import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://clykwuzajtwvwuavmtzs.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseWt3dXphanR3dnd1YXZtdHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI5NjA4MSwiZXhwIjoyMDg2ODcyMDgxfQ.ph7Yy1Izhz21kmJSKXpowbWJYGYMz0YxlpoVG6hBABA';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('--- Seven Waves ERP: Taking Full Verified Database Snapshot ---');
  const startTime = Date.now();

  const { data, error } = await supabase.rpc('export_database');
  if (error) {
    console.error('Snapshot failed:', error);
    process.exit(1);
  }

  const tables = Object.keys(data || {});
  let totalRows = 0;
  tables.forEach(t => totalRows += (data[t] || []).length);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Successfully exported ${tables.length} tables (${totalRows} records) in ${durationSec}s.`);

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Seven_Waves_ERP_FULL_BACKUP_${dateStr}.json`;
  const backupDir = path.join(process.cwd(), 'backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const filePath = path.join(backupDir, filename);
  const payload = {
    metadata: {
      system: 'Seven Waves Restaurant ERP',
      exported_at: new Date().toISOString(),
      schema_version: '2026.09',
      tables_count: tables.length,
      records_count: totalRows,
    },
    tables: data,
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  const sizeMb = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);
  console.log(`Saved backup to: ${filePath} (${sizeMb} MB)`);
}

run().catch(console.error);
