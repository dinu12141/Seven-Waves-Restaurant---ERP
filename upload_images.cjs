const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  'https://clykwuzajtwvwuavmtzs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseWt3dXphanR3dnd1YXZtdHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTYwODEsImV4cCI6MjA4Njg3MjA4MX0.wROPuoQAQ2GD3PAZAM7cnAef6fhDctRe9izwFC-9JGA'
);

const artifactDir = 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9';

const images = {
  'americano': 'americano_1784485657612.png',
  'caffe_latte': 'caffe_latte_1784485675580.png',
  'caffe_mocha': 'caffe_mocha_1784485684930.png',
  'cappuccino': 'cappuccino_1784485693704.png',
  'espresso_double': 'espresso_double_1784485704471.png',
  'espresso_single': 'espresso_single_1784485721915.png',
  'flat_white': 'flat_white_1784485734210.png',
  'hot_chocolate': 'hot_chocolate_1784485744035.png',
  'hot_milo': 'hot_milo_1784485753668.png',
  'pot_of_coffee': 'pot_of_coffee_1784485772761.png',
  'pot_of_tea': 'pot_of_tea_1784485783393.png',
  'masala_tea': 'masala_tea_1784485793027.png',
  'milk_tea': 'milk_tea_1784485803630.png'
};

async function uploadAll() {
  const publicUrls = {};
  for (const [key, filename] of Object.entries(images)) {
    const filePath = path.join(artifactDir, filename);
    const fileBuffer = fs.readFileSync(filePath);
    
    // Generate a unique path on Supabase storage
    const supabasePath = `hot_beverages/${filename}`;
    
    const { data, error } = await supabase.storage
      .from('menu-images')
      .upload(supabasePath, fileBuffer, {
        contentType: 'image/png',
        upsert: true
      });
      
    if (error) {
      console.error(`Error uploading ${key}:`, error);
    } else {
      const publicUrl = supabase.storage.from('menu-images').getPublicUrl(supabasePath).data.publicUrl;
      publicUrls[key] = publicUrl;
      console.log(`Uploaded ${key}`);
    }
  }
  
  fs.writeFileSync('public_urls.json', JSON.stringify(publicUrls, null, 2));
  console.log('All done. URLs saved to public_urls.json');
}

uploadAll();
