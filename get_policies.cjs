const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log('Querying pg_policies...');
  const { data, error } = await supabase.rpc('execute_sql', {
    sql: `SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE tablename IN ('orders', 'order_items');`
  });

  if (error) {
    // If execute_sql RPC is not available or failed, fallback to querying via a standard SELECT if possible or execute custom SQL.
    // Wait, let's try calling pg_policies by selecting via standard RPC or write standard query.
    // Actually, execute_sql is a lazy tool on the Supabase MCP server! Let's check if the supabase-mcp-server has execute_sql.
    console.error('RPC failed, we will try another method:', error);
  } else {
    console.log('Policies:', JSON.stringify(data, null, 2));
  }
}

run();
