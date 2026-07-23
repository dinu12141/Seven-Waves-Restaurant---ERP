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

const SRI_LANKAN_CATEGORY_ID = 'fc6f8d87-9175-41de-978a-191547c70414';
const BENMAR_KITCHEN_ID = 'd54617dc-5b1e-456b-934d-65e21ab1b8ff';
const TABLE_MENU_BOOK_ID = 'ff890d06-0ad6-4b32-829f-4d386fe1a412';
const LOCAL_IMAGE_PATH = 'c:\\Users\\ROG STRIX\\Desktop\\Restaurant ERP new\\src\\assets\\login-food-bg.png';

// Define the menu sections and items
const subcategoriesToEnsure = [
  'DOLPHIN KOTHTHU',
  'KOTTU NOODLES',
  'KOTHTHU STRING HOPPERS',
  'KOTHTHU',
  'SET MENU',
  'CHEESY CHEESE',
  'STRING HOPPERS'
];

const menuData = [
  // 1. DOLPHIN KOTHTHU
  {
    subcatName: 'DOLPHIN KOTHTHU',
    items: [
      { name: 'DOLPHIN KOTHTHU CHICKEN', price: 2480, is_veg: false },
      { name: 'DOLPHIN KOTHTHU EGG', price: 2180, is_veg: false },
      { name: 'DOLPHIN KOTHTHU MIX', price: 2780, is_veg: false },
      { name: 'DOLPHIN KOTHTHU SEAFOOD', price: 2780, is_veg: false },
      { name: 'DOLPHIN KOTHTHU VEGETABLE', price: 1980, is_veg: true }
    ]
  },
  // 2. KOTTU NOODLES
  {
    subcatName: 'KOTTU NOODLES',
    items: [
      { name: 'KOTTU NOODLES ROAST CHICKEN', variants: [{ name: 'M', price: 1840 }, { name: 'L', price: 2040 }], is_veg: false },
      { name: 'KOTTU NOODLES CHICKEN', variants: [{ name: 'M', price: 1740 }, { name: 'L', price: 1940 }], is_veg: false },
      { name: 'KOTTU NOODLES EGG', variants: [{ name: 'M', price: 1440 }, { name: 'L', price: 1640 }], is_veg: false },
      { name: 'KOTTU NOODLES FISH', variants: [{ name: 'M', price: 1640 }, { name: 'L', price: 1840 }], is_veg: false },
      { name: 'KOTTU NOODLES VEGETABLE', variants: [{ name: 'M', price: 1340 }, { name: 'L', price: 1540 }], is_veg: true }
    ]
  },
  // 3. KOTHTHU STRING HOPPERS
  {
    subcatName: 'KOTHTHU STRING HOPPERS',
    items: [
      { name: 'KOTHTHU STRING HOPPERS CHICKEN', variants: [{ name: 'M', price: 1540 }, { name: 'L', price: 1840 }], is_veg: false },
      { name: 'KOTHTHU STRING HOPPERS EGG', variants: [{ name: 'M', price: 1440 }, { name: 'L', price: 1640 }], is_veg: false },
      { name: 'KOTHTHU STRING HOPPERS FISH', variants: [{ name: 'M', price: 1640 }, { name: 'L', price: 1940 }], is_veg: false },
      { name: 'KOTHTHU STRING HOPPERS MIXED/SEAFOOD', variants: [{ name: 'M', price: 1940 }, { name: 'L', price: 2140 }], is_veg: false },
      { name: 'KOTHTHU STRING HOPPERS ROAST CHICKEN', variants: [{ name: 'M', price: 1840 }, { name: 'L', price: 2040 }], is_veg: false },
      { name: 'KOTHTHU STRING HOPPERS VEGETABLE', variants: [{ name: 'M', price: 1340 }, { name: 'L', price: 1540 }], is_veg: true }
    ]
  },
  // 4. KOTHTHU
  {
    subcatName: 'KOTHTHU',
    items: [
      { name: 'KOTHTHU CHICKEN', variants: [{ name: 'M', price: 1540 }, { name: 'L', price: 1740 }], is_veg: false },
      { name: 'KOTHTHU EGG', variants: [{ name: 'M', price: 1240 }, { name: 'L', price: 1440 }], is_veg: false },
      { name: 'KOTHTHU FISH', variants: [{ name: 'M', price: 1640 }, { name: 'L', price: 1840 }], is_veg: false },
      { name: 'KOTHTHU ROAST CHICKEN', variants: [{ name: 'M', price: 1840 }, { name: 'L', price: 2040 }], is_veg: false },
      { name: 'KOTHTHU MIXED/SEAFOOD', variants: [{ name: 'M', price: 1940 }, { name: 'L', price: 2140 }], is_veg: false },
      { name: 'KOTHTHU VEGETABLE', variants: [{ name: 'M', price: 1240 }, { name: 'L', price: 1440 }], is_veg: true }
    ]
  },
  // 5. SET MENU
  {
    subcatName: 'SET MENU',
    items: [
      { name: 'SET MENU KOTHTHU CHICKEN', price: 1580, is_veg: false },
      { name: 'SET MENU KOTHTHU STRING HOPPERS', price: 1580, is_veg: false }
    ]
  },
  // 6. CHEESY CHEESE
  {
    subcatName: 'CHEESY CHEESE',
    items: [
      { name: 'CHEESE KOTHTHU VEGETABLE', variants: [{ name: 'M', price: 1540 }, { name: 'L', price: 1740 }], is_veg: true },
      { name: 'CHEESE KOTHTHU CHICKEN', variants: [{ name: 'M', price: 1940 }, { name: 'L', price: 2140 }], is_veg: false },
      { name: 'CHEESE KOTHTHU ROAST CHICKEN', variants: [{ name: 'M', price: 2140 }, { name: 'L', price: 2340 }], is_veg: false },
      { name: 'CHEESE KOTHTHU EGG', variants: [{ name: 'M', price: 1740 }, { name: 'L', price: 1940 }], is_veg: false },
      { name: 'CHEESE KOTHTHU FISH', variants: [{ name: 'M', price: 2040 }, { name: 'L', price: 2240 }], is_veg: false },
      { name: 'CHEESE KOTHTHU MIXED/SEAFOOD', variants: [{ name: 'M', price: 2240 }, { name: 'L', price: 2440 }], is_veg: false }
    ]
  },
  // 7. STRING HOPPERS
  {
    subcatName: 'STRING HOPPERS',
    items: [
      { name: 'CHEESE & CHICKEN STRING HOPPERS', variants: [{ name: 'M', price: 2040 }, { name: 'L', price: 2340 }], is_veg: false },
      { name: 'CHEESE & ROAST CHICKEN STRING HOPPERS', variants: [{ name: 'M', price: 2140 }, { name: 'L', price: 2340 }], is_veg: false }
    ]
  }
];

