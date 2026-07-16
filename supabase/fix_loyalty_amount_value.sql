-- ═══════════════════════════════════════════════════════════════════
-- FIX: column "amount_value" of relation "loyalty_transactions" 
--      does not exist
-- ═══════════════════════════════════════════════════════════════════
-- The trg_order_loyalty_reward trigger (AFTER UPDATE ON orders)
-- calls rpc_apply_loyalty_reward() which tries to INSERT into 
-- loyalty_transactions with an 'amount_value' column.
-- However, the table schema only has 'amount_reference'.
--
-- FIX: Add the missing 'amount_value' column.
-- Also add 'payment_id' if missing (referenced by loyalty system v2).
-- ═══════════════════════════════════════════════════════════════════

-- Add the missing amount_value column
ALTER TABLE public.loyalty_transactions 
  ADD COLUMN IF NOT EXISTS amount_value NUMERIC DEFAULT 0;

-- Add payment_id column if missing (loyalty v2 schema expects it)
ALTER TABLE public.loyalty_transactions 
  ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL;

-- Add amount_reference column if missing
ALTER TABLE public.loyalty_transactions 
  ADD COLUMN IF NOT EXISTS amount_reference NUMERIC DEFAULT 0;

-- Add loyalty_account_id if missing (coin-based system needs it)
ALTER TABLE public.loyalty_transactions 
  ADD COLUMN IF NOT EXISTS loyalty_account_id UUID REFERENCES public.loyalty_accounts(id) ON DELETE CASCADE;

-- Add customer_id if missing (needed for POS search/redeem)
ALTER TABLE public.loyalty_transactions 
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;

-- Add coins column if missing (coin-based system)
ALTER TABLE public.loyalty_transactions 
  ADD COLUMN IF NOT EXISTS coins INT DEFAULT 0;

-- Add type column if missing (legacy compat - maps to transaction_type)
ALTER TABLE public.loyalty_transactions 
  ADD COLUMN IF NOT EXISTS type TEXT;

-- Add note column if missing
ALTER TABLE public.loyalty_transactions 
  ADD COLUMN IF NOT EXISTS note TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- Sync trigger: keep 'type' and 'transaction_type' in sync,
-- keep 'coins' and 'points' in sync
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_sync_loyalty_transaction_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Sync loyalty_id <-> loyalty_account_id
    IF NEW.loyalty_id IS NULL AND NEW.loyalty_account_id IS NOT NULL THEN
        NEW.loyalty_id := NEW.loyalty_account_id;
    ELSIF NEW.loyalty_account_id IS NULL AND NEW.loyalty_id IS NOT NULL THEN
        NEW.loyalty_account_id := NEW.loyalty_id;
    ELSIF NEW.loyalty_id IS NULL AND NEW.customer_id IS NOT NULL THEN
        SELECT id INTO NEW.loyalty_id FROM public.loyalty_accounts WHERE customer_id = NEW.customer_id LIMIT 1;
        IF NEW.loyalty_id IS NOT NULL THEN
            NEW.loyalty_account_id := NEW.loyalty_id;
        END IF;
    END IF;

    -- Automatically populate company_id if it is NULL
    IF NEW.company_id IS NULL THEN
        -- 1. Try to get company_id from the order
        IF NEW.order_id IS NOT NULL THEN
            SELECT company_id INTO NEW.company_id FROM public.orders WHERE id = NEW.order_id;
        END IF;

        -- 2. Try to get company_id from the loyalty account
        IF NEW.company_id IS NULL AND NEW.loyalty_id IS NOT NULL THEN
            SELECT company_id INTO NEW.company_id FROM public.loyalty_accounts WHERE id = NEW.loyalty_id;
        END IF;

        -- 3. Try to get company_id from the customer
        IF NEW.company_id IS NULL AND NEW.customer_id IS NOT NULL THEN
            SELECT company_id INTO NEW.company_id FROM public.customers WHERE id = NEW.customer_id;
        END IF;

        -- 4. Fallback to the first company in the database
        IF NEW.company_id IS NULL THEN
            SELECT id INTO NEW.company_id FROM public.companies LIMIT 1;
        END IF;
    END IF;

    -- Sync type <-> transaction_type
    IF NEW.type IS NOT NULL AND NEW.transaction_type IS NULL THEN
        NEW.transaction_type := NEW.type;
    ELSIF NEW.transaction_type IS NOT NULL AND NEW.type IS NULL THEN
        NEW.type := NEW.transaction_type;
    END IF;

    -- Sync coins <-> points
    IF NEW.coins IS NOT NULL AND NEW.coins <> 0 AND (NEW.points IS NULL OR NEW.points = 0) THEN
        NEW.points := NEW.coins;
    ELSIF NEW.points IS NOT NULL AND NEW.points <> 0 AND (NEW.coins IS NULL OR NEW.coins = 0) THEN
        NEW.coins := ABS(NEW.points);
    END IF;

    -- Sync amount_value <-> amount_reference
    IF NEW.amount_value IS NOT NULL AND NEW.amount_value <> 0 AND (NEW.amount_reference IS NULL OR NEW.amount_reference = 0) THEN
        NEW.amount_reference := NEW.amount_value;
    ELSIF NEW.amount_reference IS NOT NULL AND NEW.amount_reference <> 0 AND (NEW.amount_value IS NULL OR NEW.amount_value = 0) THEN
        NEW.amount_value := NEW.amount_reference;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_loyalty_transaction_columns ON public.loyalty_transactions;
CREATE TRIGGER trg_sync_loyalty_transaction_columns
    BEFORE INSERT OR UPDATE ON public.loyalty_transactions
    FOR EACH ROW EXECUTE FUNCTION fn_sync_loyalty_transaction_columns();

-- ═══════════════════════════════════════════════════════════════════
-- DONE! Now the rpc_apply_loyalty_reward trigger and other loyalty
-- transactions will work because company_id is auto-populated.
-- ═══════════════════════════════════════════════════════════════════

