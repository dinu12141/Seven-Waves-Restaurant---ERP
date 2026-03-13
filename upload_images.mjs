import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from environment or directly
const SUPABASE_URL = 'https://clykwuzajtwvwuavmtzs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseWt3dXphanR3dnd1YXZtdHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTYwODEsImV4cCI6MjA4Njg3MjA4MX0.wROPuoQAQ2GD3PAZAM7cnAef6fhDctRe9izwFC-9JGA';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const imageDir = 'C:\\Users\\ROG STRIX\\.gemini\\antigravity\\brain\\ef6627e3-bb51-4a06-a7c4-f4b6c7985c28';

async function main() {
  const files = fs.readdirSync(imageDir).filter(f => f.startsWith('menu_') && f.endsWith('.png'));
  
  let processed = 0;
  let skipped = 0;
  let dbUpdates = 0;
  
  console.log(`Found ${files.length} images to process in ${imageDir}.`);
  
  for (const file of files) {
    // Extract UUID: menu_6259b27e_1d65_4124_865d_397d16cb6b9a_1773338551054.png -> 6259b27e-1d65-4124-865d-397d16cb6b9a
    const match = file.match(/^menu_([a-f0-9_]+)_[0-9]+\.png$/);
    if (!match) continue;
    
    // Replace the first 4 underscores with dashes to form standard UUID format
    let uuidStr = match[1];
    let parts = uuidStr.split('_');
    const uuid = parts.slice(0, 5).join('-');
    const filePath = path.join(imageDir, file);
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = `menu-${uuid}.png`;
    
    console.log(`Uploading ${fileName}...`);
    
    // Upload image to Supabase Storage
    const { error } = await supabase.storage
      .from('menu-images')
      .upload(fileName, fileBuffer, {
        contentType: 'image/png',
        upsert: true
      });
      
    if (error) {
      console.error(`Error uploading ${fileName}:`, error.message);
      skipped++;
      continue;
    }
    
    processed++;
    
    // Get Public URL
    const { data: publicUrlData } = supabase.storage
      .from('menu-images')
      .getPublicUrl(fileName);
      
    const publicUrl = publicUrlData.publicUrl;
    
    // Update menu_items table
    const { error: dbError } = await supabase
      .from('menu_items')
      .update({ image_url: publicUrl })
      .eq('id', uuid);
      
    if (dbError) {
      console.error(`Error updating DB for ${uuid}:`, dbError.message);
    } else {
      console.log(`Success DB Update: ${uuid} -> ${publicUrl}`);
      dbUpdates++;
    }
  }
  
  console.log(`\n=========================================`);
  console.log(`Process Complete Summary:`);
  console.log(`Total Found     : ${files.length}`);
  console.log(`Images Uploaded : ${processed}`);
  console.log(`DB Rows Updated : ${dbUpdates}`);
  console.log(`Images Skipped  : ${skipped}`);
  console.log(`=========================================`);
}

main().catch(console.error);
