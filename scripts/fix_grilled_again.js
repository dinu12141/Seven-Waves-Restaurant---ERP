import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.trim().split('=');
  if(k) acc[k] = v.join('=').replace(/^['"]|['"]$/g, '');
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE_KEY);
const brainDir = 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9';

const companyId = '5c7ff29c-418a-461a-9624-3667375c2af4';

const itemsToAdd = [
  { 
    name: 'CRISPY CHICKEN POTION', 
    price: 2180, 
    sub_category_name: 'GRILLED ITEMS (ONLY CRISPY CHICKEN POTION)',
    image: 'crispy_chicken_potion_1784525659839.png'
  },
  { 
    name: 'GRILLED CHICKEN IN CREAMY MUSHROOM SAUCE SERVED WITH CHIPS & SALAD', 
    price: 2280, 
    sub_category_name: 'GRILLED ITEMS (OTHER ALL ITEMS)',
    image: 'grilled_chicken_mushroom_sauce_1784525672872.png'
  },
  { 
    name: 'GRILLED CHICKEN BREAST IN PEPPER SAUCE SERVED WITH SALAD', 
    price: 2100, 
    sub_category_name: 'GRILLED ITEMS (OTHER ALL ITEMS)',
    image: 'grilled_chicken_pepper_sauce_1784525685204.png'
  },
  { 
    name: 'GRILLED PRAWNS WITH GARLIC BUTTER SAUCE AND MASHED POTATO', 
    price: 2980, 
    sub_category_name: 'GRILLED ITEMS (OTHER ALL ITEMS)',
    image: 'mixed_grill_platter_1784524695518.png'
  },
  { 
    name: 'GRILLED FISH IN CREAMY MUSHROOM SAUCE SERVED WITH CHIPS & SALAD', 
    price: 2280, 
    sub_category_name: 'GRILLED ITEMS (OTHER ALL ITEMS)',
    image: 'grilled_fish_fillet_1784524723365.png'
  },
  { 
    name: 'GRILLED FISH WITH LEMON BUTTER SAUCE', 
    price: 1880, 
    sub_category_name: 'GRILLED ITEMS (OTHER ALL ITEMS)',
    image: 'grilled_fish_fillet_1784524723365.png'
  }
];

async function run() {
  console.log('1. Deleting old grilled items...');
  const idsToDelete = [
    '9f03e8a6-f239-442a-a27a-29040962cf46',
    'd68d4e8f-f08c-47b0-b19a-17b58ee3315c',
    'a283d82c-399a-473c-8138-02cd99ac8b17',
    '5dea1a8b-f2fd-4b8f-ab69-eea3a56224f6'
  ];
  await supabase.from('menu_book_items').delete().in('menu_item_id', idsToDelete);
  await supabase.from('menu_items').delete().in('id', idsToDelete);
  console.log('Deleted.');

  console.log('2. Fetching subcategories and kitchen...');
  const { data: subcats } = await supabase.from('menu_sub_categories')
    .select('id, name, category_id')
    .in('name', ['GRILLED ITEMS (ONLY CRISPY CHICKEN POTION)', 'GRILLED ITEMS (OTHER ALL ITEMS)']);
    
  const { data: kitchen } = await supabase.from('kitchens')
    .select('id').eq('name', 'ITALIAN').limit(1).single();

  console.log('3. Inserting and uploading images for new items...');
  for (const item of itemsToAdd) {
    let imageUrl = null;
    
    // Upload image if it exists
    const filePath = path.join(brainDir, item.image);
    if (fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath);
      const storagePath = `${item.image}`;
      
      const { error: uploadErr } = await supabase.storage
        .from('menu-images')
        .upload(storagePath, fileBuffer, {
          contentType: 'image/png',
          upsert: true
        });
        
      if (!uploadErr) {
        const { data: publicUrlData } = supabase.storage
          .from('menu-images')
          .getPublicUrl(storagePath);
        imageUrl = publicUrlData.publicUrl;
      }
    }

    // Insert to DB
    const sub = subcats.find(s => s.name === item.sub_category_name);
    if (!sub) {
      console.log('Skipping (sub not found):', item.name);
      continue;
    }
    
    const payload = {
      name: item.name,
      company_id: companyId,
      category_id: sub.category_id,
      sub_category_id: sub.id,
      kitchen_id: kitchen?.id,
      base_price: item.price,
      is_available: true,
      is_published_on_web: true,
      preparation_time_mins: 25,
      image_url: imageUrl
    };
    
    const { error: insErr } = await supabase.from('menu_items').insert(payload);
    if (insErr) {
      console.error('Failed to insert', item.name, insErr.message);
    } else {
      console.log('Inserted', item.name);
    }
  }
}
run();
