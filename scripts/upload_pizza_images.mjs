import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const envPath = 'c:\\\\Users\\\\ROG STRIX\\\\Desktop\\\\Restaurant ERP new\\\\.env';
const envContent = readFileSync(envPath, 'utf8');

const url = envContent.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

// The mapping of pizzas to their new images
const pizzaImages = [
  { file: 'C:\\\\Users\\\\ROG STRIX\\\\.gemini\\\\antigravity-ide\\\\brain\\\\2c9f529c-a9ae-4569-adda-46993badad40\\\\pizza_spicy_chicken_served_1784816626588.png', keywords: ['SPICY CHICKEN'] },
  { file: 'C:\\\\Users\\\\ROG STRIX\\\\.gemini\\\\antigravity-ide\\\\brain\\\\2c9f529c-a9ae-4569-adda-46993badad40\\\\pizza_kochchi_chicken_served_1784816647934.png', keywords: ['KOCHCHI CHICKEN'] },
  { file: 'C:\\\\Users\\\\ROG STRIX\\\\.gemini\\\\antigravity-ide\\\\brain\\\\2c9f529c-a9ae-4569-adda-46993badad40\\\\pizza_bbq_served_1784816684908.png', keywords: ['B.B.Q'] },
  { file: 'C:\\\\Users\\\\ROG STRIX\\\\.gemini\\\\antigravity-ide\\\\brain\\\\2c9f529c-a9ae-4569-adda-46993badad40\\\\pizza_tandoori_served_1784816709270.png', keywords: ['TANDOORI'] },
  { file: 'C:\\\\Users\\\\ROG STRIX\\\\.gemini\\\\antigravity-ide\\\\brain\\\\2c9f529c-a9ae-4569-adda-46993badad40\\\\pizza_margherita_served_1784816734778.png', keywords: ['MARGHERITA'] },
];

async function main() {
  // Ensure sharp is available for compression
  try {
    require.resolve('sharp');
  } catch {
    console.log('Installing sharp for image compression...');
    execSync('npm install sharp --no-save', { stdio: 'inherit' });
  }
  
  const sharp = (await import('sharp')).default;

  // Fetch all pizzas
  const { data: pizzas, error: pErr } = await supabase
    .from('menu_items')
    .select('id, name, item_code')
    .ilike('name', '%PIZZA%');
    
  if (pErr) throw pErr;

  for (const mapping of pizzaImages) {
    // Find matching pizzas for this image
    const matchedPizzas = pizzas.filter(p => mapping.keywords.some(kw => p.name.includes(kw)));
    
    if (matchedPizzas.length === 0) {
      console.log(`No pizza found for keyword ${mapping.keywords[0]}`);
      continue;
    }
    
    console.log(`Processing image for ${mapping.keywords[0]}...`);
    const basename = path.basename(mapping.file, '.png');
    const webpFilename = `compressed_${basename}_${Date.now()}.webp`;
    
    // Compress image to webp
    const compressedBuffer = await sharp(mapping.file)
      .resize(800) // resize to a sensible width for menus to save space
      .webp({ quality: 80 })
      .toBuffer();
      
    console.log(`Compressed! Uploading ${webpFilename}...`);
    
    const { error: uploadErr } = await supabase.storage
      .from('menu-images')
      .upload(`pizzas/${webpFilename}`, compressedBuffer, { contentType: 'image/webp' });
      
    if (uploadErr) {
      console.error(`Upload failed for ${webpFilename}:`, uploadErr);
      continue;
    }
    
    const { data: publicUrlData } = supabase.storage
      .from('menu-images')
      .getPublicUrl(`pizzas/${webpFilename}`);
      
    const publicUrl = publicUrlData.publicUrl;
    console.log(`Uploaded! URL: ${publicUrl}`);
    
    // Update all matched pizzas (including 'L' sizes)
    for (const pizza of matchedPizzas) {
      console.log(`Updating DB for ${pizza.name} (${pizza.item_code})`);
      await supabase
        .from('menu_items')
        .update({ image_url: publicUrl })
        .eq('id', pizza.id);
    }
  }
  console.log('All pizzas updated with luxurious compressed images!');
}

main().catch(console.error);
