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

const subcatThaiRice = '3f3bcdeb-e432-4237-ae11-0d4253c609d0';
const subcatMongolianRice = '0612f181-8c30-4212-ae12-ce6126bbfc69';
const subcatNasiGoreng = 'f14a217f-8047-46e5-978c-2cebc47cf789';

const riceItems = [
  // 1. Thai Rice
  { name: 'THAI RICE CHICKEN', subcat: subcatThaiRice, variants: [{ name: 'M', price: 1880 }, { name: 'L', price: 2080 }] },
  { name: 'THAI RICE SEAFOOD', subcat: subcatThaiRice, variants: [{ name: 'M', price: 2080 }, { name: 'L', price: 2280 }] },
  
  // 2. Mongolian Rice
  { name: 'MONGOLIAN MIXED RICE', subcat: subcatMongolianRice, variants: [{ name: 'M', price: 2380 }, { name: 'L', price: 2680 }] },
  { name: 'MONGOLIAN CHICKEN RICE', subcat: subcatMongolianRice, variants: [{ name: 'M', price: 1890 }, { name: 'L', price: 2090 }] },
  { name: 'MONGOLIAN SEAFOOD RICE', subcat: subcatMongolianRice, variants: [{ name: 'M', price: 2380 }, { name: 'L', price: 2680 }] },
  
  // 3. Nasi Goreng
  { name: 'NASI GORENG MIXED', subcat: subcatNasiGoreng, price: 2140 },
  { name: 'NASI GORENG CHICKEN', subcat: subcatNasiGoreng, price: 1940 },
  { name: 'NASI GORENG SEAFOOD', subcat: subcatNasiGoreng, price: 2140 },
];

async function main() {
  console.log('=== Seeding Rice Menu Items & Variations ===\n');

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
  const subcats = [subcatThaiRice, subcatMongolianRice, subcatNasiGoreng];
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
  for (const item of riceItems) {
    // Find next item code dynamically at each step to avoid conflicts
    const { data: latestItems } = await supabase
      .from('menu_items')
      .select('item_code')
      .order('item_code', { ascending: false })
      .limit(1);

    let nextCodeNum = 195;
    if (latestItems && latestItems.length > 0) {
      const code = latestItems[0].item_code;
      const match = code.match(/MI-0*(\d+)/);
      if (match) {
        nextCodeNum = parseInt(match[1]) + 1;
      }
    }

    const itemCode = `MI-0${nextCodeNum}`;
    const basePrice = item.variants ? item.variants[0].price : item.price;
    console.log(`Processing ${itemCode} - ${item.name} (Base Price: ${basePrice})...`);

    // Upload image
    const storagePath = `rice/${itemCode}_${Date.now()}.png`;
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
        is_veg: false,
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
