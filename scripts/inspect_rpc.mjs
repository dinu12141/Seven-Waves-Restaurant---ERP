import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://clykwuzajtwvwuavmtzs.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseWt3dXphanR3dnd1YXZtdHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI5NjA4MSwiZXhwIjoyMDg2ODcyMDgxfQ.ph7Yy1Izhz21kmJSKXpowbWJYGYMz0YxlpoVG6hBABA';
const supabase = createClient(supabaseUrl, serviceKey);

async function check() {
  const { data, error } = await supabase.rpc('execute_sql', { sql: `
    SELECT pg_get_functiondef(p.oid) AS func_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'pos_close_shift'
      AND n.nspname = 'public';
  `});
  if (error) console.log('Error:', error);
  else {
    console.log(data);
    if (data && data.length > 0) {
      console.log('--- DEFINITION ---');
      console.log(data[0].func_def);
    }
  }
}
check();
