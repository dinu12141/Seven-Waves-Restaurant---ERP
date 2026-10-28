-- ═══════════════════════════════════════════════════════════════════════════
-- #140 — Server-side guard on supplier payment allocations (PROPOSAL)
--
-- STATUS: NOT APPLIED. Review first. Apply only AFTER #128 (auto-post GRN
-- bills) and the #139 backfill (B1 posts the GRN drafts, B3 repairs
-- AP_INV-2026-000118 / -000479). Before then every live bill is draft, so the
-- guard would (correctly) reject every new payment.
--
-- Why: the client was the only guard. Finance Payables let users pay DRAFT
-- bills (never credited to AP), which is how two invoices became "paid" with
-- posted_at NULL and no ap_ledger INVOICE row. Neither the live
-- create_and_post_payment nor #128's post_supplier_payment checks that:
--   • the invoice belongs to the payment's supplier (and company),
--   • the invoice is posted / partial_paid,
--   • an allocation is ≤ the invoice's balance_due,
--   • the allocations add up to the payment total.
--
-- Rule (same as src/services/procurementService.ts PAYABLE_AP_INVOICE_STATUSES):
--   payable = status IN ('posted','partial_paid') AND balance_due > 0
--
-- Design — three triggers, no RPC signature changes, no overloads:
--   1. trg_a_guard_supplier_payment_allocation
--        BEFORE INSERT OR UPDATE ON supplier_payment_allocations (row level):
--        supplier / company match, invoice payable, 0 < amount ≤ balance_due,
--        allocations of a non-draft payment are frozen.
--   2. trg_a_guard_supplier_payment_post
--        BEFORE UPDATE OF status ON supplier_payments, draft → posted. Named
--        "trg_a_…" so it fires before trg_block_suppay_edit and
--        trg_post_supplier_payment (same-event triggers fire in name order).
--        It locks the invoices FOR UPDATE and re-validates every allocation
--        against the CURRENT balance, so two draft payments cannot both take
--        the same balance. It then checks sum(allocations) = total_amount.
--   3. trg_z_check_supplier_payment_balanced (+ the allocation-side twin)
--        DEFERRABLE INITIALLY DEFERRED constraint triggers. At COMMIT, a
--        payment that is 'posted' and was inserted or had allocations changed
--        in this transaction must be fully allocated. This covers a
--        create_and_post_payment that inserts the header already 'posted' and
--        the allocations afterwards; its source is not in the repo, so the
--        order is unknown.
--
-- Untouched historic rows are never re-checked: the triggers fire only on new
-- writes. Status-only updates such as cheque sync or cancellation of old
-- posted payments do not reach check 3.
-- The trigger functions are SECURITY DEFINER, so a procurement user whose RLS
-- cannot see ap_invoices still gets a correct check rather than a false
-- "invoice not found".
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Per-allocation guard
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_guard_supplier_payment_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pay public.supplier_payments%ROWTYPE;
    v_inv public.ap_invoices%ROWTYPE;
