import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://clykwuzajtwvwuavmtzs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseWt3dXphanR3dnd1YXZtdHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTYwODEsImV4cCI6MjA4Njg3MjA4MX0.wROPuoQAQ2GD3PAZAM7cnAef6fhDctRe9izwFC-9JGA';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const IMAGE_DIR = 'C:\\Users\\ROG STRIX\\.gemini\\antigravity\\brain\\b6de9f45-4583-4087-86d5-6ecb23533526';

// IDs from DB
const COMPANY_ID = '5c7ff29c-418a-461a-9624-3667375c2af4';
const KITCHEN_ID = '361e910a-70f0-4578-9ea9-ba29595add39'; // Juice Bar kitchen
const MILKSHAKES_SUB_CATEGORY_ID = '7cdbdb84-be10-4457-b43a-d74ee5d101ed';
const MENU_BOOK_ID = 'ff890d06-0ad6-4b32-829f-4d386fe1a412';

const milkshakes = [
  { name: 'MILKSHAKE PEANUT BUTTER & BANANA', price: 1080, imageFile: 'milkshake_peanut_butter_banana_1774771241733.png', storageKey: 'milkshake_peanut_butter_banana.png' },
  { name: 'MILKSHAKE STRAWBERRY & BANANA', price: 1080, imageFile: 'milkshake_strawberry_banana_1774771259173.png', storageKey: 'milkshake_strawberry_banana.png' },
  { name: 'MILKSHAKE AVOCADO', price: 990, imageFile: 'milkshake_avocado_1774771279938.png', storageKey: 'milkshake_avocado.png' },
  { name: 'MILKSHAKE BANANA', price: 990, imageFile: 'milkshake_banana_1774771300156.png', storageKey: 'milkshake_banana.png' },
  { name: 'MILKSHAKE CHOCOLATE', price: 990, imageFile: 'milkshake_chocolate_1774771316075.png', storageKey: 'milkshake_chocolate.png' },
  { name: 'MILKSHAKE MANGO', price: 990, imageFile: 'milkshake_mango_1774771339144.png', storageKey: 'milkshake_mango.png' },
  { name: 'MILKSHAKE STRAWBERRY', price: 990, imageFile: 'milkshake_strawberry_1774771369198.png', storageKey: 'milkshake_strawberry.png' },
  { name: 'MILKSHAKE VANILLA', price: 990, imageFile: 'milkshake_vanilla_1774771387942.png', storageKey: 'milkshake_vanilla.png' },
  { name: 'MILO SHAKE', price: 990, imageFile: 'milkshake_milo_1774771407700.png', storageKey: 'milkshake_milo.png' },
  { name: 'PEANUT BUTTER CHOCOLATE SHAKE', price: 1080, imageFile: 'milkshake_peanut_butter_chocolate_1774771430170.png', storageKey: 'milkshake_peanut_butter_chocolate.png' },
];

async function main() {
  console.log('=== Uploading Milkshake Images & Inserting Menu Items ===\n');

  for (const [index, item] of milkshakes.entries()) {
    const filePath = path.join(IMAGE_DIR, item.imageFile);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Image not found: ${item.imageFile}`);
      continue;
    }

    const fileBuffer = fs.readFileSync(filePath);

    // Upload image to Supabase Storage
    console.log(`[${index + 1}/10] Uploading image for: ${item.name}`);
    const { error: uploadError } = await supabase.storage
      .from('menu-images')
      .upload(item.storageKey, fileBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error(`  ❌ Upload failed: ${uploadError.message}`);
      continue;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('menu-images')
      .getPublicUrl(item.storageKey);

    const imageUrl = urlData.publicUrl;
    console.log(`  ✅ Image uploaded: ${imageUrl}`);

    // Insert into menu_items
    const { data: menuItem, error: insertError } = await supabase
      .from('menu_items')
      .insert({
        company_id: COMPANY_ID,
        sub_category_id: MILKSHAKES_SUB_CATEGORY_ID,
        kitchen_id: KITCHEN_ID,
        name: item.name,
        base_price: item.price,
        image_url: imageUrl,
        is_available: true,
        is_published_on_web: true,
        is_veg: true,
        is_spicy: false,
        is_best_seller: false,
        preparation_time_mins: 5,
        sort_order: index + 1,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error(`  ❌ Insert menu_item failed: ${insertError.message}`);
      continue;
    }

    console.log(`  ✅ menu_item inserted: ${menuItem.id}`);

    // Add to menu book
    const { error: bookError } = await supabase
      .from('menu_book_items')
      .insert({
        menu_book_id: MENU_BOOK_ID,
        menu_item_id: menuItem.id,
        is_available: true,
        sort_order: index + 1,
      });

    if (bookError) {
      console.error(`  ❌ menu_book_items insert failed: ${bookError.message}`);
    } else {
      console.log(`  ✅ Added to menu book`);
    }

    console.log('');
  }

  console.log('=== Done! ===');
}

main().catch(console.error);
