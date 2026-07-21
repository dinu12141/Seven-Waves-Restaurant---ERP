const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const { data: items, error } = await supabase
    .from('menu_items')
    .select('*')
    .limit(1);

  if (error) {
    console.error("Error fetching items:", error);
    return;
  }

  console.log("Menu Item Keys:", Object.keys(items[0]));
}

main().catch(console.error);