BEGIN
    SELECT * INTO v_pay FROM public.supplier_payments WHERE id = NEW.payment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Supplier payment % not found', NEW.payment_id;
    END IF;

    -- Allocations of a posted/cancelled payment are history: frozen.
    IF TG_OP = 'UPDATE' AND v_pay.status <> 'draft'
       AND (NEW.amount, NEW.invoice_id, NEW.payment_id) IS DISTINCT FROM (OLD.amount, OLD.invoice_id, OLD.payment_id) THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Allocations of % payment % cannot be changed',
            v_pay.status, v_pay.doc_number;
    END IF;

    -- Lock the bill so a concurrent payment cannot take the same balance.
    SELECT * INTO v_inv FROM public.ap_invoices WHERE id = NEW.invoice_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: AP invoice % not found', NEW.invoice_id;
    END IF;

    IF v_inv.supplier_id IS DISTINCT FROM v_pay.supplier_id THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: AP invoice "%" belongs to a different supplier than payment %',
            v_inv.doc_number, v_pay.doc_number;
    END IF;

    IF v_inv.company_id IS DISTINCT FROM v_pay.company_id THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: AP invoice "%" belongs to a different company than payment %',
            v_inv.doc_number, v_pay.doc_number;
    END IF;

    -- Only check payability for live (draft) allocations. A posted payment's
    -- rows are frozen above, and re-checking them here would block no-op updates.
    IF v_pay.status = 'draft' OR TG_OP = 'INSERT' THEN
        IF v_inv.status NOT IN ('posted', 'partial_paid') THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: AP invoice "%" is "%". Only posted bills can be paid — post it first (AP Invoices).',
                v_inv.doc_number, v_inv.status;
        END IF;

        IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Allocation to AP invoice "%" must be greater than zero', v_inv.doc_number;
        END IF;

        IF NEW.amount > COALESCE(v_inv.balance_due, v_inv.total_amount - COALESCE(v_inv.paid_amount, 0)) THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Allocation % to AP invoice "%" exceeds its balance due %',
                NEW.amount, v_inv.doc_number,
                COALESCE(v_inv.balance_due, v_inv.total_amount - COALESCE(v_inv.paid_amount, 0));
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_guard_supplier_payment_allocation() IS
    '#140: allocation must target a posted/partial_paid bill of the payment''s supplier and company, 0 < amount ≤ balance_due; allocations of non-draft payments are frozen.';

DROP TRIGGER IF EXISTS trg_a_guard_supplier_payment_allocation ON public.supplier_payment_allocations;
CREATE TRIGGER trg_a_guard_supplier_payment_allocation
BEFORE INSERT OR UPDATE ON public.supplier_payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_supplier_payment_allocation();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. draft → posted: re-validate against current balances + must balance
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_guard_supplier_payment_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row   RECORD;
    v_sum   NUMERIC(14,2) := 0;
    v_count INTEGER := 0;
BEGIN
    -- Lock every allocated bill in a stable order (deadlock-safe) and check it.
    FOR v_row IN
        SELECT a.amount, i.id, i.doc_number, i.status, i.supplier_id, i.company_id,
               COALESCE(i.balance_due, i.total_amount - COALESCE(i.paid_amount, 0)) AS balance
          FROM public.supplier_payment_allocations a
          JOIN public.ap_invoices i ON i.id = a.invoice_id
         WHERE a.payment_id = NEW.id
         ORDER BY i.id
           FOR UPDATE OF i
    LOOP
        IF v_row.supplier_id IS DISTINCT FROM NEW.supplier_id
           OR v_row.company_id IS DISTINCT FROM NEW.company_id THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Payment % is allocated to AP invoice "%" of another supplier/company',
                NEW.doc_number, v_row.doc_number;
        END IF;
        IF v_row.status NOT IN ('posted', 'partial_paid') THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Payment % is allocated to AP invoice "%" which is "%". Only posted bills can be paid.',
                NEW.doc_number, v_row.doc_number, v_row.status;
        END IF;
        IF v_row.amount > v_row.balance THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Payment % allocates % to AP invoice "%" but only % is due',
                NEW.doc_number, v_row.amount, v_row.doc_number, v_row.balance;
        END IF;
        v_sum   := v_sum + v_row.amount;
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Payment % has no bill allocations', NEW.doc_number;
    END IF;

    IF v_sum <> NEW.total_amount THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Payment % total % does not equal its allocations %',
            NEW.doc_number, NEW.total_amount, v_sum;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_guard_supplier_payment_post() IS
    '#140: on draft → posted, locks allocated bills and requires posted/partial_paid, same supplier/company, amount ≤ current balance, sum = total_amount.';