async function main() {
  console.log('=== Adding Koththu & Benmar Display Menu Items ===\n');

  // 1. Get Branch ID and Company ID
  const { data: branches, error: branchErr } = await supabase.from('branches').select('id, company_id').limit(1);
  if (branchErr || !branches || branches.length === 0) {
    console.error('❌ Failed to retrieve branch/company info:', branchErr?.message || 'No branches found');
    process.exit(1);
  }
  const branchId = branches[0].id;
  const companyId = branches[0].company_id;
  console.log(`Branch ID: ${branchId}`);
  console.log(`Company ID: ${companyId}\n`);

  // 2. Fetch existing subcategories
  const { data: existingSubcats, error: subcatErr } = await supabase
    .from('menu_sub_categories')
    .select('id, name');
  
  if (subcatErr) {
    console.error('❌ Failed to fetch subcategories:', subcatErr.message);
    process.exit(1);
  }

  const subcatMap = new Map();
  existingSubcats.forEach(s => subcatMap.set(s.name.toUpperCase(), s.id));

  // Create missing subcategories
  for (const name of subcategoriesToEnsure) {
    if (!subcatMap.has(name.toUpperCase())) {
      console.log(`Creating subcategory "${name}"...`);
      const { data: newSubcat, error: createErr } = await supabase
        .from('menu_sub_categories')
        .insert({
          company_id: companyId,
          category_id: SRI_LANKAN_CATEGORY_ID,
          name: name,
          is_active: true
        })
        .select('id, name')
        .single();

      if (createErr) {
        console.error(`❌ Failed to create subcategory ${name}:`, createErr.message);
        process.exit(1);
      }
      subcatMap.set(newSubcat.name.toUpperCase(), newSubcat.id);
      console.log(`  ✅ Subcategory "${name}" created (ID: ${newSubcat.id})`);
    } else {
      console.log(`  ✅ Subcategory "${name}" already exists (ID: ${subcatMap.get(name.toUpperCase())})`);
    }
  }
  console.log('');

  // 3. Map subcategories to BENMAR kitchen in kitchen_subcategory_map
  for (const name of subcategoriesToEnsure) {
    const subcatId = subcatMap.get(name.toUpperCase());
    const { data: existingMap } = await supabase
      .from('kitchen_subcategory_map')
      .select('id')
      .eq('subcategory_id', subcatId)
      .eq('kitchen_id', BENMAR_KITCHEN_ID)
      .maybeSingle();

    if (!existingMap) {
      console.log(`Mapping subcategory "${name}" to BENMAR kitchen...`);
      const { error: mapErr } = await supabase
        .from('kitchen_subcategory_map')
        .insert({
          branch_id: branchId,
          category_id: SRI_LANKAN_CATEGORY_ID,
          subcategory_id: subcatId,
          kitchen_id: BENMAR_KITCHEN_ID,
          is_active: true
        });

      if (mapErr) {
        console.error(`❌ Failed to map "${name}":`, mapErr.message);
      } else {
        console.log(`  ✅ Mapped "${name}" to BENMAR kitchen successfully!`);
      }
    } else {
      console.log(`  ✅ Kitchen mapping already exists for "${name}"`);
    }
  }
  console.log('');

  // 4. Retrieve max sort order in menu_book_items
  const { data: maxBookItem } = await supabase
    .from('menu_book_items')
    .select('sort_order')
    .eq('menu_book_id', TABLE_MENU_BOOK_ID)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  let sortOrder = (maxBookItem?.sort_order || 0) + 1;
  console.log(`Starting sort order: ${sortOrder}\n`);

  // 5. Read local placeholder image
  if (!existsSync(LOCAL_IMAGE_PATH)) {
    console.error('❌ Local placeholder image not found:', LOCAL_IMAGE_PATH);
    process.exit(1);
  }
  const fileBuffer = readFileSync(LOCAL_IMAGE_PATH);

  // 6. Insert Menu Items
  for (const section of menuData) {
    const subcatId = subcatMap.get(section.subcatName.toUpperCase());
    console.log(`\n=== Section: ${section.subcatName} ===`);

    for (const item of section.items) {
      // Find latest item_code
      const { data: latestItems } = await supabase
        .from('menu_items')
        .select('item_code')
        .order('item_code', { ascending: false })
        .limit(1);

      let nextCodeNum = 210;
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
      const storagePath = `koththu/${itemCode}_${Date.now()}.png`;
      const { error: uploadErr } = await supabase.storage
        .from('menu-images')
        .upload(storagePath, fileBuffer, {
          contentType: 'image/png',
          upsert: true
        });

      let imageUrl = null;
      if (uploadErr) {
        console.warn(`  ⚠️ Could not upload image: ${uploadErr.message}`);
      } else {
        const { data: publicUrlData } = supabase.storage.from('menu-images').getPublicUrl(storagePath);
        imageUrl = publicUrlData.publicUrl;
      }

      // Insert to menu_items
      const { data: insertedItem, error: insertErr } = await supabase
        .from('menu_items')
        .insert({
          company_id: companyId,
          category_id: SRI_LANKAN_CATEGORY_ID,
          sub_category_id: subcatId,
          kitchen_id: BENMAR_KITCHEN_ID,
          item_code: itemCode,
          name: item.name,
          base_price: basePrice,
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
        console.error(`  ❌ Failed to insert menu item ${item.name}:`, insertErr.message);
        continue;
      }
      console.log(`  ✅ Menu item created (ID: ${insertedItem.id})`);

      // Insert variations if present
      if (item.variants) {
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
            console.error(`    ❌ Failed to insert variant ${variant.name}:`, varErr.message);
          } else {
            console.log(`    ✅ Variant ${variant.name} (${variant.price}) added`);
          }
        }
      }

      // Insert into menu_book_items
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
        console.error(`  ❌ Failed to add to menu book:`, bookErr.message);
      } else {
        console.log(`  ✅ Added to TABLE MENU BOOK`);
      }
    }
  }

  console.log('\n🎉 All Koththu items added and mapped to BENMAR kitchen successfully!');
}

main().catch(console.error);
