const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  // 1. Get kitchens
  const { data: kitchens } = await supabase.from('kitchens').select('*');
  console.log("=== Kitchens ===");
  console.log(kitchens);

  // 2. Get categories
  const { data: categories } = await supabase.from('menu_categories').select('*');
  console.log("\n=== Categories ===");
  console.log(categories);

  // 3. Get sub-categories
  const { data: subCategories } = await supabase.from('menu_sub_categories').select('*');
  console.log("\n=== Sub Categories ===");
  console.log(subCategories);

  // 4. Get menu books
  const { data: menuBooks } = await supabase.from('menu_books').select('*');
  console.log("\n=== Menu Books ===");
  console.log(menuBooks);
}

main().catch(console.error);
