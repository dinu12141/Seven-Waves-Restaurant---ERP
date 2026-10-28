import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co';
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || (console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is not set. Export the service role key (never commit it) and re-run.'), process.exit(1)));

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkPrice() {
  console.log('Fetching Masala Tea info...');
  
  const { data: menuItems, error: miError } = await supabase
    .from('menu_items')
    .select('*')
    .ilike('name', '%Masala Tea%');
    
  if (miError) console.error(miError);
  console.log('Menu Items:', menuItems);
  
  if (menuItems && menuItems.length > 0) {
    const itemId = menuItems[0].id;
    
    const { data: variants } = await supabase
      .from('item_variants')
      .select('*')
      .eq('menu_item_id', itemId);
    console.log('Variants:', variants);
    
    const { data: bookItems } = await supabase
      .from('menu_book_items')
      .select('*')
      .eq('menu_item_id', itemId);
    console.log('Menu Book Items:', bookItems);
  }
}

checkPrice();
