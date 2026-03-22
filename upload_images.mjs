import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const supabaseUrl = 'https://clykwuzajtwvwuavmtzs.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseWt3dXphanR3dnd1YXZtdHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTYwODEsImV4cCI6MjA4Njg3MjA4MX0.wROPuoQAQ2GD3PAZAM7cnAef6fhDctRe9izwFC-9JGA'
const supabase = createClient(supabaseUrl, supabaseKey)

const SOURCE_DIR = 'C:\\Users\\ROG STRIX\\.gemini\\antigravity\\brain\\c9cc1122-75fe-435a-9f90-108ccb5c5834'

const imageMapping = [
  { prefix: 'premium_orange_juice_', name: 'ORANGE' },
  { prefix: 'premium_mango_juice_', name: 'MANGO' },
  { prefix: 'premium_apple_juice_', name: 'APPLE' },
  { prefix: 'premium_apple_lime_', name: 'APPLE AND LIME' },
  { prefix: 'premium_avocado_', name: 'AVOCADO' },
  { prefix: 'premium_banana_juice_', name: 'BANANA' },
  { prefix: 'premium_mocktail_', name: 'FRUIT MOCKTAIL' },
  { prefix: 'premium_dragonfruit_', name: 'DRAGON FRUIT' },
  { prefix: 'premium_lemon_mint_', name: 'LEMON & MINT' },
  { prefix: 'premium_lime_', name: 'LIME' },
  { prefix: 'premium_watermelon_', name: 'WATER MELON' },
  { prefix: 'premium_mixed_fruit_', name: 'FRUIT JUICE MIXED' },
  { prefix: 'premium_naran_', name: 'NARAN' },
  { prefix: 'premium_nelli_', name: 'NELLI' },
  { prefix: 'premium_papaya_', name: 'PAPAYA' },
  { prefix: 'premium_passion_', name: 'PASSION' },
  { prefix: 'premium_pineapple_', name: 'PINEAPPLE' },
  { prefix: 'premium_pomegranate_', name: 'POMEGRANATE' },
  { prefix: 'premium_star_fruit_', name: 'STAR FRUIT' },
  { prefix: 'premium_strawberry_', name: 'STRAWBERRY' },
  { prefix: 'premium_straw_banana_', name: 'STRAWBERRY & BANANA MIX' },
  { prefix: 'premium_wood_apple_', name: 'WOOD APPLE' },
  { prefix: 'premium_apple_orange_', name: 'APPLE & ORANGE' },
  { prefix: 'premium_carrot_orange_', name: 'CARROT & ORANGE' },
  { prefix: 'premium_straw_mango_lem_', name: 'STRAWBERRY, MANGO & LEMONADE' },
  { prefix: 'premium_lime_soda_', name: 'LIME & SODA' },
  { prefix: 'premium_anoda_', name: 'ANODA JUICE' },
  { prefix: 'premium_dragon_mint_', name: 'DRAGON FRUIT JUICE' },
  { prefix: 'premium_cup_lemonade_', name: 'CUP LEMONADE' },
  { prefix: 'premium_cup_pepsi_', name: 'CUP PEPSI' },
  { prefix: 'premium_cup_7up_', name: 'CUP 7UP' },
  { prefix: 'premium_cup_soda_', name: 'CUP SODA' },
  { prefix: 'premium_cup_mirinda_', name: 'CUP MIRINDA' }
]

async function main() {
  const files = fs.readdirSync(SOURCE_DIR)
  let sqlStatements = ''

  for (const item of imageMapping) {
    const matchedFile = files.find(f => f.startsWith(item.prefix) && f.endsWith('.png'))
    if (!matchedFile) continue

    const filePath = path.join(SOURCE_DIR, matchedFile)
    const fileBuffer = fs.readFileSync(filePath)
    const fileName = `menu_${Date.now()}_${Math.floor(Math.random() * 1000)}.png`

    console.log(`Uploading ${matchedFile} for ${item.name}...`)

    const { error: uploadError } = await supabase.storage
      .from('menu-images')
      .upload(fileName, fileBuffer, {
        contentType: 'image/png',
        upsert: true
      })

    if (uploadError) {
      console.error(`Error uploading ${matchedFile}:`, uploadError)
      continue
    }

    const { data: urlData } = supabase.storage.from('menu-images').getPublicUrl(fileName)
    const publicUrl = urlData.publicUrl

    sqlStatements += `UPDATE menu_items SET image_url = '${publicUrl}' WHERE name = '${item.name}';\n`
  }
  
  fs.writeFileSync('updates.sql', sqlStatements)
  console.log('All done, check updates.sql')
}

main().catch(console.error)
