import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.trim().split('=');
  if(k) acc[k] = v.join('=').replace(/^['"]|['"]$/g, '');
  return acc;
}, {});

const s = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const companyId = '5c7ff29c-418a-461a-9624-3667375c2af4';

  const { data: cat } = await s.from('categories').select('id, name').ilike('name', 'Italian').eq('company_id', companyId).maybeSingle();
  let categoryId = cat?.id;
  if (!categoryId) {
    const { data: newCat } = await s.from('categories').insert({ name: 'ITALIAN', company_id: companyId }).select().single();
    categoryId = newCat.id;
  }
  
  const { data: sub } = await s.from('menu_sub_categories').select('id, name').ilike('name', 'Lasagna').eq('category_id', categoryId).maybeSingle();
  let subCategoryId = sub?.id;
  if (!subCategoryId) {
    const { data: newSub } = await s.from('menu_sub_categories').insert({ name: 'LASAGNA', category_id: categoryId }).select().single();
    subCategoryId = newSub.id;
  }
  
  const { data: kitchens } = await s.from('kitchens').select('id, name');
  console.log('Available kitchens:', kitchens);
  let kitchenId = kitchens?.find(k => k.name.toUpperCase() === 'ITALIAN')?.id;
  
  if (!kitchenId) {
     console.log('Italian kitchen not found, creating...');
     const { data: newKit, error: errK } = await s.from('kitchens').insert({ name: 'ITALIAN', company_id: companyId, is_active: true }).select().single();
     if (errK) {
       console.error('Kitchen insert error:', errK);
     }
     kitchenId = newKit?.id;
  }

  const itemsToAdd = [
    { name: 'LASAGNA CHICKEN', price: 2080 },
    { name: 'LASAGNA VEGETABLE', price: 1480 }
  ];

  for (const item of itemsToAdd) {
    const payload = {
      name: item.name,
      company_id: companyId,
      category_id: categoryId,
      sub_category_id: subCategoryId,
      kitchen_id: kitchenId,
      base_price: item.price,
      is_available: true,
      is_published_on_web: true,
      preparation_time_mins: 25,
      is_veg: item.name.includes('VEGETABLE')
    };
    
    const { error } = await s.from('menu_items').insert(payload);
    if (error) console.error('Failed to insert', item.name, error.message);
    else console.log('Inserted', item.name);
  }
}
run();
