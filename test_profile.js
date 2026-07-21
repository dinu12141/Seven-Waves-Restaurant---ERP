import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)

async function run() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, user_code, is_active').eq('user_code', '1009')
  console.log('Profile:', data, error)
  if (data && data.length > 0) {
    const { data: roles } = await supabase.from('user_roles').select('*').eq('user_id', data[0].id)
    console.log('Roles:', roles)
  }
}
run()
