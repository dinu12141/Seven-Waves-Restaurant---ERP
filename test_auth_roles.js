import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)

async function run() {
  const { data, error } = await supabase.rpc('auth_get_roles')
  console.log('Roles from RPC:', data, error)
}
run()
