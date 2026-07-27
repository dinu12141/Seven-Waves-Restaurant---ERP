import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://clykwuzajtwvwuavmtzs.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseWt3dXphanR3dnd1YXZtdHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI5NjA4MSwiZXhwIjoyMDg2ODcyMDgxfQ.ph7Yy1Izhz21kmJSKXpowbWJYGYMz0YxlpoVG6hBABA';
const supabase = createClient(supabaseUrl, serviceKey);

async function check() {
  const { data: ap, error: e1 } = await supabase.from('v_payable_aging').select('*');
  console.log('v_payable_aging:', ap, e1);

  const { data: ar, error: e2 } = await supabase.from('v_receivable_aging').select('*');
  console.log('v_receivable_aging:', ar, e2);
}

check();