DROP TRIGGER IF EXISTS trg_a_guard_supplier_payment_post ON public.supplier_payments;
CREATE TRIGGER trg_a_guard_supplier_payment_post
BEFORE UPDATE OF status ON public.supplier_payments
FOR EACH ROW
WHEN (NEW.status = 'posted' AND OLD.status = 'draft')
EXECUTE FUNCTION public.fn_guard_supplier_payment_post();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Deferred: a posted payment touched in this transaction must balance
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_check_supplier_payment_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payment_id UUID;
    v_pay        public.supplier_payments%ROWTYPE;
    v_sum        NUMERIC(14,2);
BEGIN
    IF TG_TABLE_NAME = 'supplier_payments' THEN
        v_payment_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        v_payment_id := OLD.payment_id;
    ELSE
        v_payment_id := NEW.payment_id;
    END IF;

    SELECT * INTO v_pay FROM public.supplier_payments WHERE id = v_payment_id;
    -- Payment gone (cascade delete) or not posted at commit → nothing to check
    IF NOT FOUND OR v_pay.status <> 'posted' THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_sum
      FROM public.supplier_payment_allocations WHERE payment_id = v_payment_id;

    IF v_sum <> v_pay.total_amount THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Posted payment % total % does not equal its allocations %',
            v_pay.doc_number, v_pay.total_amount, v_sum;
    END IF;

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_check_supplier_payment_balanced() IS
    '#140: deferred (commit-time) check that a posted supplier payment written in this transaction is fully allocated.';

DROP TRIGGER IF EXISTS trg_z_check_supplier_payment_balanced ON public.supplier_payments;
CREATE CONSTRAINT TRIGGER trg_z_check_supplier_payment_balanced
AFTER INSERT ON public.supplier_payments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW.status = 'posted')
EXECUTE FUNCTION public.fn_check_supplier_payment_balanced();

DROP TRIGGER IF EXISTS trg_z_check_supplier_payment_alloc_balanced ON public.supplier_payment_allocations;
CREATE CONSTRAINT TRIGGER trg_z_check_supplier_payment_alloc_balanced
AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payment_allocations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.fn_check_supplier_payment_balanced();

-- Trigger functions are not meant to be called directly.
REVOKE ALL ON FUNCTION public.fn_guard_supplier_payment_allocation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_guard_supplier_payment_post()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_check_supplier_payment_balanced()   FROM PUBLIC, anon, authenticated;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Read-only verification (run after applying):
--   SELECT tgname, tgrelid::regclass, tgdeferrable, tginitdeferred
--     FROM pg_trigger
--    WHERE tgname IN ('trg_a_guard_supplier_payment_allocation','trg_a_guard_supplier_payment_post',
--                     'trg_z_check_supplier_payment_balanced','trg_z_check_supplier_payment_alloc_balanced');
--
-- Existing posted payments that would NOT pass the balance rule (informational;
-- they are never re-checked unless their allocations are touched):
--   SELECT p.doc_number, p.total_amount, COALESCE(SUM(a.amount),0) AS allocated
--     FROM supplier_payments p LEFT JOIN supplier_payment_allocations a ON a.payment_id = p.id
--    WHERE p.status = 'posted'
--    GROUP BY p.id HAVING p.total_amount <> COALESCE(SUM(a.amount),0);
--
-- Rollback:
--   BEGIN;
--   DROP TRIGGER IF EXISTS trg_a_guard_supplier_payment_allocation     ON public.supplier_payment_allocations;
--   DROP TRIGGER IF EXISTS trg_z_check_supplier_payment_alloc_balanced ON public.supplier_payment_allocations;
--   DROP TRIGGER IF EXISTS trg_a_guard_supplier_payment_post           ON public.supplier_payments;
--   DROP TRIGGER IF EXISTS trg_z_check_supplier_payment_balanced       ON public.supplier_payments;
--   DROP FUNCTION IF EXISTS public.fn_guard_supplier_payment_allocation();
--   DROP FUNCTION IF EXISTS public.fn_guard_supplier_payment_post();
--   DROP FUNCTION IF EXISTS public.fn_check_supplier_payment_balanced();
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
