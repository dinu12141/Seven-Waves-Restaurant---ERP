import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, basename } from 'path'

const envPath = join('c:\\Users\\ROG STRIX\\Desktop\\Restaurant ERP new', '.env')

let SUPABASE_URL, SUPABASE_SERVICE_KEY
try {
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('VITE_SUPABASE_URL=')) SUPABASE_URL = trimmed.split('=')[1].replace(/^["']|["']$/g, '')
    if (trimmed.startsWith('VITE_SUPABASE_SERVICE_ROLE_KEY=')) SUPABASE_SERVICE_KEY = trimmed.split('=')[1].replace(/^["']|["']$/g, '')
  }
} catch (error) {
  console.error('Failed to read .env file:', error.message)
}

const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const pastaItems = [
  { item_code: 'MI-0155', name: 'CREAMY PENNE CARBONARA', base_price: 2180, image_file: 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9\\creamy_penne_carbonara_1784547517533.png' },
  { item_code: 'MI-0156', name: 'PASTA CHEESE & CHICKEN', base_price: 2180, image_file: 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9\\creamy_penne_carbonara_1784547517533.png' },
  { item_code: 'MI-0157', name: 'PASTA VEGETABLE', base_price: 1380, image_file: 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9\\creamy_penne_carbonara_1784547517533.png' },
  { item_code: 'MI-0158', name: 'PASTA CHICKEN', base_price: 1780, image_file: 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9\\creamy_penne_carbonara_1784547517533.png' },
  { item_code: 'MI-0159', name: 'PASTA BOLOGNESE', base_price: 2180, image_file: 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9\\creamy_penne_carbonara_1784547517533.png' },
  { item_code: 'MI-0160', name: 'PASTA SEAFOOD (Prawns, Cuttle & Fish)', base_price: 2380, image_file: 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9\\creamy_penne_carbonara_1784547517533.png' },
  { item_code: 'MI-0161', name: 'GAMBERI PASTA (Prawns & Cream)', base_price: 2380, image_file: 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9\\creamy_penne_carbonara_1784547517533.png' }
]

async function run() {
  const {data: book} = await s.from('menu_books').select('id').eq('name', 'TABLE MENU BOOK').single();
  const {data: cat} = await s.from('categories').select('id, company_id').eq('name', 'ITALIAN').single();
  
  // Find kitchen ID for BENMAR
  const {data: kitchen} = await s.from('kitchens').select('id').eq('name', 'BENMAR').single();

  let sortOrder = 30; // Start at 30 to be after Spaghetti

  for (const img of pastaItems) {
    console.log(`Processing ${img.item_code}...`)
    try {
      // 1. Upload image (we will use the same image for all for now)
      const fileBuffer = readFileSync(img.image_file)
      // Make a unique filename for each item so they can be replaced later
      const fileName = `pasta/${img.item_code}_${Date.now()}.png`
      
      const { data: uploadData, error: uploadError } = await s.storage
        .from('menu-images')
        .upload(fileName, fileBuffer, {
          contentType: 'image/png',
          upsert: true
        })

      if (uploadError) {
        console.error('Upload Error:', uploadError)
        continue
      }
      
      const { data: publicUrlData } = s.storage.from('menu-images').getPublicUrl(fileName)
      const url = publicUrlData.publicUrl

      // 2. Insert into menu_items
      const { data: insertedItem, error: insertError } = await s.from('menu_items').insert({
        company_id: cat.company_id,
        item_code: img.item_code,
        name: img.name,
        base_price: img.base_price,
        category_id: cat.id,
        kitchen_id: kitchen.id,
        image_url: url,
        is_available: true
      }).select('id').single();

      if (insertError) {
        console.error('Insert Menu Item Error:', insertError)
        continue;
      }

      // 3. Add to menu_book_items
      const { error: bookError } = await s.from('menu_book_items').upsert({
        menu_book_id: book.id,
        menu_item_id: insertedItem.id,
        override_price: img.base_price,
        sort_order: sortOrder++,
        is_available: true
      }, { onConflict: 'menu_book_id, menu_item_id' });

      if (bookError) {
         console.error('Book Item Error:', bookError)
      } else {
         console.log(`Successfully added ${img.name} with URL ${url}`)
      }

    } catch (err) {
      console.error('Error processing', img.item_code, err.message)
    }
  }
  console.log('All done.')
}

run()
