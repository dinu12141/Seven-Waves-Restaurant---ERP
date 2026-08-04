-- 1. Create a secure function to dump the entire database to JSON
CREATE OR REPLACE FUNCTION export_database()
RETURNS json AS $$
DECLARE
    t record;
    result jsonb := '{}'::jsonb;
    table_data jsonb;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM public.%I t', t.table_name) INTO table_data;
        result := jsonb_set(result, ARRAY[t.table_name], table_data);
    END LOOP;
    RETURN result::json;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create a secure function to restore the database from JSON
CREATE OR REPLACE FUNCTION restore_database(dump_data jsonb)
RETURNS void AS $$
DECLARE
    t record;
BEGIN
    -- Disable triggers and constraints temporarily
    SET session_replication_role = 'replica';
    
    -- Truncate all tables to prepare for clean restore
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('DELETE FROM public.%I', t.table_name);
    END LOOP;
    
    -- Insert data into each table from the JSON dump
    FOR t IN 
        SELECT key AS table_name, value AS rows 
        FROM jsonb_each(dump_data)
    LOOP
        IF jsonb_array_length(t.rows) > 0 THEN
            EXECUTE format('
                INSERT INTO public.%I 
                SELECT * FROM jsonb_populate_recordset(NULL::public.%I, %L)
            ', t.table_name, t.table_name, t.rows);
        END IF;
    END LOOP;
    
    -- Re-enable triggers and constraints
    SET session_replication_role = 'origin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
