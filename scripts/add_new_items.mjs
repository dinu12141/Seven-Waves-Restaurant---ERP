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

const CHINESE_CATEGORY_ID = '35ca6679-8517-4a0b-bdeb-777cde8d4b60';
const BENMAR_KITCHEN_ID = 'd54617dc-5b1e-456b-934d-65e21ab1b8ff';
const TABLE_MENU_BOOK_ID = 'ff890d06-0ad6-4b32-829f-4d386fe1a412';
const LOCAL_IMAGE_PATH = 'c:\\Users\\ROG STRIX\\Desktop\\Restaurant ERP new\\src\\assets\\login-food-bg.png';

const subcatFriedFiesta = '4d928493-06dd-48c8-8cb3-8f49d7a24c77';
const subcatHotSpicy = 'a7b59cf0-9103-4021-82a4-3f29acbe6ae8';
const subcatStew = 'c6d20bba-d469-4789-b926-3f5075a1f910';
const subcatChiliCraze = 'cc66fb2d-301e-4795-a7e9-0ac4271ac654';
const subcatEggstraSpecial = '250493e5-f94f-4686-bd5e-6ee7050624e4';

const newItems = [
  // 1. Fried Fiesta
  { name: 'FRIED CASHEW NUT', price: 2280, subcat: subcatFriedFiesta },
  { name: 'FRIED CHICKEN', price: 2080, subcat: subcatFriedFiesta },
  { name: 'FRIED PRAWNS', price: 2280, subcat: subcatFriedFiesta },
  { name: 'FRIED FISH', price: 2180, subcat: subcatFriedFiesta },

  // 2. Hot and Spicy
  { name: 'BATTER FRIED PRAWNS', price: 2280, subcat: subcatHotSpicy },
  { name: 'BATTER FRIED CUTTLE FISH', price: 2280, subcat: subcatHotSpicy },
  { name: 'HOT BUTTER CUTTLEFISH', price: 2180, subcat: subcatHotSpicy },
  { name: 'HOT BUTTER MUSHROOM', price: 1680, subcat: subcatHotSpicy },
  { name: 'HOT BUTTER PRAWNS', price: 2180, subcat: subcatHotSpicy },

  // 3. Stew
  { name: 'CHICKEN STEW', price: 1880, subcat: subcatStew },
  { name: 'FISH STEW', price: 1980, subcat: subcatStew },

  // 4. Chili Craze
  { name: 'CHILLI CHICKEN', price: 2180, subcat: subcatChiliCraze },
  { name: 'CHILI PRAWNS WITH CASHEW NUT', price: 2680, subcat: subcatChiliCraze },
  { name: 'CHILLI CHICKEN WITH CASHEW NUT', price: 2280, subcat: subcatChiliCraze },
  { name: 'CHILLI CUTTLEFISH', price: 2380, subcat: subcatChiliCraze },
  { name: 'CHILLI FISH', price: 2080, subcat: subcatChiliCraze },
  { name: 'CHILLI FISH WITH CASHEW NUT', price: 2230, subcat: subcatChiliCraze },
  { name: 'CHILLI MIX', price: 2980, subcat: subcatChiliCraze },
  { name: 'CHILLI PRAWNS', price: 2580, subcat: subcatChiliCraze },

  // 5. Eggstra Special
  { name: 'OMELETTE CHEESE', price: 1580, subcat: subcatEggstraSpecial },
  { name: 'OMELETTE CHEESE & CHICKEN', price: 1880, subcat: subcatEggstraSpecial },
];

async function main() {
  console.log('=== Seeding Fried Fiesta, Hot & Spicy, Stew, Chilli Craze, Eggstra Special ===\n');

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
  const subcats = [subcatFriedFiesta, subcatHotSpicy, subcatStew, subcatChiliCraze, subcatEggstraSpecial];
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
      console.log('  ✅ Subcategory mapped successfully!');
    } else {
      console.log(`  ✅ Mapping already exists for subcategory ${subcatId}`);
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
  for (const item of newItems) {
    // Find next item code dynamically
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
    const isVeg = item.name.includes('VEGETABLE') || item.name.includes('CASHEW') || item.name.includes('MUSHROOM') || item.name.includes('OMELETTE');
    const isSpicy = item.name.includes('SPICY') || item.name.includes('CHILLI') || item.name.includes('CHILI') || item.name.includes('DEVILLED');
    console.log(`Processing ${itemCode} - ${item.name} (Price: ${item.price})...`);

    // Upload image
    const subcatName = item.subcat === subcatFriedFiesta ? 'fried_fiesta' :
                       item.subcat === subcatHotSpicy ? 'hot_spicy' :
                       item.subcat === subcatStew ? 'stew' :
                       item.subcat === subcatChiliCraze ? 'chili_craze' : 'eggstra_special';

    const storagePath = `${subcatName}/${itemCode}_${Date.now()}.png`;
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
        base_price: item.price,
        image_url: imageUrl,
        is_available: true,
        is_published_on_web: true,
        is_veg: isVeg,
        is_spicy: isSpicy,
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

    // Insert to menu_book_items
    const { error: bookErr } = await supabase
      .from('menu_book_items')
      .insert({
        menu_book_id: TABLE_MENU_BOOK_ID,
        menu_item_id: insertedItem.id,
        override_price: item.price,
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
