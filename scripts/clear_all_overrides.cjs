const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://clykwuzajtwvwuavmtzs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseWt3dXphanR3dnd1YXZtdHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI5NjA4MSwiZXhwIjoyMDg2ODcyMDgxfQ.ph7Yy1Izhz21kmJSKXpowbWJYGYMz0YxlpoVG6hBABA';

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
