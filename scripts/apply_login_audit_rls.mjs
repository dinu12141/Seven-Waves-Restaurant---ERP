import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co';
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || (console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is not set. Export the service role key (never commit it) and re-run.'), process.exit(1)));

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
    password: process.env.SW_ADMIN_PASSWORD,
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
