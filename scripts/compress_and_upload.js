import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.trim().split('=');
  if(k) acc[k] = v.join('=').replace(/^['"]|['"]$/g, '');
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const brainDir = 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9';

const items = [
  { name: 'LASAGNA CHICKEN', image: 'lasagna_chicken_1784531469339.png', folder: 'lasagnas' },
  { name: 'LASAGNA VEGETABLE', image: 'lasagna_vegetable_1784531482866.png', folder: 'lasagnas' },
  { name: 'CRISPY CHICKEN POTION', image: 'crispy_chicken_potion_1784525659839.png', folder: '' },
  { name: 'GRILLED CHICKEN IN CREAMY MUSHROOM SAUCE SERVED WITH CHIPS & SALAD', image: 'grilled_chicken_mushroom_sauce_1784525672872.png', folder: '' },
  { name: 'GRILLED CHICKEN BREAST IN PEPPER SAUCE SERVED WITH SALAD', image: 'grilled_chicken_pepper_sauce_1784525685204.png', folder: '' },
  { name: 'GRILLED PRAWNS WITH GARLIC BUTTER SAUCE AND MASHED POTATO', image: 'mixed_grill_platter_1784524695518.png', folder: '' }
];

async function run() {
  for (const item of items) {
    const filePath = path.join(brainDir, item.image);
    if (fs.existsSync(filePath)) {
      console.log(`Compressing ${item.name}...`);
      
      const fileBuffer = fs.readFileSync(filePath);
      
      // Compress using sharp to WebP
      const compressedBuffer = await sharp(fileBuffer)
        .resize(800, null, { withoutEnlargement: true }) // resize to max 800px width
        .webp({ quality: 80 }) // 80% quality webp
        .toBuffer();
        
      const newImageName = item.image.replace('.png', '.webp');
      const storagePath = item.folder ? `${item.folder}/${newImageName}` : newImageName;
      
      const { error: uploadErr } = await supabase.storage
        .from('menu-images')
        .upload(storagePath, compressedBuffer, {
          contentType: 'image/webp',
          upsert: true
        });
        
      if (uploadErr) {
        console.error('Failed to upload', item.name, uploadErr);
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from('menu-images')
        .getPublicUrl(storagePath);
      const imageUrl = publicUrlData.publicUrl;
      console.log('Uploaded compressed image for', item.name, imageUrl);
      
      // Update DB
      const { error: updateErr } = await supabase.from('menu_items')
        .update({ image_url: imageUrl })
        .eq('name', item.name)
        .eq('company_id', '5c7ff29c-418a-461a-9624-3667375c2af4');
        
      if (updateErr) {
        console.error('Failed to update DB for', item.name, updateErr);
      } else {
        console.log('Successfully updated DB with compressed image for', item.name);
      }
    } else {
       console.log('Image not found for', item.name);
    }
  }
}
run();
