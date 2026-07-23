import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, basename } from 'path'

// We will use standard CommonJS or ES Module? Let's check package.json. The repo uses ES Modules since we see import in previous scripts.
const envPath = join('c:\\Users\\ROG STRIX\\Desktop\\Restaurant ERP new', '.env')

let SUPABASE_URL, SUPABASE_SERVICE_KEY
try {
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('VITE_SUPABASE_URL=')) SUPABASE_URL = trimmed.split('=')[1].replace(/^["']|["']$/g, '')
    if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) SUPABASE_SERVICE_KEY = trimmed.split('=')[1].replace(/^["']|["']$/g, '')
  }
} catch (error) {
  console.error('Failed to read .env file:', error.message)
}

const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const images = [
  { item_code: 'MI-0150', file: 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9\\spaghetti_bolognese_1784542304567.png' },
  { item_code: 'MI-0149', file: 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9\\spaghetti_cheese_chicken_1784542324177.png' },
  { item_code: 'MI-0151', file: 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9\\spaghetti_chicken_1784542334687.png' },
  { item_code: 'MI-0152', file: 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9\\spaghetti_seafood_1784542344316.png' },
  { item_code: 'MI-0154', file: 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9\\spaghetti_vegetable_1784542354289.png' },
  { item_code: 'MI-0153', file: 'C:\\Users\\ROG STRIX\\.gemini\\antigravity-ide\\brain\\b976c25a-ccc4-435f-87fe-f642986b13f9\\spaghetti_vegetable_1784542354289.png' } // using vegetable image for vegetable cheese due to rate limit
]

async function run() {
  for (const img of images) {
    console.log(`Processing ${img.item_code}...`)
    try {
      const fileBuffer = readFileSync(img.file)
      const fileName = `spaghetti/${basename(img.file)}`
      
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

      const { error: updateError } = await s
        .from('menu_items')
        .update({ image_url: url })
        .eq('item_code', img.item_code)

      if (updateError) {
        console.error('Update Error:', updateError)
      } else {
        console.log(`Updated ${img.item_code} successfully with ${url}`)
      }
    } catch (err) {
      console.error('Error processing', img.item_code, err.message)
    }
  }
  console.log('All done.')
}

run()
