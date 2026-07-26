import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseWt3dXphanR3dnd1YXZtdHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI5NjA4MSwiZXhwIjoyMDg2ODcyMDgxfQ.ph7Yy1Izhz21kmJSKXpowbWJYGYMz0YxlpoVG6hBABA';

const adminClient = createClient(supabaseUrl, serviceKey);
const publicClient = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log('--- Checking login_audit_logs with Service Role ---');
  // 1. Ensure table structure exists
  const serviceInsert = await adminClient.from('login_audit_logs').insert({
    email: 'test_admin@sevenwaves.lk',
    status: 'success',
    device_type: 'Desktop',
    browser: 'Node',
    os: 'Windows',
    logged_at: new Date().toISOString()
  });
  console.log('Service role insert:', serviceInsert.error ? serviceInsert.error : 'SUCCESS');

  // 2. Test authenticated client insert
  console.log('\n--- Testing login_audit_logs with Authenticated User ---');
  await publicClient.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: 'Admin@123456',
  });

  const authInsert = await publicClient.from('login_audit_logs').insert({
    email: 'admin@sevenwaves.lk',
    status: 'success',
    device_type: 'Desktop',
    browser: 'Chrome',
    os: 'Windows',
    logged_at: new Date().toISOString()
  });
  console.log('Authenticated user insert:', authInsert.error ? authInsert.error : 'SUCCESS');
}

run().catch(console.error);
