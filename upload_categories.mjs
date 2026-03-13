import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://clykwuzajtwvwuavmtzs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseWt3dXphanR3dnd1YXZtdHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTYwODEsImV4cCI6MjA4Njg3MjA4MX0.wROPuoQAQ2GD3PAZAM7cnAef6fhDctRe9izwFC-9JGA';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const imageDir = 'C:\\Users\\ROG STRIX\\.gemini\\antigravity\\brain\\ef6627e3-bb51-4a06-a7c4-f4b6c7985c28';

const mapping = {
  'cat_hot_and_spicy': 'HOT AND SPICY',
  'cat_breakfast': 'BREAKFAST',
  'cat_rice': 'RICE',
  'cat_pasta': 'PASTA',
  'cat_mojito': 'MOJITO',
  'cat_grilled_goodness': 'GRILLED GOODNESS',
  'cat_smoothies': 'SMOOTHIES',
  'cat_mongolian_rice': 'MONGOLIAN RICE',
  'cat_lassi': 'LASSI',
  'cat_nasi_goreng': 'NASI GORENG',
  'cat_frappe': 'FRAPPE',
  'cat_noodles': 'NOODLES',
  'cat_eggstra_special': 'EGGSTRA SPECIAL',
  'cat_set_menu': 'SET MENU',
  'cat_soup': 'SOUP',
  'cat_sizzling_platter': 'SIZZLING PLATTER',
  'cat_sweet_and_sour': 'SWEET AND SOUR',
  'cat_tandoori': 'TANDOORI',
  'cat_thai_rice': 'THAI RICE'
};

async function main() {
  const files = fs.readdirSync(imageDir).filter(f => f.startsWith('cat_') && f.endsWith('.png'));
  
  for (const file of files) {
    const match = file.match(/^(cat_[a-z_]+)_[0-9]+\.png$/);
    if (!match) continue;
    
    const baseKey = match[1];
    const catName = mapping[baseKey];
    
    // For cat_all, we don't update db, just upload it
    const isAll = (baseKey === 'cat_all');
    if (!catName && !isAll) continue;

    const filePath = path.join(imageDir, file);
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = `${baseKey}.png`;
    
    console.log(`Uploading ${fileName}...`);
    
    const { error } = await supabase.storage
      .from('menu-images')
      .upload(fileName, fileBuffer, {
        contentType: 'image/png',
        upsert: true
      });
      
    if (error) {
      console.error(`Error uploading ${fileName}:`, error.message);
      continue;
    }
    
    const { data: publicUrlData } = supabase.storage
      .from('menu-images')
      .getPublicUrl(fileName);
      
    const publicUrl = publicUrlData.publicUrl;
    
    if (isAll) {
      console.log(`All Category URL: ${publicUrl}`);
      // Save it out to a file so we can view it
      fs.writeFileSync('all_category_url.txt', publicUrl);
      continue;
    }

    const { error: dbError } = await supabase
      .from('menu_sub_categories')
      .update({ image_url: publicUrl })
      .eq('name', catName);
      
    if (dbError) {
      console.error(`Error updating DB for ${catName}:`, dbError.message);
    } else {
      console.log(`Success DB Update: ${catName} -> ${publicUrl}`);
    }
  }
}

main().catch(console.error);
