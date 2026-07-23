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

const WESTERN_CATEGORY_ID = '9a80ecc8-3aca-43f2-be8d-b6a730298407';
const ITALIAN_KITCHEN_ID = '43cbc447-9897-46f3-8c82-670972091bb3';
const TABLE_MENU_BOOK_ID = 'ff890d06-0ad6-4b32-829f-4d386fe1a412';
const LOCAL_IMAGE_PATH = 'c:\\Users\\ROG STRIX\\Desktop\\Restaurant ERP new\\src\\assets\\login-food-bg.png';

const subcatsToCreate = ['SUBMARINES'];

const menuData = [
  { sub: 'SUBMARINES', name: 'SUBMARINE CHICKEN WITH CHIPS', price: 1480, is_veg: false },
  { sub: 'SUBMARINES', name: 'SUBMARINE CRISPY CHICKEN WITH CHIPS', price: 1580, is_veg: false },
  { sub: 'SUBMARINES', name: 'SUBMARINE FISH WITH CHIPS', price: 1480, is_veg: false },
  { sub: 'SUBMARINES', name: 'SUBMARINE VEGETABLE WITH CHIPS', price: 1180, is_veg: true }
];

async function main() {
  console.log('=== Seeding Submarines ===\n');

  // 1. Get Branch & Company
  const { data: branches, error: branchErr } = await supabase.from('branches').select('id, company_id').limit(1);
  if (branchErr || !branches || branches.length === 0) {
    console.error('❌ Failed to retrieve branch/company info');
    process.exit(1);
  }
  const branchId = branches[0].id;
  const companyId = branches[0].company_id;

  // 2. Resolve Subcategories
  const subcatIdMap = {};
  for (const subName of subcatsToCreate) {
    let { data: existing } = await supabase
      .from('menu_sub_categories')
      .select('id')
      .eq('category_id', WESTERN_CATEGORY_ID)
      .eq('name', subName)
      .maybeSingle();

    if (!existing) {
      console.log(`Creating subcategory: ${subName}`);
      const { data: newSub } = await supabase
        .from('menu_sub_categories')
        .insert({
          company_id: companyId,
          category_id: WESTERN_CATEGORY_ID,
          name: subName,
          is_active: true,
          sort_order: 10
        })
        .select('id')
        .single();
      existing = newSub;
    }
    subcatIdMap[subName] = existing.id;

    // Map to kitchen
    const { data: mapping } = await supabase
      .from('kitchen_subcategory_map')
      .select('id')
      .eq('subcategory_id', existing.id)
      .eq('kitchen_id', ITALIAN_KITCHEN_ID)
      .maybeSingle();

    if (!mapping) {
      await supabase.from('kitchen_subcategory_map').insert({
        branch_id: branchId,
        category_id: WESTERN_CATEGORY_ID,
        subcategory_id: existing.id,
        kitchen_id: ITALIAN_KITCHEN_ID,
        is_active: true
      });
      console.log(`Mapped ${subName} to ITALIAN Kitchen`);
    } else {
      console.log(`${subName} already mapped to ITALIAN Kitchen`);
    }
  }

  // 3. Get Sort Order and Item Code
  let nextCodeNum = 390; // safe baseline
  const { data: latestItems } = await supabase
    .from('menu_items')
    .select('item_code')
    .order('item_code', { ascending: false })
    .limit(1);
  if (latestItems && latestItems.length > 0) {
    const match = latestItems[0].item_code.match(/MI-0*(\d+)/);
    if (match) nextCodeNum = parseInt(match[1]) + 1;
  }

  const { data: maxBookItem } = await supabase
    .from('menu_book_items')
    .select('sort_order')
    .eq('menu_book_id', TABLE_MENU_BOOK_ID)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  let sortOrder = (maxBookItem?.sort_order || 0) + 1;

  const fileBuffer = readFileSync(LOCAL_IMAGE_PATH);

  // 4. Insert Items
  for (const item of menuData) {
    const itemCode = `MI-0${nextCodeNum++}`;
    console.log(`Processing ${itemCode} - ${item.name}...`);

    let imageUrl = null;
    const storagePath = `western/submarines/${itemCode}_${Date.now()}.png`;
    const { error: uploadErr } = await supabase.storage
      .from('menu-images')
      .upload(storagePath, fileBuffer, { contentType: 'image/png', upsert: true });

    if (!uploadErr) {
      const { data: publicUrlData } = supabase.storage.from('menu-images').getPublicUrl(storagePath);
      imageUrl = publicUrlData.publicUrl;
    }

    const { data: insertedItem, error: insertErr } = await supabase
      .from('menu_items')
      .insert({
        company_id: companyId,
        category_id: WESTERN_CATEGORY_ID,
        sub_category_id: subcatIdMap[item.sub],
        kitchen_id: ITALIAN_KITCHEN_ID,
        item_code: itemCode,
        name: item.name,
        base_price: item.price,
        image_url: imageUrl,
        is_available: true,
        is_published_on_web: true,
        is_veg: item.is_veg,
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

    // Add to Menu Book (with retries)
    let bookErr = null;
    for(let r=0; r<3; r++) {
      const { error } = await supabase.from('menu_book_items').insert({
        menu_book_id: TABLE_MENU_BOOK_ID,
        menu_item_id: insertedItem.id,
        override_price: item.price,
        is_available: true,
        sort_order: sortOrder++
      });
      bookErr = error;
      if(!error) break;
      await new Promise(res => setTimeout(res, 1000));
    }

    if (bookErr) console.error(`  ❌ Failed to add to menu book: ${bookErr.message}`);
    else console.log(`  ✅ Added to TABLE MENU BOOK`);
  }

  console.log('=== All Done! ===');
}

main().catch(console.error);
