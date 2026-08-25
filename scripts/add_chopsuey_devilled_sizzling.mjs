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
    if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
      SUPABASE_SERVICE_KEY = trimmed.split('=')[1].replace(/^["']|["']$/g, '');
    }
  }
} catch (error) {
  console.error('Failed to read .env file:', error.message);
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CHINESE_CATEGORY_ID = '35ca6679-8517-4a0b-bdeb-777cde8d4b60';
const BENMAR_KITCHEN_ID = 'd54617dc-5b1e-456b-934d-65e21ab1b8ff';
const TABLE_MENU_BOOK_ID = 'ff890d06-0ad6-4b32-829f-4d386fe1a412';
const LOCAL_IMAGE_PATH = 'c:\\Users\\ROG STRIX\\Desktop\\Restaurant ERP new\\src\\assets\\login-food-bg.png';

const subcatChopsueyRice = 'aa463dbe-6ff8-4e84-a944-5de727daa6a7';
const subcatChopsueyDishes = 'c2909ff8-da1a-4e85-b7a3-a15ac23bcb49';
const subcatDevilled = 'e8808692-b271-40dc-a79d-e9b356b3a4f2';
const subcatSweetSour = 'ab52f6f2-3f0f-4ba4-a0ab-f014a5b26cb0';
const subcatSizzling = '5e1a2af5-881d-4132-8ff8-34b4c653bd8d';

const menuItemsRaw = [
  // 1. Chopsuey Rice
  { name: 'CHICKEN CHOPSUEY RICE', subcat: subcatChopsueyRice, variants: [{ name: 'M', price: 2990 }, { name: 'L', price: 3990 }] },
  { name: 'FISH CHOPSUEY RICE', subcat: subcatChopsueyRice, variants: [{ name: 'M', price: 3180 }, { name: 'L', price: 4180 }] },
  { name: 'MIX CHOPSUEY RICE', subcat: subcatChopsueyRice, variants: [{ name: 'M', price: 4200 }, { name: 'L', price: 5200 }] },
  { name: 'SEAFOOD CHOPSUEY RICE', subcat: subcatChopsueyRice, variants: [{ name: 'M', price: 4200 }, { name: 'L', price: 5200 }] },
  { name: 'SPECIAL CHOPSUEY RICE', subcat: subcatChopsueyRice, price: 8380 },

  // 2. Chopsuey Dishes
  { name: 'CHOPSUEY CHICKEN', subcat: subcatChopsueyDishes, price: 2680 },
  { name: 'CHOPSUEY FISH', subcat: subcatChopsueyDishes, price: 3580 },
  { name: 'CHOPSUEY MIXED', subcat: subcatChopsueyDishes, price: 3480 },
  { name: 'CHOPSUEY SEAFOOD', subcat: subcatChopsueyDishes, price: 2280 },
  { name: 'CHOPSUEY VEGETABLE', subcat: subcatChopsueyDishes, price: 1580 },

  // 3. Devilishly Good
  { name: 'DEVILLED CASHEW NUT', subcat: subcatDevilled, price: 2280 },
  { name: 'DEVILLED CHICKEN', subcat: subcatDevilled, price: 1980 },
  { name: 'DEVILLED CUTTLE FISH', subcat: subcatDevilled, price: 2380 },
  { name: 'DEVILLED FISH', subcat: subcatDevilled, price: 2080 },
  { name: 'DEVILLED PRAWNS', subcat: subcatDevilled, price: 2280 },
  { name: 'DEVILLED SAUSAGE', subcat: subcatDevilled, price: 1580 },
  { name: 'DEVILLED SEAFOOD', subcat: subcatDevilled, price: 2480 },
  { name: 'DEVILLED MIX', subcat: subcatDevilled, price: 2580 },

  // 4. Sweet and Sour
  { name: 'SWEET & SOUR CHICKEN', subcat: subcatSweetSour, price: 2140 },
  { name: 'SWEET & SOUR FISH', subcat: subcatSweetSour, price: 2140 },
  { name: 'SWEET & SOUR PRAWNS', subcat: subcatSweetSour, price: 2440 },

  // 5. Sizzling Platter
  { name: 'SIZZLING CHILLI CHICKEN', subcat: subcatSizzling, price: 2380 },
  { name: 'SIZZLING CUTTLE FISH', subcat: subcatSizzling, price: 2600 },
  { name: 'SIZZLING FISH', subcat: subcatSizzling, price: 2380 },
  { name: 'ULTIMATE SIZZLING SEAFOOD', subcat: subcatSizzling, price: 3880 },
  { name: 'MEGA SIZZLING MIX', subcat: subcatSizzling, price: 3980 },
  { name: 'SIZZLING PRAWNS', subcat: subcatSizzling, price: 2680 },
  { name: 'MIXED GRILL', subcat: subcatSizzling, price: 6180 },
];

async function main() {
  console.log('=== Seeding Chopsuey, Devilled, Sweet & Sour, Sizzling Platter ===\n');

  // 1. Get Branch ID and Company ID dynamically
  const { data: branches, error: branchErr } = await supabase.from('branches').select('id, company_id').limit(1);
  if (branchErr || !branches || branches.length === 0) {
    console.error('❌ Failed to retrieve branch/company info:', branchErr?.message || 'No branches found');
    process.exit(1);
  }
  const branchId = branches[0].id;
  const companyId = branches[0].company_id;
  console.log(`Branch ID: ${branchId}`);
  console.log(`Company ID: ${companyId}\n`);

  // 2. Map Subcategories to Kitchen if not mapped
  const subcats = [subcatChopsueyRice, subcatChopsueyDishes, subcatDevilled, subcatSweetSour, subcatSizzling];
  for (const subcatId of subcats) {
    const { data: existingMap } = await supabase
      .from('kitchen_subcategory_map')
      .select('id')
      .eq('subcategory_id', subcatId)
      .eq('kitchen_id', BENMAR_KITCHEN_ID)
      .maybeSingle();

    if (!existingMap) {
      console.log(`Mapping subcategory ${subcatId} to BENMAR kitchen...`);
      const { error: mapErr } = await supabase
        .from('kitchen_subcategory_map')
        .insert({
          branch_id: branchId,
          category_id: CHINESE_CATEGORY_ID,
          subcategory_id: subcatId,
          kitchen_id: BENMAR_KITCHEN_ID,
          is_active: true
        });
      if (mapErr) {
        console.error(`❌ Failed to map subcategory ${subcatId}:`, mapErr.message);
        process.exit(1);
      }
      console.log('✅ Subcategory mapped successfully!');
    } else {
      console.log(`✅ Mapping already exists for subcategory ${subcatId}!`);
    }
  }
  console.log('');

  // 3. Find current max sort order in TABLE MENU BOOK
  console.log('Retrieving sort order for menu book...');
  const { data: maxBookItem } = await supabase
    .from('menu_book_items')
    .select('sort_order')
    .eq('menu_book_id', TABLE_MENU_BOOK_ID)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  let sortOrder = (maxBookItem?.sort_order || 0) + 1;
  console.log(`Next sort order starts at: ${sortOrder}\n`);

  // 4. Read placeholder image
  if (!existsSync(LOCAL_IMAGE_PATH)) {
    console.error('❌ Local placeholder image not found at path:', LOCAL_IMAGE_PATH);
    process.exit(1);
  }
  const fileBuffer = readFileSync(LOCAL_IMAGE_PATH);

  // 5. Loop over items and insert
  for (const item of menuItemsRaw) {
    // Find next item code dynamically at each step to avoid conflicts and network retries
    const { data: latestItems } = await supabase
      .from('menu_items')
      .select('item_code')
      .order('item_code', { ascending: false })
      .limit(1);

    let nextCodeNum = 219;
    if (latestItems && latestItems.length > 0) {
      const code = latestItems[0].item_code;
      const match = code.match(/MI-0*(\d+)/);
      if (match) {
        nextCodeNum = parseInt(match[1]) + 1;
      }
    }

    const itemCode = `MI-0${nextCodeNum}`;
    const basePrice = item.variants ? item.variants[0].price : item.price;
    const isVeg = item.name.includes('VEGETABLE') || item.name.includes('CASHEW');
    console.log(`Processing ${itemCode} - ${item.name} (Base Price: ${basePrice})...`);

    // Upload image
    const storagePath = `chopsuey_devilled_sizzling/${itemCode}_${Date.now()}.png`;
    const { error: uploadErr } = await supabase.storage
      .from('menu-images')
      .upload(storagePath, fileBuffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadErr) {
      console.error(`  ❌ Failed to upload image: ${uploadErr.message}`);
      continue;
    }

    const { data: publicUrlData } = supabase.storage.from('menu-images').getPublicUrl(storagePath);
    const imageUrl = publicUrlData.publicUrl;
    console.log(`  ✅ Image uploaded: ${imageUrl}`);

    // Insert to menu_items
    const { data: insertedItem, error: insertErr } = await supabase
      .from('menu_items')
      .insert({
        company_id: companyId,
        category_id: CHINESE_CATEGORY_ID,
        sub_category_id: item.subcat,
        kitchen_id: BENMAR_KITCHEN_ID,
        item_code: itemCode,
        name: item.name,
        base_price: basePrice,
        image_url: imageUrl,
        is_available: true,
        is_published_on_web: true,
        is_veg: isVeg,
        is_spicy: false,
        is_best_seller: false,
        preparation_time_mins: 15,
        sort_order: sortOrder
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error(`  ❌ Failed to insert menu item: ${insertErr.message}`);
      continue;
    }
    console.log(`  ✅ Menu item created: ID ${insertedItem.id}`);

    // Insert variations if they exist
    if (item.variants) {
      console.log('  Inserting item variations...');
      for (const [vIndex, variant] of item.variants.entries()) {
        const { error: varErr } = await supabase
          .from('item_variants')
          .insert({
            menu_item_id: insertedItem.id,
            name: variant.name,
            price: variant.price,
            sort_order: vIndex + 1,
            is_active: true
          });
        if (varErr) {
          console.error(`    ❌ Failed to insert variant ${variant.name}: ${varErr.message}`);
        } else {
          console.log(`    ✅ Variant ${variant.name} (${variant.price}) added!`);
        }
      }
    }

    // Insert to menu_book_items
    const { error: bookErr } = await supabase
      .from('menu_book_items')
      .insert({
        menu_book_id: TABLE_MENU_BOOK_ID,
        menu_item_id: insertedItem.id,
        override_price: basePrice,
        is_available: true,
        sort_order: sortOrder++
      });

    if (bookErr) {
      console.error(`  ❌ Failed to add to menu book: ${bookErr.message}`);
    } else {
      console.log(`  ✅ Added to TABLE MENU BOOK`);
    }
    console.log('');
  }

  console.log('=== All Done! ===');
}

main().catch(console.error);
