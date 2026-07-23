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
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') SUPABASE_SERVICE_KEY = val
  }
} catch (error) {}

const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function run() {
  const {data: cat} = await s.from('categories').select('*').eq('name', 'ITALIAN').single()
  console.log('ITALIAN Category ID:', cat.id)
  
  // Let's check the most recently added items in the database
  const {data: recent} = await s.from('menu_items').select('id, name, category_id, sub_category_id, created_at, categories(name), menu_sub_categories(name)').order('created_at', {ascending: false}).limit(20)
  console.log('Most recent items:')
  recent.forEach(i => console.log(`${i.name} (Cat: ${i.categories?.name}, SubCat: ${i.menu_sub_categories?.name})`))
}
run();
