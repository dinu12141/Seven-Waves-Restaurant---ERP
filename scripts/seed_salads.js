import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env')

let SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY
try {
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const [key, ...rest] = line.trim().split('=')
    const val = rest.join('=').replace(/^["']|["']$/g, '')
    if (key === 'VITE_SUPABASE_URL') SUPABASE_URL = val
    if (key === 'VITE_SUPABASE_ANON_KEY') SUPABASE_KEY = val
    if (key === 'VITE_SUPABASE_SERVICE_ROLE_KEY') SUPABASE_SERVICE_KEY = val
  }
} catch (err) {
  console.error('Cannot read .env:', err)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_KEY)
const COMPANY_ID = '5c7ff29c-418a-461a-9624-3667375c2af4'

async function main() {
  console.log('Seeding Salads...')

  // Get Branch ID dynamically
  const { data: branches } = await supabase.from('branches').select('id, company_id').limit(1)
  const branchId = branches?.[0]?.id
  const companyId = branches?.[0]?.company_id || COMPANY_ID

  if (!branchId) {
    console.error('No branches found!')
    process.exit(1)
  }

  // 1. Create Category "Italian"
  let { data: cat } = await supabase.from('categories').select('id').eq('name', 'Italian').eq('company_id', companyId).maybeSingle()
  if (!cat) {
    const { data: insertedCat, error } = await supabase.from('categories').insert({ name: 'Italian', company_id: companyId, sort_order: 20 }).select().single()
    if (error) { console.error('Error creating Category:', error); process.exit(1); }
    cat = insertedCat
    console.log('Created category: Italian')
  } else {
    console.log('Found category: Italian')
  }

  // 2. Create Sub Category "Salads"
  let { data: subCat } = await supabase.from('menu_sub_categories').select('id').eq('name', 'Salads').eq('category_id', cat.id).maybeSingle()
  if (!subCat) {
    const { data: insertedSub, error } = await supabase.from('menu_sub_categories').insert({ name: 'Salads', category_id: cat.id, company_id: companyId, sort_order: 10 }).select().single()
    if (error) { console.error('Error creating Sub Category:', error); process.exit(1); }
    subCat = insertedSub
    console.log('Created subcategory: Salads')
  } else {
    console.log('Found subcategory: Salads')
  }

  // 3. Create Kitchen "Italian"
  let { data: kitchen } = await supabase.from('kitchens').select('id').eq('name', 'Italian').eq('branch_id', branchId).maybeSingle()
  if (!kitchen) {
    const { data: insertedKit, error } = await supabase.from('kitchens').insert({ name: 'Italian', branch_id: branchId, company_id: companyId, is_cashier_display: false }).select().single()
    if (error) { console.error('Error creating Kitchen:', error); process.exit(1); }
    kitchen = insertedKit
    console.log('Created kitchen: Italian')
  } else {
    console.log('Found kitchen: Italian')
  }

  // 4. Map Subcategory to Kitchen
  let { data: mapping } = await supabase.from('kitchen_subcategory_map').select('id').eq('subcategory_id', subCat.id).maybeSingle()
  if (!mapping) {
    const { error } = await supabase.from('kitchen_subcategory_map').insert({ branch_id: branchId, category_id: cat.id, subcategory_id: subCat.id, kitchen_id: kitchen.id })
    if (error) { console.error('Error creating Mapping:', error); process.exit(1); }
    console.log('Mapped Salads -> Italian Kitchen')
  } else {
    console.log('Mapping exists for Salads')
  }

  // 5. Upload images and insert menu items
  const menuItemsData = [
    { name: 'SEAFOOD SALAD', price: 2200, fileRegex: /seafood_salad_/ },
    { name: 'CHEF SALAD (Seven Waves Style)', price: 2120, fileRegex: /chef_salad_/ },
    { name: 'CHICKEN SALAD', price: 1980, fileRegex: /chicken_salad_/ },
    { name: 'MILANO CEASER SALAD', price: 2100, fileRegex: /milano_ceaser_salad_/ },
    { name: 'GREEN GARDEN SALAD', price: 1380, fileRegex: /green_garden_salad_/ },
    { name: 'ONION SALAD (Sri Lankan)', price: 1050, fileRegex: /onion_salad_/ },
  ]

  const tempDir = join(__dirname, '..', 'temp_images')
  let files = []
  try {
    files = readdirSync(tempDir)
  } catch(e) {
    console.log('No temp_images dir found', e.message)
  }

  for (const item of menuItemsData) {
    const fileName = files.find(f => item.fileRegex.test(f))
    let publicUrl = null
    if (fileName) {
      const filePath = join(tempDir, fileName)
      const blob = readFileSync(filePath)
      const destPath = `salads/${fileName}`
      
      const { error: uploadErr } = await supabase.storage.from('menu-images').upload(destPath, blob, {
        contentType: 'image/png',
        upsert: true
      })
      if (uploadErr) {
        console.error('Failed to upload', fileName, uploadErr.message)
      } else {
        publicUrl = supabase.storage.from('menu-images').getPublicUrl(destPath).data.publicUrl
        console.log(`Uploaded image for ${item.name}`)
      }
    } else {
      console.warn(`No image found for ${item.name}`)
    }

    // Insert or update menu item
    let { data: existingItem } = await supabase.from('menu_items')
      .select('id, image_url')
      .eq('name', item.name)
      .eq('company_id', companyId)
      .maybeSingle()

    const payload = {
      company_id: companyId,
      name: item.name,
      base_price: item.price,
      category_id: cat.id,
      sub_category_id: subCat.id,
      is_available: true
    }
    
    // Only update image_url if we successfully uploaded a new one, or if it didn't exist
    if (publicUrl) {
      payload.image_url = publicUrl
    }

    if (existingItem) {
      const { error } = await supabase.from('menu_items').update(payload).eq('id', existingItem.id)
      if (error) console.error(`Error updating item ${item.name}:`, error)
      else console.log(`Updated item: ${item.name}`)
    } else {
      const { error } = await supabase.from('menu_items').insert(payload)
      if (error) console.error(`Error inserting item ${item.name}:`, error)
      else console.log(`Inserted item: ${item.name}`)
    }
  }

  console.log('Seed completed.')
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
