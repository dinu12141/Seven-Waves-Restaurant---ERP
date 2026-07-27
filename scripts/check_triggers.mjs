import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://clykwuzajtwvwuavmtzs.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseWt3dXphanR3dnd1YXZtdHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI5NjA4MSwiZXhwIjoyMDg2ODcyMDgxfQ.ph7Yy1Izhz21kmJSKXpowbWJYGYMz0YxlpoVG6hBABA';
const supabase = createClient(supabaseUrl, serviceKey);

async function check() {
  const { data, error } = await supabase.rpc('execute_sql', { sql: `
    SELECT trigger_name, event_object_table, action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'finance_vouchers';
  `});
  console.log(data || error);
}
check();
