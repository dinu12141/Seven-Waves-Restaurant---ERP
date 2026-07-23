import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envPath = 'c:\\\\Users\\\\ROG STRIX\\\\Desktop\\\\Restaurant ERP new\\\\.env';
const envContent = readFileSync(envPath, 'utf8');

const supabaseUrlMatch = envContent.match(/VITE_SUPABASE_URL=(.*)/);
const supabaseKeyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

const supabaseUrl = supabaseUrlMatch[1].trim();
const supabaseKey = supabaseKeyMatch[1].trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const companyId = '5c7ff29c-418a-461a-9624-3667375c2af4';

  // 1. Get BENMAR kitchen
  const { data: kitchens, error: kErr } = await supabase
    .from('kitchens')
    .select('*')
    .eq('company_id', companyId)
    .ilike('name', '%BENMAR%');
    
  if (kErr || !kitchens || kitchens.length === 0) {
    console.error('Could not find BENMAR kitchen:', kErr);
    return;
  }
  const benmarId = kitchens[0].id;
  console.log(`Found BENMAR kitchen: ${kitchens[0].name} (ID: ${benmarId})`);

  // 2. Get ROTTY related subcategories
  const { data: subs, error: sErr } = await supabase
    .from('menu_sub_categories')
    .select('*')
    .eq('company_id', companyId)
    .ilike('name', '%ROTT%');

  if (sErr || !subs || subs.length === 0) {
    console.error('Could not find ROTTY subcategories:', sErr);
    return;
  }
  
  console.log(`Found ${subs.length} ROTTY subcategories:`, subs.map(s => s.name));
  
  // 3. Update the mappings in kitchen_subcategory_map
  for (const sub of subs) {
    // Check if mapping exists
    const { data: existingMap } = await supabase
      .from('kitchen_subcategory_map')
      .select('*')
      .eq('subcategory_id', sub.id)
      .maybeSingle();
      
    if (existingMap) {
      // Update
      await supabase
        .from('kitchen_subcategory_map')
        .update({ kitchen_id: benmarId })
        .eq('subcategory_id', sub.id);
      console.log(`Updated mapping for ${sub.name} to BENMAR`);
    } else {
      // Insert
      await supabase
        .from('kitchen_subcategory_map')
        .insert({
          company_id: companyId,
          subcategory_id: sub.id,
          kitchen_id: benmarId
        });
      console.log(`Inserted mapping for ${sub.name} to BENMAR`);
    }
    
    // 4. Update the actual menu_items table which may have fallback kitchen_id set
    const { data: updatedItems, error: updateErr } = await supabase
      .from('menu_items')
      .update({ kitchen_id: benmarId })
      .eq('sub_category_id', sub.id)
      .select('id, name');
      
    if (updateErr) {
      console.error(`Error updating items for ${sub.name}:`, updateErr);
    } else {
      console.log(`Updated ${updatedItems?.length || 0} menu items under ${sub.name} to BENMAR kitchen`);
    }
  }
  
  console.log('Finished updating ROTTY kitchen mappings!');
}

main().catch(console.error);
