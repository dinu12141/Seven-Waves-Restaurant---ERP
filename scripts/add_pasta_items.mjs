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
  console.log(`Found BENMAR kitchen (ID: ${benmarId})`);

  // 2. Ensure ITALIAN Category exists
  let { data: italianCat } = await supabase
    .from('categories')
    .select('*')
    .eq('company_id', companyId)
    .ilike('name', '%ITALIAN%')
    .maybeSingle();

  if (!italianCat) {
    console.log('Creating ITALIAN category...');
    const { data: newCat, error: catErr } = await supabase
      .from('categories')
      .insert({
        company_id: companyId,
        name: 'ITALIAN',
        is_active: true,
        sort_order: 10
      })
      .select()
      .single();
    if (catErr) throw catErr;
    italianCat = newCat;
  }
  console.log(`ITALIAN Category ID: ${italianCat.id}`);

  // 3. Ensure PASTA Subcategory exists and is linked to ITALIAN
  let { data: pastaSub } = await supabase
    .from('menu_sub_categories')
    .select('*')
    .eq('company_id', companyId)
    .ilike('name', '%PASTA%')
    .maybeSingle();

  if (!pastaSub) {
    console.log('Creating PASTA subcategory...');
    const { data: newSub, error: subErr } = await supabase
      .from('menu_sub_categories')
      .insert({
        company_id: companyId,
        category_id: italianCat.id,
        name: 'PASTA',
        is_active: true,
        sort_order: 1
      })
      .select()
      .single();
    if (subErr) throw subErr;
    pastaSub = newSub;
  } else if (pastaSub.category_id !== italianCat.id) {
    console.log('Updating PASTA subcategory to link to ITALIAN category...');
    const { data: updatedSub, error: updateErr } = await supabase
      .from('menu_sub_categories')
      .update({ category_id: italianCat.id })
      .eq('id', pastaSub.id)
      .select()
      .single();
    if (updateErr) throw updateErr;
    pastaSub = updatedSub;
  }
  console.log(`PASTA Subcategory ID: ${pastaSub.id}`);

  // 4. Map PASTA to BENMAR kitchen
  const { data: existingMap } = await supabase
    .from('kitchen_subcategory_map')
    .select('*')
    .eq('subcategory_id', pastaSub.id)
    .maybeSingle();
    
  if (existingMap) {
    await supabase.from('kitchen_subcategory_map').update({ kitchen_id: benmarId }).eq('subcategory_id', pastaSub.id);
  } else {
    await supabase.from('kitchen_subcategory_map').insert({
      company_id: companyId,
      subcategory_id: pastaSub.id,
      kitchen_id: benmarId
    });
  }
  console.log('PASTA successfully mapped to BENMAR kitchen.');

  // 5. Add Pasta Items if none exist
  const { data: existingItems } = await supabase
    .from('menu_items')
    .select('*')
    .eq('sub_category_id', pastaSub.id);

  if (!existingItems || existingItems.length === 0) {
    console.log('No PASTA items found. Adding standard items...');
    const newItems = [
      {
        company_id: companyId,
        category_id: italianCat.id,
        sub_category_id: pastaSub.id,
        kitchen_id: benmarId,
        name: 'CHICKEN PASTA',
        item_code: 'PAS-CHK',
        base_price: 1800
      },
      {
        company_id: companyId,
        category_id: italianCat.id,
        sub_category_id: pastaSub.id,
        kitchen_id: benmarId,
        name: 'SEAFOOD PASTA',
        item_code: 'PAS-SEA',
        base_price: 2200
      },
      {
        company_id: companyId,
        category_id: italianCat.id,
        sub_category_id: pastaSub.id,
        kitchen_id: benmarId,
        name: 'VEG PASTA',
        item_code: 'PAS-VEG',
        base_price: 1500
      },
      {
        company_id: companyId,
        category_id: italianCat.id,
        sub_category_id: pastaSub.id,
        kitchen_id: benmarId,
        name: 'BEEF PASTA',
        item_code: 'PAS-BEEF',
        base_price: 2400
      }
    ];

    const { data: insertedItems, error: insErr } = await supabase
      .from('menu_items')
      .insert(newItems)
      .select();
      
    if (insErr) throw insErr;
    console.log(`Added ${insertedItems.length} pasta items!`);

    // Assign to active menu books
    const { data: books } = await supabase.from('menu_books').select('id');
    if (books && books.length > 0) {
      const bookItems = [];
      for (const book of books) {
        for (const item of insertedItems) {
          bookItems.push({
            book_id: book.id,
            menu_item_id: item.id,
            price: item.base_price
          });
        }
      }
      await supabase.from('menu_book_items').insert(bookItems);
      console.log(`Added items to ${books.length} active menu books.`);
    }
  } else {
    // If items exist, make sure their kitchen ID and category ID are updated
    console.log(`Found ${existingItems.length} existing pasta items. Fixing their assignments...`);
    await supabase.from('menu_items')
      .update({ kitchen_id: benmarId, category_id: italianCat.id })
      .eq('sub_category_id', pastaSub.id);
  }

  console.log('Finished updating PASTA settings!');
}

main().catch(console.error);
