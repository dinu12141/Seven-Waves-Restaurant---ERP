const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co';
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || (console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is not set. Export the service role key (never commit it) and re-run.'), process.exit(1)));

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function clearOverrides() {
  console.log('Clearing ALL override prices from menu_book_items...');
  
  const { error } = await supabase
    .from('menu_book_items')
    .update({ override_price: null })
    .not('override_price', 'is', null); // Update all that are not null
    
  if (error) {
      console.error('Error fixing:', error);
  } else {
      console.log('Successfully cleared all override prices. Everything is now using real-time base_price.');
  }
}

clearOverrides();
