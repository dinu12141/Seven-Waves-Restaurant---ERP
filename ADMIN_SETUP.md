# Admin User Setup Guide

## 🔐 Admin Credentials

**Email:** `admin@sevenwaves.lk`  
**Password:** `Admin@123456`

---

## 📝 Setup Instructions

### Step 1: Create User in Supabase Dashboard

1. Go to [Supabase Dashboard](https://app.supabase.com/project/clykwuzajtwvwuavmtzs)
2. Navigate to **Authentication** → **Users** (sidebar)
3. Click **"Add User"** button (top right)
4. Select **"Create new user"**
5. Enter the credentials:
   - **Email:** `admin@sevenwaves.lk`
   - **Password:** `Admin@123456`
   - **Auto Confirm User:** ✅ (check this box)
6. Click **"Create user"**

### Step 2: Run Admin Setup Script

After creating the user, run the setup script to assign admin role:

1. Go to **SQL Editor** in Supabase Dashboard
2. Click **"New Query"**
3. Copy and paste the contents of `supabase/admin_setup.sql`
4. Click **"Run"** (or press Ctrl/Cmd + Enter)

The script will:

- Create a profile for the admin user
- Assign the admin role
- Link user to the main branch

---

## ✅ Verification

After setup, verify the admin user:

```sql
-- Check if admin user exists
SELECT
    p.id,
    p.full_name,
    p.email,
    r.name as role,
    b.name as branch
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id
LEFT JOIN roles r ON r.id = ur.role_id
LEFT JOIN user_branches ub ON ub.user_id = p.id
LEFT JOIN branches b ON b.id = ub.branch_id
WHERE p.email = 'admin@sevenwaves.lk';
```

You should see:

- **Full Name:** System Administrator
- **Email:** admin@sevenwaves.lk
- **Role:** admin
- **Branch:** Main Branch - Colombo

---

## 🚀 Login to Application

1. Open the application at: http://localhost:9001/
2. You'll be redirected to `/auth/login`
3. Enter credentials:
   - **Email:** admin@sevenwaves.lk
   - **Password:** Admin@123456
4. Click **Login**
5. You should be redirected to `/dashboard`

The admin user will have access to **all menu items** in the sidebar including:

- Dashboard
- POS
- Kitchen
- Orders
- Inventory
- Finance
- Admin

---

## 🗄️ Database Structure

### Company

- **ID:** `5c7ff29c-418a-461a-9624-3667375c2af4`
- **Name:** Seven Waves Restaurant

### Branch

- **ID:** `340efb20-513a-4d99-b1e7-f32f938e31a8`
- **Name:** Main Branch - Colombo

### Admin Role

- **ID:** `7bf6becf-e9f5-4624-8768-15090a703c96`
- **Name:** admin

---

## 🔧 Troubleshooting

### Issue: "Email not confirmed"

**Solution:** Make sure you checked "Auto Confirm User" when creating the user in Supabase Dashboard.

### Issue: "No roles found" / Menu items not showing

**Solution:**

1. Verify the admin setup script ran successfully
2. Check user_roles table:
   ```sql
   SELECT * FROM user_roles WHERE user_id = (
     SELECT id FROM profiles WHERE email = 'admin@sevenwaves.lk'
   );
   ```

### Issue: Login redirects back to login page

**Solution:** Check browser console for errors. Ensure:

- Supabase URL and anon key are correct in `.env`
- User is confirmed in Supabase Dashboard

---

## 📌 Important Notes

- The password `Admin@123456` is for **development only**
- Change the password in production
- Admin users have full access to all modules
- Additional users can be created with different roles (manager, waiter, cashier, etc.)
