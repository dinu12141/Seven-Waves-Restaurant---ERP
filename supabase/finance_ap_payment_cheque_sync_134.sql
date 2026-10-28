-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE #134 — Supplier payment ⇄ cheque register sync (single owner)
-- Seven Waves Restaurant ERP                                   (NOT yet applied)
--
-- Apply order: #128 → #129 → #131 → #132 → #133 → #135 → #137 → #138 →
--              #134 → #134b → #134c → #136 → #139 (PART B after user approval)
--   * NEVER apply the post_supplier_payment()/trigger section of #130.
--   * This file is the single owner of trg_sync_supplier_payment_cheque /
--     trg_fn_sync_supplier_payment_cheque; #136 no longer defines them and
--     relies on this trigger firing on UPDATE OF cheque_date.
--
-- Preconditions (checked below — the migration RAISES instead of half-applying):
--   * post_supplier_payment() is the #128 body (posts via fn_fin_post_leg) and
--     trg_post_supplier_payment is a BEFORE trigger. If #130's AFTER-trigger
--     version is live, re-apply #128 §7 first.
--
-- What it does
--  1. finance_cheques.supplier_payment_id (FK) — explicit link, one live cheque
--     per payment (partial unique index). Backfills existing links.
--  2. trg_fn_sync_supplier_payment_cheque() — AFTER INSERT OR UPDATE on
--     supplier_payments, SECURITY DEFINER (procurement users have no write on
--     finance_cheques under #124 RLS):
--       • draft → posted (or inserted as posted): resolves the bank account from
--         the cashbook CREDIT leg #128 wrote. No leg → RAISE (GL was not
--         posted; the whole post rolls back). Issues a matching planned cheque
--         or registers a new 'issued' one. Company-scoped. Idempotent.
--       • cheque_no / cheque_date edited on a posted payment: re-syncs; a
--         changed cheque number voids the old cheque and registers the new one.
--       • posted → cancelled: voids the linked cheque (planned/issued/stale →
--         'cancelled'). If the cheque has CLEARED the cancel is REFUSED (money
--         has left the bank — record a bounce or a refund instead). A bounced
--         cheque is left as is (mark_cheque_bounced already cancelled the
--         payment).
--  3. mark_cheque_bounced(uuid, text) — same signature as #126 (no overload).
--     Cheques linked to a supplier payment (no voucher) were rejected with
--     "no linked voucher". Now: cheque → 'bounced', then the payment is
--     cancelled, so #128 mirror-reverses AP ledger, Dr bank / Cr 2000, supplier
--     balance and invoice paid status. Voucher cheques: #126 behaviour kept.
--     Vouchers posted by #134c (posting_version 'v3') are mirror-reversed with
--     fn_fin_reverse_source.
--  4. Purchase returns → GRN invoice balance due: fn_ap_refresh_invoice_paid
--     (same signature as #128) counts posted purchase returns of the invoice's
--     GRN as settlement (ap_invoices.credited_amount shows that part), so the
--     generated balance_due drops and the invoice can no longer be paid in
--     full. Refreshed on return post/cancel and when the invoice is posted
--     after the return. Also fixes p_payment_id = NULL dropping all payments.
--
-- Frontend: procurementService.ts no longer writes finance_cheques (Procurement
--   removed linkPaymentCheque). #136 §4a set_supplier_payment_cheque_date()
--   stamps cheque_date after the post; this trigger fires on UPDATE OF
--   cheque_date and follows it.
--
-- Re-runnable. Single transaction.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

SET LOCAL lock_timeout = '10s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Preconditions
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_src   TEXT;
    v_type  INT;
BEGIN
    SELECT p.prosrc INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'post_supplier_payment' AND p.pronargs = 0;
    IF v_src IS NULL OR v_src NOT LIKE '%fn_fin_post_leg%' OR v_src NOT LIKE '%fn_fin_reverse_source%' THEN
        RAISE EXCEPTION '#134 precondition: public.post_supplier_payment() is not the #128 version. Re-apply fix_grn_ap_double_entry_auto_post_128.sql §7 (and never the #130 section) first.';
    END IF;

    SELECT t.tgtype INTO v_type
      FROM pg_trigger t
     WHERE t.tgrelid = 'public.supplier_payments'::regclass
       AND t.tgname = 'trg_post_supplier_payment' AND NOT t.tgisinternal;
    IF v_type IS NULL OR (v_type & 2) = 0 THEN   -- bit 1 = BEFORE
        RAISE EXCEPTION '#134 precondition: trg_post_supplier_payment must be the #128 BEFORE UPDATE trigger.';
    END IF;

    IF to_regprocedure('public.fn_fin_post_leg(uuid,uuid,text,uuid,date,uuid,uuid,text,numeric,numeric)') IS NULL THEN
        RAISE EXCEPTION '#134 precondition: #128 helper fn_fin_post_leg is missing.';
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Explicit cheque ⇄ payment link
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.finance_cheques
    ADD COLUMN IF NOT EXISTS supplier_payment_id UUID
        REFERENCES public.supplier_payments(id) ON DELETE SET NULL;

-- Backfill: posted cheque payments ↔ voucher-less cheque with the same number,
-- company and amount (only when the match is unambiguous).
WITH cand AS (
    SELECT c.id AS cheque_id, p.id AS payment_id,
           COUNT(*) OVER (PARTITION BY p.id) AS n_per_pay,
           COUNT(*) OVER (PARTITION BY c.id) AS n_per_chq
      FROM public.supplier_payments p
      JOIN public.finance_cheques c
        ON c.cheque_no = TRIM(p.cheque_no)
       AND (c.company_id = p.company_id OR c.company_id IS NULL)
       AND c.voucher_id IS NULL
       AND c.supplier_payment_id IS NULL
       AND ABS(COALESCE(c.amount, 0) - COALESCE(p.total_amount, 0)) < 0.005
     WHERE COALESCE(p.payment_method, '') ILIKE '%cheque%'
       AND p.status IN ('posted', 'cancelled')
       AND NULLIF(TRIM(COALESCE(p.cheque_no, '')), '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.finance_cheques x WHERE x.supplier_payment_id = p.id)
)
UPDATE public.finance_cheques c
   SET supplier_payment_id = cand.payment_id
  FROM cand
 WHERE c.id = cand.cheque_id AND cand.n_per_pay = 1 AND cand.n_per_chq = 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_cheques_live_supplier_payment
    ON public.finance_cheques (supplier_payment_id)
 WHERE supplier_payment_id IS NOT NULL AND status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_finance_cheques_bank_no
    ON public.finance_cheques (bank_account_id, cheque_no);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Supplier payment → cheque register
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_supplier_payment_cheque ON public.supplier_payments;
DROP FUNCTION IF EXISTS public.trg_fn_sync_supplier_payment_cheque();

CREATE FUNCTION public.trg_fn_sync_supplier_payment_cheque()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_cheque  BOOLEAN := COALESCE(NEW.payment_method, '') ILIKE '%cheque%';
    v_no         TEXT    := NULLIF(TRIM(COALESCE(NEW.cheque_no, '')), '');
    v_old_status TEXT    := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END;
    v_old_no     TEXT    := CASE WHEN TG_OP = 'UPDATE' THEN NULLIF(TRIM(COALESCE(OLD.cheque_no, '')), '') END;
    v_posting    BOOLEAN := NEW.status = 'posted' AND v_old_status IS DISTINCT FROM 'posted';
    v_acc_id     UUID;
    v_sup_name   TEXT;
    v_chq        public.finance_cheques;
BEGIN
    -- Cheque currently linked to this payment (if any)
    SELECT * INTO v_chq
      FROM public.finance_cheques
     WHERE supplier_payment_id = NEW.id AND status <> 'cancelled'
     ORDER BY created_at
     LIMIT 1
     FOR UPDATE;

    -- ── posted → cancelled ──────────────────────────────────────────────────
    IF NEW.status = 'cancelled' THEN
        IF v_old_status = 'posted' AND v_chq.id IS NOT NULL THEN
            IF v_chq.status = 'cleared' THEN
                RAISE EXCEPTION 'CHEQUE_CLEARED: cheque % for payment % has already cleared the bank. Cancel is not allowed — record a supplier refund instead.',
                    v_chq.cheque_no, NEW.doc_number;
            END IF;
            IF v_chq.status IN ('planned', 'issued', 'stale') THEN
                UPDATE public.finance_cheques
                   SET status = 'cancelled',
                       cancelled_reason = COALESCE(NEW.cancel_reason, 'Supplier payment ' || NEW.doc_number || ' cancelled'),
                       updated_at = now()
                 WHERE id = v_chq.id;
            END IF;
            -- 'bounced': mark_cheque_bounced cancelled this payment; leave as is.
        END IF;
        RETURN NULL;
    END IF;

    IF NEW.status <> 'posted' THEN
        RETURN NULL;
    END IF;

    -- ── payment method / number no longer a cheque: void the old one ────────
    IF NOT v_is_cheque OR v_no IS NULL THEN
        IF v_chq.id IS NOT NULL THEN
            IF v_chq.status = 'cleared' THEN
                RAISE EXCEPTION 'CHEQUE_CLEARED: cheque % has cleared; payment % can no longer be changed.', v_chq.cheque_no, NEW.doc_number;
            END IF;
            UPDATE public.finance_cheques
               SET status = 'cancelled', cancelled_reason = 'Removed from payment ' || NEW.doc_number, updated_at = now()
             WHERE id = v_chq.id AND status IN ('planned', 'issued', 'stale');
        END IF;
        RETURN NULL;
    END IF;

    -- ── bank account #128 actually credited ─────────────────────────────────
    SELECT c.account_id INTO v_acc_id
      FROM public.finance_cashbook_entries c
      JOIN public.finance_accounts fa ON fa.id = c.account_id
     WHERE c.source_type = 'supplier_payment'
       AND c.source_id   = NEW.id
       AND c.credit_amount > 0
       AND c.description NOT LIKE 'REVERSAL%'
     ORDER BY c.created_at, c.id
     LIMIT 1;

    IF v_acc_id IS NULL THEN
        IF v_posting THEN
            RAISE EXCEPTION 'GL_MISSING: supplier payment % was posted without a cash/bank credit leg in finance_cashbook_entries; cheque % cannot be registered. Check that post_supplier_payment (#128) is the live trigger.',
                NEW.doc_number, v_no;
        END IF;
        -- Legacy payment posted before #128 (no legs): keep the linked cheque
        -- in step with header edits, otherwise nothing to resolve against.
        IF v_chq.id IS NOT NULL AND v_chq.cheque_no = v_no THEN
            UPDATE public.finance_cheques
               SET cheque_date = COALESCE(NEW.cheque_date, NEW.doc_date), updated_at = now()
             WHERE id = v_chq.id AND status IN ('planned', 'issued');
        END IF;
        RETURN NULL;
    END IF;

    -- ── cheque number changed: void the previous cheque ─────────────────────
    IF v_chq.id IS NOT NULL AND (v_chq.cheque_no IS DISTINCT FROM v_no OR v_chq.bank_account_id IS DISTINCT FROM v_acc_id) THEN
        IF v_chq.status IN ('cleared', 'bounced') THEN
            RAISE EXCEPTION 'CHEQUE_LOCKED: cheque % is %; the cheque number of payment % can no longer be changed.',
                v_chq.cheque_no, v_chq.status, NEW.doc_number;
        END IF;
        UPDATE public.finance_cheques
           SET status = 'cancelled',
               cancelled_reason = 'Replaced by cheque ' || v_no || ' on payment ' || NEW.doc_number,
               updated_at = now()
         WHERE id = v_chq.id;
        v_chq := NULL;
    END IF;

    -- ── unlinked planned/issued cheque with this number on this account ────
    IF v_chq.id IS NULL THEN
        SELECT * INTO v_chq
          FROM public.finance_cheques
         WHERE bank_account_id = v_acc_id
           AND cheque_no = v_no
           AND (company_id = NEW.company_id OR company_id IS NULL)
           AND supplier_payment_id IS NULL
           AND voucher_id IS NULL
           AND status IN ('planned', 'issued')
         ORDER BY (status = 'planned') DESC, created_at
         LIMIT 1
         FOR UPDATE;

        IF v_chq.id IS NULL AND EXISTS (
            SELECT 1 FROM public.finance_cheques
             WHERE bank_account_id = v_acc_id AND cheque_no = v_no
               AND (company_id = NEW.company_id OR company_id IS NULL)
               AND status <> 'cancelled')
        THEN
            RAISE EXCEPTION 'CHEQUE_IN_USE: cheque % on this bank account is already used by another payment or voucher.', v_no;
        END IF;
    END IF;

    SELECT name INTO v_sup_name FROM public.suppliers WHERE id = NEW.supplier_id;

    IF v_chq.id IS NOT NULL THEN
        IF v_chq.status IN ('planned', 'issued') THEN
            UPDATE public.finance_cheques
               SET status              = 'issued',
                   supplier_payment_id = NEW.id,
                   company_id          = COALESCE(company_id, NEW.company_id),
                   branch_id           = COALESCE(branch_id, NEW.branch_id),
                   amount              = NEW.total_amount,
                   cheque_date         = COALESCE(NEW.cheque_date, NEW.doc_date),
                   issued_to           = COALESCE(v_sup_name, 'Supplier'),
                   updated_at          = now()
             WHERE id = v_chq.id;
        END IF;
        -- cleared / bounced / stale cheques are never rewritten.
    ELSE
        INSERT INTO public.finance_cheques (
            company_id, branch_id, bank_account_id, supplier_payment_id,
            cheque_no, cheque_date, amount, issued_to, status,
            created_by, created_at, updated_at
        ) VALUES (
            NEW.company_id, NEW.branch_id, v_acc_id, NEW.id,
            v_no, COALESCE(NEW.cheque_date, NEW.doc_date),
            NEW.total_amount, COALESCE(v_sup_name, 'Supplier'), 'issued',
            COALESCE(auth.uid(), NEW.posted_by), now(), now()
        );
    END IF;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_fn_sync_supplier_payment_cheque() FROM PUBLIC, anon, authenticated;

-- AFTER: #128's BEFORE trigger has already written the cashbook legs; any
-- RAISE here rolls the post/cancel back as a whole.
CREATE TRIGGER trg_sync_supplier_payment_cheque
AFTER INSERT OR UPDATE OF status, cheque_no, cheque_date, payment_method ON public.supplier_payments
FOR EACH ROW
WHEN (NEW.status IN ('posted', 'cancelled'))
EXECUTE FUNCTION public.trg_fn_sync_supplier_payment_cheque();

COMMENT ON FUNCTION public.trg_fn_sync_supplier_payment_cheque() IS
  '#134 (supersedes #136 §1): supplier payment ⇄ finance_cheques sync. Issues/registers on post, re-syncs on cheque edits, voids on cancel, refuses cancel of a cleared cheque.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. mark_cheque_bounced — supplier-payment cheques (signature unchanged)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_cheque_bounced(p_cheque_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cheque   public.finance_cheques;
    v_voucher  public.finance_vouchers;
    v_pay      public.supplier_payments;
    v_user     UUID := auth.uid();
    v_delta    NUMERIC;
    v_cb_id    UUID;
BEGIN
    IF NOT (is_admin() OR is_finance()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only finance or admin can mark a cheque as bounced');
    END IF;

    SELECT * INTO v_cheque FROM public.finance_cheques WHERE id = p_cheque_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cheque not found');
    END IF;
    -- Branch scope: finance users only act on cheques of their own branches
    IF NOT is_admin()
       AND NOT (v_cheque.branch_id = ANY (COALESCE(public.auth_branch_ids(), ARRAY[]::uuid[]))) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authorised for this branch');
    END IF;
    IF v_cheque.status <> 'issued' THEN
        RETURN jsonb_build_object('success', false, 'error',
            format('Only issued cheques can be marked bounced (current status: %s)', v_cheque.status));
    END IF;

    -- ── Supplier-payment cheque: cancel the payment (#128 reverses the GL) ──
    IF v_cheque.voucher_id IS NULL AND v_cheque.supplier_payment_id IS NOT NULL THEN
        SELECT * INTO v_pay FROM public.supplier_payments WHERE id = v_cheque.supplier_payment_id FOR UPDATE;
        IF NOT FOUND OR v_pay.status <> 'posted' THEN
            RETURN jsonb_build_object('success', false, 'error',
                format('Linked supplier payment is not posted (status: %s) — nothing to reverse', COALESCE(v_pay.status, 'missing')));
        END IF;

        -- The payment must carry #128 GL legs, otherwise cancelling it cannot
        -- restore the bank (legacy payments: run #139 B4 first). Checked BEFORE
        -- anything changes.
        IF NOT EXISTS (SELECT 1 FROM public.finance_cashbook_entries c
                        WHERE c.source_type = 'supplier_payment' AND c.source_id = v_pay.id
                          AND c.credit_amount > 0 AND c.account_id IS NOT NULL
                          AND c.description NOT LIKE 'REVERSAL%') THEN
            RETURN jsonb_build_object('success', false, 'error',
                format('Supplier payment %s has no bank GL leg (posted before #128). Run the #139 backfill before marking its cheque bounced.', v_pay.doc_number));
        END IF;

        -- Flip the cheque first so the sync trigger leaves it 'bounced'.
        UPDATE public.finance_cheques
           SET status = 'bounced', bounced_reason = p_reason, bounced_by = v_user,
               bounced_at = now(), updated_at = now()
         WHERE id = p_cheque_id;

        UPDATE public.supplier_payments
           SET status = 'cancelled',
               cancel_reason = 'Cheque ' || v_cheque.cheque_no || ' bounced' || COALESCE(' — ' || p_reason, '')
         WHERE id = v_pay.id;

        SELECT c.id INTO v_cb_id
          FROM public.finance_cashbook_entries c
         WHERE c.source_type = 'supplier_payment' AND c.source_id = v_pay.id
           AND c.description LIKE 'REVERSAL%' AND c.debit_amount > 0
           AND c.account_id IS NOT NULL
         -- prefer the cheque's account; a backfill-linked cheque may sit on a
         -- different account than the leg #139 resolved — still the bank leg.
         ORDER BY (c.account_id = v_cheque.bank_account_id) DESC, c.created_at DESC
         LIMIT 1;
        IF v_cb_id IS NULL THEN
            RAISE EXCEPTION 'GL_MISSING: cancelling payment % produced no bank reversal leg.', v_pay.doc_number;
        END IF;

        UPDATE public.finance_cheques SET bounced_reversal_cashbook_id = v_cb_id WHERE id = p_cheque_id;

        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, severity, created_at)
        VALUES (v_user, 'cheque_bounced', 'finance_cheques', p_cheque_id,
                jsonb_build_object('cheque_no', v_cheque.cheque_no, 'amount', v_pay.total_amount,
                                   'supplier_payment_id', v_pay.id, 'doc_number', v_pay.doc_number,
                                   'reversal_cashbook_id', v_cb_id, 'reason', p_reason),
                'warning', now());

        RETURN jsonb_build_object('success', true, 'cheque_id', p_cheque_id, 'status', 'bounced',
                                  'supplier_payment_cancelled', v_pay.doc_number, 'reversal_cashbook_id', v_cb_id);
    END IF;

    -- ── Voucher cheque: #126 behaviour (unchanged) ──────────────────────────
    IF v_cheque.voucher_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cheque has no linked voucher or supplier payment — cannot reverse accounting effect');
    END IF;

    SELECT * INTO v_voucher FROM public.finance_vouchers WHERE id = v_cheque.voucher_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Linked voucher not found');
    END IF;

    -- Vouchers posted by #134c (balanced legs): mirror-reverse all legs.
    -- (to_jsonb: posting_version is added by #134c, which applies after #134.)
    IF to_jsonb(v_voucher) ->> 'posting_version' = 'v3' THEN
        PERFORM public.fn_fin_reverse_source(
            CASE WHEN v_voucher.voucher_type = 'pay' THEN 'pay_voucher' ELSE 'received_voucher' END,
            v_voucher.id, CURRENT_DATE, v_voucher.voucher_no || ' cheque ' || v_cheque.cheque_no || ' bounced');
        SELECT c.id INTO v_cb_id
          FROM public.finance_cashbook_entries c
         WHERE c.source_id = v_voucher.id AND c.description LIKE 'REVERSAL%'
         ORDER BY c.created_at DESC, c.id
         LIMIT 1;

        UPDATE public.finance_cheques
           SET status = 'bounced', bounced_reversal_cashbook_id = v_cb_id, bounced_reason = p_reason,
               bounced_by = v_user, bounced_at = now(), updated_at = now()
         WHERE id = p_cheque_id;

        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, severity, created_at)
        VALUES (v_user, 'cheque_bounced', 'finance_cheques', p_cheque_id,
                jsonb_build_object('cheque_no', v_cheque.cheque_no, 'amount', v_voucher.amount,
                                   'voucher_id', v_voucher.id, 'voucher_no', v_voucher.voucher_no,
                                   'reversal_cashbook_id', v_cb_id, 'reason', p_reason),
                'warning', now());

        RETURN jsonb_build_object('success', true, 'cheque_id', p_cheque_id, 'status', 'bounced',
                                  'reversal_cashbook_id', v_cb_id);
    END IF;

    -- Legacy voucher (#127 single-row posting): #126 behaviour.

    INSERT INTO public.finance_cashbook_entries (
        company_id, branch_id, source_type, source_id, entry_date,
        ledger_id, account_id, description, debit_amount, credit_amount, running_balance
    ) VALUES (
        v_voucher.company_id, v_voucher.branch_id, 'cheque_bounced', v_cheque.id, CURRENT_DATE,
        v_voucher.ledger_id, v_voucher.account_id,
        'Cheque ' || v_cheque.cheque_no || ' bounced — reversal of ' || v_voucher.voucher_no
            || COALESCE(' (' || p_reason || ')', ''),
        CASE WHEN v_voucher.voucher_type = 'received' THEN v_voucher.amount ELSE 0 END,
        CASE WHEN v_voucher.voucher_type = 'pay'      THEN v_voucher.amount ELSE 0 END,
        0
    ) RETURNING id INTO v_cb_id;

    v_delta := CASE WHEN v_voucher.voucher_type = 'pay' THEN v_voucher.amount ELSE -v_voucher.amount END;
    UPDATE public.finance_ledgers
       SET current_balance = COALESCE(current_balance, 0) + v_delta, updated_at = now()
     WHERE id = v_voucher.ledger_id;
    IF v_voucher.account_id IS NOT NULL THEN
        UPDATE public.finance_accounts
           SET current_balance = COALESCE(current_balance, 0) + v_delta, updated_at = now()
         WHERE id = v_voucher.account_id;
    END IF;
    IF v_voucher.bank_id IS NOT NULL AND v_voucher.bank_id IS DISTINCT FROM v_voucher.account_id THEN
        UPDATE public.finance_accounts
           SET current_balance = COALESCE(current_balance, 0) + v_delta, updated_at = now()
         WHERE id = v_voucher.bank_id;
    END IF;

    UPDATE public.finance_cheques
       SET status = 'bounced', bounced_reversal_cashbook_id = v_cb_id, bounced_reason = p_reason,
           bounced_by = v_user, bounced_at = now(), updated_at = now()
     WHERE id = p_cheque_id;

    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, severity, created_at)
    VALUES (v_user, 'cheque_bounced', 'finance_cheques', p_cheque_id,
            jsonb_build_object('cheque_no', v_cheque.cheque_no, 'amount', v_voucher.amount,
                               'voucher_id', v_voucher.id, 'voucher_no', v_voucher.voucher_no,
                               'reversal_cashbook_id', v_cb_id, 'reason', p_reason),
            'warning', now());

    RETURN jsonb_build_object('success', true, 'cheque_id', p_cheque_id, 'status', 'bounced',
                              'reversal_cashbook_id', v_cb_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_cheque_bounced(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_cheque_bounced(UUID, TEXT) TO authenticated;
COMMENT ON FUNCTION public.mark_cheque_bounced(UUID, TEXT) IS
  '#126 + #134: marks an issued cheque bounced. Voucher cheques: reverses the voucher effect. Supplier-payment cheques: cancels the payment so #128 mirror-reverses AP/bank/supplier balance/invoice status.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Purchase returns reduce the GRN invoice's balance due
--    A posted purchase return wrote a CREDIT_NOTE to ap_ledger and lowered the
--    supplier balance (#136 §3), but ap_invoices.paid_amount — and therefore
--    the generated balance_due = GREATEST(0, total_amount − paid_amount) — was
--    untouched, so the full invoice could still be paid (double settlement).
--    Now "paid_amount" = posted payment allocations + posted purchase returns
--    against the invoice's GRN (credited_amount shows the credit part). The
--    #128 helper is redefined with the SAME signature; it also no longer
--    drops every other posted payment when called with p_payment_id = NULL.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ap_invoices ADD COLUMN IF NOT EXISTS credited_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.fn_ap_refresh_invoice_paid(
    p_invoice_id      UUID,
    p_payment_id      UUID,
    p_include_payment BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_paid    NUMERIC;
    v_credit  NUMERIC := 0;
    v_total   NUMERIC;
    v_stat    TEXT;
    v_grn     UUID;
    v_settled NUMERIC;
BEGIN
    SELECT total_amount, status, grn_id INTO v_total, v_stat, v_grn
      FROM public.ap_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(a.amount), 0) INTO v_paid
      FROM public.supplier_payment_allocations a
      JOIN public.supplier_payments p ON p.id = a.payment_id
     WHERE a.invoice_id = p_invoice_id
       AND (
            (p.status = 'posted' AND p.id IS DISTINCT FROM p_payment_id)
         OR (p_include_payment AND p.id = p_payment_id)
       );

    -- Credit notes: posted purchase returns of this invoice's GRN. Only the
    -- GRN's one live invoice (#136 §1b) carries them.
    IF v_grn IS NOT NULL AND v_stat IN ('posted', 'partial_paid', 'paid') THEN
        SELECT COALESCE(SUM(r.total_amount), 0) INTO v_credit
          FROM public.purchase_returns r
         WHERE r.grn_id = v_grn AND r.status = 'posted';
    END IF;

    v_settled := v_paid + v_credit;

    UPDATE public.ap_invoices
       SET paid_amount     = v_settled,
           credited_amount = v_credit,
           status = CASE
               WHEN v_stat NOT IN ('posted', 'partial_paid', 'paid') THEN v_stat
               WHEN v_settled >= COALESCE(v_total, 0) - 0.005 AND COALESCE(v_total, 0) > 0 THEN 'paid'
               WHEN v_settled > 0 THEN 'partial_paid'
               ELSE 'posted'
           END
     WHERE id = p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ap_refresh_invoice_paid(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- Return posted / cancelled → refresh the GRN's live invoice
CREATE OR REPLACE FUNCTION public.trg_fn_purchase_return_refresh_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r RECORD;
BEGIN
    IF NEW.grn_id IS NULL THEN
        RETURN NULL;
    END IF;
    FOR r IN
        SELECT id FROM public.ap_invoices
         WHERE grn_id = NEW.grn_id AND status IN ('posted', 'partial_paid', 'paid')
    LOOP
        PERFORM public.fn_ap_refresh_invoice_paid(r.id, NULL, false);
    END LOOP;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_fn_purchase_return_refresh_invoice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_purchase_return_refresh_invoice ON public.purchase_returns;
CREATE TRIGGER trg_purchase_return_refresh_invoice
AFTER UPDATE OF status ON public.purchase_returns
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('posted', 'cancelled'))
EXECUTE FUNCTION public.trg_fn_purchase_return_refresh_invoice();

-- Invoice posted AFTER a return was posted against its GRN → apply the credit
CREATE OR REPLACE FUNCTION public.trg_fn_ap_invoice_apply_credits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.grn_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.purchase_returns WHERE grn_id = NEW.grn_id AND status = 'posted') THEN
        PERFORM public.fn_ap_refresh_invoice_paid(NEW.id, NULL, false);
    END IF;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_fn_ap_invoice_apply_credits() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ap_invoice_apply_credits ON public.ap_invoices;
CREATE TRIGGER trg_ap_invoice_apply_credits
AFTER UPDATE OF status ON public.ap_invoices
FOR EACH ROW
WHEN (NEW.status = 'posted' AND OLD.status IN ('draft', 'approved'))
EXECUTE FUNCTION public.trg_fn_ap_invoice_apply_credits();

-- One-off: invoices whose GRN already has posted returns
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT DISTINCT i.id FROM public.ap_invoices i
          JOIN public.purchase_returns pr ON pr.grn_id = i.grn_id AND pr.status = 'posted'
         WHERE i.status IN ('posted', 'partial_paid', 'paid')
    LOOP
        PERFORM public.fn_ap_refresh_invoice_paid(r.id, NULL, false);
    END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
