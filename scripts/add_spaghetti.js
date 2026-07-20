import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.trim().split('=');
  if(k) acc[k] = v.join('=').replace(/^['"]|['"]$/g, '');
  return acc;
}, {});

const s = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE_KEY);
const brainDir = 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9';

async function run() {
  const companyId = '5c7ff29c-418a-461a-9624-3667375c2af4';

  const { data: cat } = await s.from('categories').select('id, name').ilike('name', 'Italian').eq('company_id', companyId).maybeSingle();
  let categoryId = cat?.id;

  const { data: sub } = await s.from('menu_sub_categories').select('id, name').ilike('name', 'Spaghetti').eq('category_id', categoryId).maybeSingle();
  let subCategoryId = sub?.id;

  if (!subCategoryId) {
    console.log('Spaghetti subcategory not found, creating...');
    const { data: newSub, error: subErr } = await s.from('menu_sub_categories').insert({ name: 'SPAGHETTI', category_id: categoryId, company_id: companyId }).select().single();
    if (subErr) console.error('Subcategory insert error:', subErr);
    subCategoryId = newSub?.id;
  }

  const { data: kitchen } = await s.from('kitchens').select('id, name').ilike('name', 'BENMAR').maybeSingle();
  let kitchenId = kitchen?.id;
  
  const itemsToAdd = [
    { name: 'CREAMY SPAGHETTI CABONARA', price: 2180, image: 'spaghetti_carbonara_1784532420529.png' },
    { name: 'SPAGHETTI CHEESE & CHICKEN', price: 2180 },
    { name: 'SPAGHETTI BOLOGNESE', price: 2180 },
    { name: 'SPAGHETTI CHICKEN', price: 1780 },
    { name: 'SPAGHETTI SEAFOOD (Prawns, Cuttle fish, Fish)', price: 2380 },
    { name: 'SPAGHETTI VEGETABLE CHEESE', price: 1680 },
    { name: 'SPAGHETTI VEGETABLE', price: 1380 }
  ];

  for (const item of itemsToAdd) {
    // 1. Insert into DB first
    const payload = {
      name: item.name,
      company_id: companyId,
      category_id: categoryId,
      sub_category_id: subCategoryId,
      kitchen_id: kitchenId,
      base_price: item.price,
      is_available: true,
      is_published_on_web: true,
      preparation_time_mins: 25,
      is_veg: item.name.includes('VEGETABLE')
    };
    
    const { data: existing } = await s.from('menu_items').select('id').eq('name', item.name).maybeSingle();
    
    let itemId = existing?.id;
    if (!itemId) {
      const { data: inserted, error: insErr } = await s.from('menu_items').insert(payload).select().single();
      if (insErr) {
        console.error('Failed to insert', item.name, insErr.message);
        continue;
      }
      itemId = inserted.id;
      console.log('Inserted', item.name);
    } else {
      console.log('Item exists', item.name);
      await s.from('menu_items').update(payload).eq('id', itemId);
    }
    
    // 2. Compress and upload image
    if (item.image) {
      const filePath = path.join(brainDir, item.image);
      if (fs.existsSync(filePath)) {
        const fileBuffer = fs.readFileSync(filePath);
        
        const compressedBuffer = await sharp(fileBuffer)
          .resize(800, null, { withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
          
        const newImageName = item.image.replace('.png', '.webp');
        const storagePath = `spaghetti/${newImageName}`;
        
        const { error: uploadErr } = await s.storage
          .from('menu-images')
          .upload(storagePath, compressedBuffer, {
            contentType: 'image/webp',
            upsert: true
          });
          
        if (!uploadErr) {
          const { data: publicUrlData } = s.storage
            .from('menu-images')
            .getPublicUrl(storagePath);
          
          await s.from('menu_items').update({ image_url: publicUrlData.publicUrl }).eq('id', itemId);
          console.log('Uploaded and attached image for', item.name);
        } else {
          console.error('Upload error', uploadErr);
        }
      }
    }
  }
}
run();
