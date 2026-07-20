-- Fix kitchen mapping constraints to allow multiple subcategories per category
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find and drop all existing unique constraints on the kitchen_subcategory_map table
    -- This ensures we remove the old UNIQUE(category_id, branch_id) regardless of its auto-generated name
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.kitchen_subcategory_map'::regclass
        AND contype = 'u'
    ) LOOP
        EXECUTE 'ALTER TABLE public.kitchen_subcategory_map DROP CONSTRAINT ' || quote_ident(r.conname) || ' CASCADE';
    END LOOP;

    -- Add the correct unique constraint for subcategory_id
    ALTER TABLE public.kitchen_subcategory_map
        ADD CONSTRAINT kitchen_subcategory_map_subcategory_id_branch_id_key UNIQUE (subcategory_id, branch_id);

END $$;
