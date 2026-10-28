import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co';
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || (console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is not set. Export the service role key (never commit it) and re-run.'), process.exit(1))); // service role

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== VERIFYING CHOPSUEY, DEVILLED, SIZZLING, SWEET & SOUR ===\n');

  const subcatIds = [
    'aa463dbe-6ff8-4e84-a944-5de727daa6a7', // CHOPSUEY RICE
    'c2909ff8-da1a-4e85-b7a3-a15ac23bcb49', // CHOPSUEY DISHES
    'e8808692-b271-40dc-a79d-e9b356b3a4f2', // DEVILISHLY GOOD
    'ab52f6f2-3f0f-4ba4-a0ab-f014a5b26cb0', // SWEET AND SOUR
    '5e1a2af5-881d-4132-8ff8-34b4c653bd8d'  // SIZZLING PLATTER
  ];

  // 1. Verify kitchen mappings
  console.log('--- Kitchen Subcategory Mappings ---');
  const { data: mappings } = await supabase
    .from('kitchen_subcategory_map')
    .select('subcategory_id, kitchen_id, is_active')
    .in('subcategory_id', subcatIds);
  console.log(mappings);

  // 2. Verify menu_items
  console.log('\n--- Menu Items (Sample 10) ---');
  const { data: items } = await supabase
    .from('menu_items')
    .select('id, item_code, name, base_price, kitchen_id, sub_category_id, is_veg')
    .in('sub_category_id', subcatIds)
    .order('item_code');
  console.table(items.slice(0, 10));
  console.log(`Total items in database under these subcategories: ${items.length}`);

  // 3. Verify item_variants (Sample 10)
  console.log('\n--- Item Variations (Sample 10) ---');
  const ids = items.map(i => i.id);
  const { data: variants } = await supabase
    .from('item_variants')
    .select('menu_item_id, name, price, sort_order')
    .in('menu_item_id', ids)
    .order('menu_item_id');
  
  const itemNames = {};
  items.forEach(i => { itemNames[i.id] = i.name; });
  console.table(variants.slice(0, 10).map(v => ({
    item: itemNames[v.menu_item_id],
    size: v.name,
    price: v.price,
    order: v.sort_order
  })));
  console.log(`Total variants in database: ${variants.length}`);

  // 4. Verify menu_book_items links (Sample 10)
  console.log('\n--- Links to TABLE MENU BOOK (Sample 10) ---');
  const { data: bookItems } = await supabase
    .from('menu_book_items')
    .select('menu_item_id, override_price, sort_order')
    .in('menu_item_id', ids)
    .order('sort_order');
  console.table(bookItems.slice(0, 10).map(bi => ({
    item: itemNames[bi.menu_item_id],
    override_price: bi.override_price,
    sort_order: bi.sort_order
  })));
  console.log(`Total links in TABLE MENU BOOK: ${bookItems.length}`);
}

main().catch(console.error);
