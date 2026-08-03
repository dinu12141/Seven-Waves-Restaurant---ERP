import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://clykwuzajtwvwuavmtzs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseWt3dXphanR3dnd1YXZtdHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI5NjA4MSwiZXhwIjoyMDg2ODcyMDgxfQ.ph7Yy1Izhz21kmJSKXpowbWJYGYMz0YxlpoVG6hBABA';

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
