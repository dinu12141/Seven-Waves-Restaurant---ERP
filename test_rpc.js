import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function run() {
  const { data, error } = await supabase.rpc('get_email_by_user_code', { p_user_code: '1009' })
  console.log('Lookup:', data, error)
  
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: 'NEW12NEW11214@GMAIL.COM', // the actual email from screenshot
    password: 'password123' // assuming they know the password? The user just created it.
  })
  console.log('SignIn:', signInData?.user?.email, signInError)
}

run()
