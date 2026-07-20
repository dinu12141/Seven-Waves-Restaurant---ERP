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
} catch (error) {
  console.error('Failed to read .env file:', error.message)
}

const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function run() {
  const {data: book} = await s.from('menu_books').select('id').eq('name', 'TABLE MENU BOOK').single();
  const {data: cat} = await s.from('categories').select('id').eq('name', 'Italian').single();
  const {data: items} = await s.from('menu_items').select('id, base_price').eq('category_id', cat.id);
  
  const payloads = items.map((it, i) => ({ 
    menu_book_id: book.id, 
    menu_item_id: it.id, 
    override_price: it.base_price, 
    sort_order: i, 
    is_available: true 
  }));
  
  const {error} = await s.from('menu_book_items').upsert(payloads, {onConflict: 'menu_book_id, menu_item_id'});
  console.log('Done', error || 'Success');
}
run();
