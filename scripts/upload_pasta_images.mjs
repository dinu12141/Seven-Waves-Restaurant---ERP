import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
// removed path import

const envPath = 'c:\\\\Users\\\\ROG STRIX\\\\Desktop\\\\Restaurant ERP new\\\\.env';
const envContent = readFileSync(envPath, 'utf8');

const url = envContent.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

const images = [
  { code: 'PAS-BEEF', path: 'C:\\\\Users\\\\ROG STRIX\\\\.gemini\\\\antigravity-ide\\\\brain\\\\2c9f529c-a9ae-4569-adda-46993badad40\\\\beef_pasta_1784749371508.png' },
  { code: 'PAS-CHK', path: 'C:\\\\Users\\\\ROG STRIX\\\\.gemini\\\\antigravity-ide\\\\brain\\\\2c9f529c-a9ae-4569-adda-46993badad40\\\\chicken_pasta_1784749394414.png' },
  { code: 'PAS-SEA', path: 'C:\\\\Users\\\\ROG STRIX\\\\.gemini\\\\antigravity-ide\\\\brain\\\\2c9f529c-a9ae-4569-adda-46993badad40\\\\seafood_pasta_1784749409992.png' },
  { code: 'PAS-VEG', path: 'C:\\\\Users\\\\ROG STRIX\\\\.gemini\\\\antigravity-ide\\\\brain\\\\2c9f529c-a9ae-4569-adda-46993badad40\\\\veg_pasta_1784749420466.png' }
];

async function main() {
  for (const item of images) {
    try {
      const fileData = readFileSync(item.path);
      const filename = `${item.code.toLowerCase()}-${Date.now()}.png`;
      
      console.log(`Uploading ${filename}...`);
      const { error: uploadErr } = await supabase.storage
        .from('menu-images')
        .upload(filename, fileData, { contentType: 'image/png' });
        
      if (uploadErr) {
        console.error(`Error uploading ${item.code}:`, uploadErr);
        continue;
      }
      
      const { data: publicUrlData } = supabase.storage
        .from('menu-images')
        .getPublicUrl(filename);
        
      const publicUrl = publicUrlData.publicUrl;
      
      console.log(`Updating DB for ${item.code} with url: ${publicUrl}`);
      const { error: dbErr } = await supabase
        .from('menu_items')
        .update({ image_url: publicUrl })
        .eq('item_code', item.code);
        
      if (dbErr) {
        console.error(`Error updating DB for ${item.code}:`, dbErr);
      } else {
        console.log(`Success for ${item.code}`);
      }
    } catch (e) {
      console.error(`Failed to process ${item.code}:`, e);
    }
  }
}

main();
