import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env')

let SUPABASE_URL, SUPABASE_SERVICE_KEY
try {
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const [key, ...rest] = line.trim().split('=')
    const val = rest.join('=').replace(/^["']|["']$/g, '')
    if (key === 'VITE_SUPABASE_URL') SUPABASE_URL = val
    if (key === 'VITE_SUPABASE_SERVICE_ROLE_KEY') SUPABASE_SERVICE_KEY = val
  }
} catch (err) {
  console.error('Failed to read .env:', err);
}

const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function run() {
  // Find correct ITALIAN category
  const {data: cat} = await s.from('categories').select('*').eq('name', 'ITALIAN').single()
  const correctCatId = cat.id

  // Find incorrect Italian category
  const {data: badCat} = await s.from('categories').select('*').eq('name', 'Italian').maybeSingle()
  
  if (badCat) {
    console.log('Fixing categories...')
    
    // 1. Find the Salads subcategory under badCat
    const {data: subCat} = await s.from('menu_sub_categories').select('*').eq('category_id', badCat.id)
    if (subCat && subCat.length) {
      await s.from('menu_sub_categories').update({ category_id: correctCatId }).in('id', subCat.map(s => s.id))
      console.log('Moved subcategories to correct category.')
    }
    
    // 2. Find kitchen mappings under badCat
    const {data: maps} = await s.from('kitchen_subcategory_map').select('*').eq('category_id', badCat.id)
    if (maps && maps.length) {
      await s.from('kitchen_subcategory_map').update({ category_id: correctCatId }).in('id', maps.map(m => m.id))
      console.log('Moved kitchen mappings to correct category.')
    }

    // 3. Update menu items
    const {data: items} = await s.from('menu_items').select('*').eq('category_id', badCat.id)
    if (items && items.length) {
      await s.from('menu_items').update({ category_id: correctCatId }).in('id', items.map(i => i.id))
      console.log('Moved menu items to correct category.')
    }
    
    // 4. Delete bad category
    await s.from('categories').delete().eq('id', badCat.id)
    console.log('Deleted duplicate Italian category.')
  } else {
    console.log('No bad category found.')
  }
}
run();
