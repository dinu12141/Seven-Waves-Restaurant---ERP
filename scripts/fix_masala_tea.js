import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co';
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || (console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is not set. Export the service role key (never commit it) and re-run.'), process.exit(1)));

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fixPrice() {
  console.log('Fixing Masala Tea override price...');
  
  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id')
    .ilike('name', '%Masala Tea%');
    
  if (menuItems && menuItems.length > 0) {
    const itemId = menuItems[0].id;
    
    // Clear override price for this item so it falls back to base_price
    const { error } = await supabase
      .from('menu_book_items')
      .update({ override_price: null })
      .eq('menu_item_id', itemId);
      
    if (error) {
        console.error('Error fixing:', error);
    } else {
        console.log('Successfully cleared override_price. It will now use base_price.');
    }
  }
}

fixPrice();
