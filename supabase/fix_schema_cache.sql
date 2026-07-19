-- Force PostgREST to reload the schema cache
-- This fixes the "Could not find the table 'public.X' in the schema cache" errors
NOTIFY pgrst, 'reload schema';
