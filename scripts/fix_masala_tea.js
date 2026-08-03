import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://clykwuzajtwvwuavmtzs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseWt3dXphanR3dnd1YXZtdHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI5NjA4MSwiZXhwIjoyMDg2ODcyMDgxfQ.ph7Yy1Izhz21kmJSKXpowbWJYGYMz0YxlpoVG6hBABA';

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
