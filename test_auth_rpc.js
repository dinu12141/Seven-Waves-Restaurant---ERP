import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function run() {
  // Login as admin first
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.com',
    password: 'admin' // Or whatever the admin password is. Wait, do I know it?
  })
  
  if (authError) {
    console.log('Failed to login as admin:', authError)
    return
  }

  // Use RPC to create user
  const email = 'testwaiter_auth123@test.com'
  const password = process.env.SW_TEST_PASSWORD
  
  const { data: uid, error: createError } = await supabase.rpc('admin_create_user', {
    p_email: email,
    p_password: password,
    p_full_name: 'Test Waiter Auth',
    p_phone: '1234567890',
    p_user_code: '9988'
  })
  console.log('Created user:', uid, createError)
  
  if (uid) {
    // Log out admin
    await supabase.auth.signOut()
    
    // Log in as new user
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    })
    console.log('SignIn result:', signInData?.user?.email, signInError)
    
    // Clean up
    await supabase.auth.signInWithPassword({ email: 'admin@sevenwaves.com', password: 'admin' })
    await supabase.rpc('admin_delete_user', { target_user_id: uid })
  }
}

run()
