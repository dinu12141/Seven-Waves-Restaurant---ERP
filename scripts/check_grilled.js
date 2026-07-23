import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.trim().split('=');
  if(k) acc[k] = v.join('=').replace(/^['"]|['"]$/g, '');
  return acc;
}, {});

const s = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: all } = await s.from('menu_items').select('id, name, base_price').in('sub_category_id', [
    '5d267fcc-1cbb-4281-b395-91ca249e679e', // GRILLED ITEMS
    'a65e27ed-cb0c-4e4e-8bbd-212db3703052', // GRILLED ITEMS (OTHER ALL ITEMS)
    '8bdfa8ee-28b3-4af3-9cf5-2dc2e9c4ee9e', // GRILLED ITEMS (ONLY CRISPY CHICKEN POTION)
  ]);
  console.log('All grilled subcategory items:', all);
}
run();
