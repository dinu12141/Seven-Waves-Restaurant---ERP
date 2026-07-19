DO $$
DECLARE
  v_company_id uuid;
  v_cat_id uuid;
  v_menu_book_id uuid;
  v_kitchen_id uuid;
  v_item_americano uuid = uuid_generate_v4();
  v_item_latte uuid = uuid_generate_v4();
  v_item_mocha uuid = uuid_generate_v4();
  v_item_cappuccino uuid = uuid_generate_v4();
  v_item_espresso_double uuid = uuid_generate_v4();
  v_item_espresso_single uuid = uuid_generate_v4();
  v_item_flat_white uuid = uuid_generate_v4();
  v_item_hot_chocolate uuid = uuid_generate_v4();
  v_item_hot_milo uuid = uuid_generate_v4();
  v_item_pot_coffee uuid = uuid_generate_v4();
  v_item_pot_tea uuid = uuid_generate_v4();
  v_item_masala_tea uuid = uuid_generate_v4();
  v_item_milk_tea uuid = uuid_generate_v4();
BEGIN
  -- 1. Get first company
  SELECT id INTO v_company_id FROM public.companies LIMIT 1;
  
  -- 2. Get or create category
  SELECT id INTO v_cat_id FROM public.categories WHERE name = 'HOT BEVERAGES' LIMIT 1;
  IF v_cat_id IS NULL THEN
    v_cat_id := uuid_generate_v4();
    INSERT INTO public.categories (id, company_id, name) VALUES (v_cat_id, v_company_id, 'HOT BEVERAGES');
  END IF;

  -- 3. Get kitchen (JUICE BAR)
  SELECT id INTO v_kitchen_id FROM public.kitchens WHERE name ILIKE '%JUICE BAR%' LIMIT 1;

  -- 4. Insert Menu Items
  INSERT INTO public.menu_items (id, company_id, category_id, kitchen_id, name, base_price, is_available, image_url) VALUES 
  (v_item_americano, v_company_id, v_cat_id, v_kitchen_id, 'Americano', 750, true, 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/hot_beverages/americano_1784485657612.png'),
  (v_item_latte, v_company_id, v_cat_id, v_kitchen_id, 'Caffe Latte', 850, true, 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/hot_beverages/caffe_latte_1784485675580.png'),
  (v_item_mocha, v_company_id, v_cat_id, v_kitchen_id, 'Caffe Mocha', 750, true, 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/hot_beverages/caffe_mocha_1784485684930.png'),
  (v_item_cappuccino, v_company_id, v_cat_id, v_kitchen_id, 'Cappuccino', 750, true, 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/hot_beverages/cappuccino_1784485693704.png'),
  (v_item_espresso_double, v_company_id, v_cat_id, v_kitchen_id, 'Espresso Double', 630, true, 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/hot_beverages/espresso_double_1784485704471.png'),
  (v_item_espresso_single, v_company_id, v_cat_id, v_kitchen_id, 'Espresso Single', 530, true, 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/hot_beverages/espresso_single_1784485721915.png'),
  (v_item_flat_white, v_company_id, v_cat_id, v_kitchen_id, 'Flat White', 750, true, 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/hot_beverages/flat_white_1784485734210.png'),
  (v_item_hot_chocolate, v_company_id, v_cat_id, v_kitchen_id, 'Hot Chocolate', 900, true, 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/hot_beverages/hot_chocolate_1784485744035.png'),
  (v_item_hot_milo, v_company_id, v_cat_id, v_kitchen_id, 'Hot Milo', 700, true, 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/hot_beverages/hot_milo_1784485753668.png'),
  (v_item_pot_coffee, v_company_id, v_cat_id, v_kitchen_id, 'Pot of Coffee', 1080, true, 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/hot_beverages/pot_of_coffee_1784485772761.png'),
  (v_item_pot_tea, v_company_id, v_cat_id, v_kitchen_id, 'Pot of Tea', 1080, true, 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/hot_beverages/pot_of_tea_1784485783393.png'),
  (v_item_masala_tea, v_company_id, v_cat_id, v_kitchen_id, 'Masala Tea', 210, true, 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/hot_beverages/masala_tea_1784485793027.png'),
  (v_item_milk_tea, v_company_id, v_cat_id, v_kitchen_id, 'Milk Tea', 250, true, 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/hot_beverages/milk_tea_1784485803630.png')
  ON CONFLICT DO NOTHING;

  -- 5. Link to Menu Books
  FOR v_menu_book_id IN SELECT id FROM public.menu_books WHERE is_active = true LOOP
    INSERT INTO public.menu_book_items (menu_book_id, menu_item_id, override_price, is_available) VALUES 
    (v_menu_book_id, v_item_americano, 750, true),
    (v_menu_book_id, v_item_latte, 850, true),
    (v_menu_book_id, v_item_mocha, 750, true),
    (v_menu_book_id, v_item_cappuccino, 750, true),
    (v_menu_book_id, v_item_espresso_double, 630, true),
    (v_menu_book_id, v_item_espresso_single, 530, true),
    (v_menu_book_id, v_item_flat_white, 750, true),
    (v_menu_book_id, v_item_hot_chocolate, 900, true),
    (v_menu_book_id, v_item_hot_milo, 700, true),
    (v_menu_book_id, v_item_pot_coffee, 1080, true),
    (v_menu_book_id, v_item_pot_tea, 1080, true),
    (v_menu_book_id, v_item_masala_tea, 210, true),
    (v_menu_book_id, v_item_milk_tea, 250, true)
    ON CONFLICT (menu_book_id, menu_item_id) DO NOTHING;
  END LOOP;

END;
$$;
