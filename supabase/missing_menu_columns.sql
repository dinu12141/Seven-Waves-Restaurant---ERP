-- Adding missing UI columns to menu_items table
ALTER TABLE menu_items 
ADD COLUMN IF NOT EXISTS is_veg BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_spicy BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_best_seller BOOLEAN DEFAULT false;
