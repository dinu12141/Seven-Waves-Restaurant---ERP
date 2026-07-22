import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envPath = 'c:\\Users\\ROG STRIX\\Desktop\\Restaurant ERP new\\.env';

let SUPABASE_URL, SUPABASE_SERVICE_KEY;
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('VITE_SUPABASE_URL=')) {
      SUPABASE_URL = trimmed.split('=')[1].replace(/^["']|["']$/g, '');
    }
    if (trimmed.startsWith('VITE_SUPABASE_SERVICE_ROLE_KEY=')) {
      SUPABASE_SERVICE_KEY = trimmed.split('=')[1].replace(/^["']|["']$/g, '');
    }
  }
} catch (error) {
  console.error('Failed to read .env file:', error.message);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const MENU_ITEM_ID = '9a2b0780-3fc0-439e-97fe-19602b6c3a43'; // ID of MI-0197
const TABLE_MENU_BOOK_ID = 'ff890d06-0ad6-4b32-829f-4d386fe1a412';

async function main() {
  console.log('=== Fixing MI-0197 (MONGOLIAN MIXED RICE) ===\n');

  // 1. Insert variations
  console.log('Inserting variations...');
  const variants = [
    { name: 'M', price: 2380, sort_order: 1 },
    { name: 'L', price: 2680, sort_order: 2 }
  ];

  for (const variant of variants) {
    const { error: varErr } = await supabase
      .from('item_variants')
      .upsert({
        menu_item_id: MENU_ITEM_ID,
        name: variant.name,
        price: variant.price,
        sort_order: variant.sort_order,
        is_active: true
      }, { onConflict: 'menu_item_id, name' });

    if (varErr) {
      console.error(`  ❌ Failed to insert variant ${variant.name}:`, varErr.message);
    } else {
      console.log(`  ✅ Variant ${variant.name} (${variant.price}) added!`);
    }
  }

  // 2. Add to TABLE MENU BOOK
  console.log('Adding to TABLE MENU BOOK with sort_order 194...');
  const { error: bookErr } = await supabase
    .from('menu_book_items')
    .upsert({
      menu_book_id: TABLE_MENU_BOOK_ID,
      menu_item_id: MENU_ITEM_ID,
      override_price: 2380,
      is_available: true,
      sort_order: 194
    }, { onConflict: 'menu_book_id, menu_item_id' });

  if (bookErr) {
    console.error('  ❌ Failed to add to menu book:', bookErr.message);
  } else {
    console.log('  ✅ Added to TABLE MENU BOOK successfully!');
  }

  console.log('\n=== Fix Complete ===');
}

main().catch(console.error);
