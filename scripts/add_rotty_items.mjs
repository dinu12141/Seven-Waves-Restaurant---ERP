import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';

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

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const INDIAN_CATEGORY_ID = '503b8892-29c9-4b02-a702-923243ac302a';
const ROTTY_SUBCATEGORY_ID = '188627f9-88f3-40e4-942d-4b39c470ed88';
const BENMAR_KITCHEN_ID = 'd54617dc-5b1e-456b-934d-65e21ab1b8ff';
const TABLE_MENU_BOOK_ID = 'ff890d06-0ad6-4b32-829f-4d386fe1a412';
const LOCAL_IMAGE_PATH = 'c:\\Users\\ROG STRIX\\Desktop\\Restaurant ERP new\\src\\assets\\login-food-bg.png';

const rottyItems = [
  { name: 'ALOO PARATA', price: 300, is_veg: true, is_spicy: false },
  { name: 'CHAPATHI POTION (2pcs)', price: 680, is_veg: true, is_spicy: false },
  { name: 'POORI POTION (2 pcs)', price: 780, is_veg: true, is_spicy: false },
  { name: 'PARATA', price: 180, is_veg: true, is_spicy: false },
  { name: 'PARATA CHEESE', price: 280, is_veg: true, is_spicy: false },
  { name: 'PARATA EGG', price: 240, is_veg: false, is_spicy: false },
  { name: 'PARATA WITH EGG& CHEESE', price: 380, is_veg: false, is_spicy: false },
  { name: 'ROTTY EGG & VEGETABLE', price: 270, is_veg: false, is_spicy: false },
  { name: 'TANDOORI ROTI', price: 220, is_veg: true, is_spicy: false }
];

async function safeCall(fn, retries = 5, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fn();
      if (res.error) throw res.error;
      return res.data;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`⚠️ Operation failed: ${err.message || err}. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function main() {
  console.log('=== Seeding Indian Rotty Menu Items ===\n');

  // 1. Get Branch ID and Company ID dynamically
  const branches = await safeCall(() => supabase.from('branches').select('id, company_id').limit(1));
  if (!branches || branches.length === 0) {
    console.error('❌ No branches found');
    process.exit(1);
  }
  const branchId = branches[0].id;
  const companyId = branches[0].company_id;
  console.log(`Branch ID: ${branchId}`);
  console.log(`Company ID: ${companyId}\n`);

  // 2. Map Subcategory to Kitchen if not mapped
  const existingMaps = await safeCall(() => supabase
    .from('kitchen_subcategory_map')
    .select('id')
    .eq('subcategory_id', ROTTY_SUBCATEGORY_ID)
    .eq('kitchen_id', BENMAR_KITCHEN_ID)
  );

  if (!existingMaps || existingMaps.length === 0) {
    console.log(`Mapping ROTTY subcategory to BENMAR kitchen...`);
    await safeCall(() => supabase
      .from('kitchen_subcategory_map')
      .insert({
        branch_id: branchId,
        category_id: INDIAN_CATEGORY_ID,
        subcategory_id: ROTTY_SUBCATEGORY_ID,
        kitchen_id: BENMAR_KITCHEN_ID,
        is_active: true
      })
    );
    console.log('  ✅ Subcategory mapped successfully!\n');
  } else {
    console.log(`  ✅ Mapping already exists for ROTTY subcategory\n`);
  }

  // 3. Find current max sort order in TABLE MENU BOOK
  console.log('Retrieving sort order for menu book...');
  const maxBookItems = await safeCall(() => supabase
    .from('menu_book_items')
    .select('sort_order')
    .eq('menu_book_id', TABLE_MENU_BOOK_ID)
    .order('sort_order', { ascending: false })
    .limit(1)
  );

  let sortOrder = (maxBookItems && maxBookItems.length > 0 ? maxBookItems[0].sort_order : 0) + 1;
  console.log(`Next sort order starts at: ${sortOrder}\n`);

  // 4. Read placeholder image
  if (!existsSync(LOCAL_IMAGE_PATH)) {
    console.error('❌ Local placeholder image not found at path:', LOCAL_IMAGE_PATH);
    process.exit(1);
  }
  const fileBuffer = readFileSync(LOCAL_IMAGE_PATH);

  // 5. Loop over items and insert
  for (const item of rottyItems) {
    // Find latest item code dynamically
    const latestItems = await safeCall(() => supabase
      .from('menu_items')
      .select('item_code')
      .order('item_code', { ascending: false })
      .limit(1)
    );

    let nextCodeNum = 219;
    if (latestItems && latestItems.length > 0) {
      const code = latestItems[0].item_code;
      const match = code.match(/MI-0*(\d+)/);
      if (match) {
        nextCodeNum = parseInt(match[1]) + 1;
      }
    }

    const itemCode = `MI-0${nextCodeNum}`;
    console.log(`Processing ${itemCode} - ${item.name} (Price: ${item.price})...`);

    // Upload image
    const storagePath = `rotty/${itemCode}_${Date.now()}.png`;
    
    let imageUrl = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { error: uploadErr } = await supabase.storage
          .from('menu-images')
          .upload(storagePath, fileBuffer, {
            contentType: 'image/png',
            upsert: true
          });
        if (uploadErr) throw uploadErr;
        
        const { data: publicUrlData } = supabase.storage.from('menu-images').getPublicUrl(storagePath);
        imageUrl = publicUrlData.publicUrl;
        break;
      } catch (err) {
        if (attempt === 4) throw err;
        console.warn(`  ⚠️ Image upload failed: ${err.message || err}. Retrying... (Attempt ${attempt+1}/5)`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    console.log(`  ✅ Image uploaded: ${imageUrl}`);

    // Insert to menu_items
    const insertedItems = await safeCall(() => supabase
      .from('menu_items')
      .insert({
        company_id: companyId,
        category_id: INDIAN_CATEGORY_ID,
        sub_category_id: ROTTY_SUBCATEGORY_ID,
        kitchen_id: BENMAR_KITCHEN_ID,
        item_code: itemCode,
        name: item.name,
 base_price: item.price,
        image_url: imageUrl,
        is_available: true,
        is_published_on_web: true,
        is_veg: item.is_veg,
        is_spicy: item.is_spicy,
        is_best_seller: false,
        preparation_time_mins: 15,
        sort_order: sortOrder
      })
      .select('id')
    );
    
    const itemId = insertedItems[0].id;
    console.log(`  ✅ Menu item created: ID ${itemId}`);

    // Insert to menu_book_items
    await safeCall(() => supabase
      .from('menu_book_items')
      .insert({
        menu_book_id: TABLE_MENU_BOOK_ID,
        menu_item_id: itemId,
        override_price: item.price,
        is_available: true,
        sort_order: sortOrder++
      })
    );
    console.log(`  ✅ Added to TABLE MENU BOOK\n`);
  }

  console.log('=== All Done! ===');
}

main().catch(console.error);
