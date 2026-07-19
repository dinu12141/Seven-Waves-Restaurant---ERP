import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env' })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function run() {
  const { data, error } = await supabase.from('pos_shifts').select('*').limit(1)
  console.log('pos_shifts row:', data?.[0] || error)
  
  const { data: pData, error: pError } = await supabase.from('payments').select('*').limit(1)
  console.log('payments row:', pData?.[0] || pError)

  const { data: opData, error: opError } = await supabase.from('order_payments').select('*').limit(1)
  console.log('order_payments row:', opData?.[0] || opError)
}

run()
