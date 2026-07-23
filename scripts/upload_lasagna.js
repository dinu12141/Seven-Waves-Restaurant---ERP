import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.trim().split('=');
  if(k) acc[k] = v.join('=').replace(/^['"]|['"]$/g, '');
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const brainDir = 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9';

const items = [
  { name: 'LASAGNA CHICKEN', image: 'lasagna_chicken_1784531469339.png' },
  { name: 'LASAGNA VEGETABLE', image: 'lasagna_vegetable_1784531482866.png' }
];

async function run() {
  for (const item of items) {
    let imageUrl = null;
    const filePath = path.join(brainDir, item.image);
    if (fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath);
      const storagePath = `lasagnas/${item.image}`;
      
      const { error: uploadErr } = await supabase.storage
        .from('menu-images')
        .upload(storagePath, fileBuffer, {
          contentType: 'image/png',
          upsert: true
        });
        
      if (uploadErr) {
        console.error('Failed to upload', item.name, uploadErr);
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from('menu-images')
        .getPublicUrl(storagePath);
      imageUrl = publicUrlData.publicUrl;
      console.log('Uploaded image for', item.name, imageUrl);
      
      // Update DB
      const { error: updateErr } = await supabase.from('menu_items')
        .update({ image_url: imageUrl })
        .eq('name', item.name)
        .eq('company_id', '5c7ff29c-418a-461a-9624-3667375c2af4');
        
      if (updateErr) {
        console.error('Failed to update DB for', item.name, updateErr);
      } else {
        console.log('Successfully updated DB for', item.name);
      }
    } else {
       console.log('Image not found for', item.name);
    }
  }
}
run();
